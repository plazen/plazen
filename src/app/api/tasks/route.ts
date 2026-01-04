/*
 * API: /api/tasks
 *
 * Endpoints:
 * - GET /api/tasks?date=YYYY-MM-DD&timezoneOffset=<minutes>
 *   - Returns tasks and external events for the authenticated user.
 *   - If `date` is provided, the handler may auto-generate routine tasks for that date.
 *   - Supports filtering by date and timezone offset to adjust serialized timestamps.
 *
 * - POST /api/tasks
 *   - Create a new task. Body expects title and scheduling info. For non-time-sensitive
 *     tasks the server will attempt to select a free timeslot based on the user's timetable
 *     and existing tasks/events.
 *
 * - PATCH /api/tasks
 *   - Update an existing task (mark completed, reschedule, or update title). Titles are
 *     encrypted at rest; when updating the title the server will encrypt it before saving.
 *
 * - DELETE /api/tasks
 *   - Delete a task owned by the authenticated user. External events are read-only.
 *
 * Authentication:
 * - All methods require an authenticated Supabase session validated server-side.
 *
 * Notes:
 * - Titles are stored encrypted and decrypted for responses.
 * - The handlers use Prisma for DB access and employ careful timezone normalization to
 *   avoid accidental shifts when working with local date strings.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  shouldGenerateRoutineTasksForToday,
  autoGenerateRoutineTasksForToday,
} from "@/lib/routineTasksService";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.delete({ name, ...options });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const timezoneOffset = parseInt(searchParams.get("timezoneOffset") || "0");

  console.log("🔍 API GET /api/tasks - Requested date:", date);

  try {
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (date) {
      const parsedDate = new Date(date);
      if (!Number.isNaN(parsedDate.getTime())) {
        rangeStart = new Date(parsedDate);
        rangeEnd = new Date(parsedDate);

        // Normalize to UTC boundaries to avoid timezone drift
        rangeStart.setUTCHours(0, 0, 0, 0);
        rangeEnd.setUTCHours(0, 0, 0, 0);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

        // Prevent exceeding the supported Date range (year < 10000)
        if (rangeEnd.getUTCFullYear() >= 10000) {
          rangeEnd = new Date("9999-12-31T23:59:59.999Z");
        }
      }
    } else {
      console.log("📊 API GET /api/tasks - Returning all tasks for user");
    }

    // Auto-generate routine tasks for the specific date if it's requested and needed
    if (date) {
      const shouldGenerate = await shouldGenerateRoutineTasksForToday(
        session.user.id,
        date,
        timezoneOffset,
      );
      if (shouldGenerate) {
        console.log("🔄 Auto-generating routine tasks for date:", date);
        const generatedTasks = await autoGenerateRoutineTasksForToday(
          session.user.id,
          date,
          timezoneOffset,
        );
        console.log(`🔄 Generated ${generatedTasks.length} routine tasks`);
      }
    }

    const tasks = await prisma.tasks.findMany({
      where: {
        user_id: session.user.id,
        ...(rangeStart && rangeEnd
          ? {
              scheduled_time: {
                gte: rangeStart,
                lt: rangeEnd,
              },
            }
          : {}),
      },
      orderBy: { created_at: "asc" },
    });
    // External events are fetched from the DB cache immediately.
    // CalDAV sync is triggered separately by the frontend to avoid blocking.
    const externalEvents = await prisma.external_events.findMany({
      where: {
        source: { user_id: session.user.id },
        ...(rangeStart && rangeEnd
          ? {
              start_time: {
                gte: rangeStart,
                lt: rangeEnd,
              },
            }
          : {}),
      },
      include: { source: true },
    });

    console.log(
      "📊 API GET /api/tasks - Total tasks found in range:",
      tasks.length,
    );
    console.log(
      "📅 API GET /api/tasks - Date range:",
      rangeStart?.toISOString(),
      "to",
      rangeEnd?.toISOString(),
    );
    if (date) {
      console.log("🎯 API GET /api/tasks - Requested date:", date);
    }

    let filteredTasks = tasks;
    if (date) {
      console.log("🎯 API GET /api/tasks - Filtering by date:", date);
      filteredTasks = tasks.filter((task) => {
        if (!task.scheduled_time) return false;

        // Extract the date part directly from the ISO string to avoid timezone conversion
        const taskDateTime = task.scheduled_time as Date;
        const isoString = taskDateTime.toISOString();

        // Extract date part from ISO string (YYYY-MM-DD)
        const taskDateString = isoString.split("T")[0];

        console.log(
          `📝 Task "${decrypt(task.title)}" - scheduled_time:`, // [MODIFIED] Decrypt for logging
          taskDateTime,
          "-> date string:",
          taskDateString,
          "matches:",
          taskDateString === date,
        );

        return taskDateString === date;
      });
      console.log(
        "✅ API GET /api/tasks - Filtered tasks count:",
        filteredTasks.length,
      );
    }

    const serializableTasks = filteredTasks.map((task) => ({
      ...task,
      id: task.id.toString(),
      title: decrypt(task.title),
      is_external: false,
    }));

    const adjustToLocalISOString = (date: Date) => {
      if (Number.isFinite(timezoneOffset)) {
        const adjusted = new Date(date.getTime() - timezoneOffset * 60 * 1000);
        return adjusted.toISOString();
      }
      return date.toISOString();
    };

    const serializableExternalEvents = externalEvents.map((event) => {
      const durationMs = event.end_time.getTime() - event.start_time.getTime();
      return {
        id: `ext_${event.id}`,
        title: event.title,
        is_time_sensitive: true,
        duration_minutes: Math.round(durationMs / 60000),
        scheduled_time: adjustToLocalISOString(event.start_time),
        is_completed: false,
        is_from_routine: false,
        is_external: true, // Mark as external
        color: event.source.color,
        description: event.description,
      };
    });

    return NextResponse.json(
      [...serializableTasks, ...serializableExternalEvents],
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    let scheduledTime = null;
    if (body.scheduled_time) {
      // Keep as string and format as fake ISO to prevent timezone conversion
      let iso = body.scheduled_time;
      // If input is 'YYYY-MM-DDTHH:mm:ss', add '.000Z'
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso)) {
        iso = iso + ".000Z";
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
        iso = iso + ":00.000Z";
      }
      scheduledTime = iso;
    }

    if (!body.is_time_sensitive) {
      const userSettings = await prisma.userSettings.findUnique({
        where: { user_id: session.user.id },
      });

      const timetableStartHour = userSettings?.timetable_start ?? 8;
      const timetableEndHour = userSettings?.timetable_end ?? 18;

      const scheduleDay = new Date(body.for_date);

      const timetableStart = new Date(scheduleDay);
      timetableStart.setHours(timetableStartHour, 0, 0, 0);

      const timetableEnd = new Date(scheduleDay);
      timetableEnd.setHours(timetableEndHour, 0, 0, 0);

      // Compute full-day bounds so we fetch any task/event that falls on the day,
      // not only those inside the user's timetable window. This ensures occupiedSlots
      // includes all potential overlaps (early-morning, late-night, external events, etc).
      const dayStart = new Date(scheduleDay);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduleDay);
      dayEnd.setHours(23, 59, 59, 999);

      const existingTasks = await prisma.tasks.findMany({
        where: {
          user_id: session.user.id,
          scheduled_time: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        orderBy: { scheduled_time: "asc" },
      });

      function parseLocalDateTimeArr(
        str: string,
      ): [number, number, number, number, number, number] {
        const [datePart, timePart] = str.split("T");
        const [year, month, day] = datePart.split("-").map(Number);
        const [hour, minute, second] = timePart.split(":").map(Number);
        return [year, month, day, hour, minute, second];
      }
      function toMinutes(
        arr: [number, number, number, number, number, number],
      ): number {
        return arr[3] * 60 + arr[4] + arr[5] / 60;
      }
      function compareDateTimeArr(
        a: [number, number, number, number, number, number],
        b: [number, number, number, number, number, number],
      ): number {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return a[i] - b[i];
        }
        return 0;
      }

      // Include both user tasks and external events as occupied slots for the day,
      // then sort them. This ensures we check against ANY task/event that occupies time.
      // Also include external events for the whole day (not limited to the timetable),
      // so external events that start outside the timetable but overlap the new task
      // are considered when building occupiedSlots.
      const externalEventsForDay = await prisma.external_events.findMany({
        where: {
          source: { user_id: session.user.id },
          start_time: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        include: { source: true },
      });

      const taskSlots: {
        start: [number, number, number, number, number, number];
        end: [number, number, number, number, number, number];
      }[] = existingTasks
        .filter((task) => task.scheduled_time)
        .map((task) => {
          // Use the Date object's local getters to extract the local Y/M/D/H/M/S components.
          const d = task.scheduled_time as Date;
          const arr: [number, number, number, number, number, number] = [
            d.getUTCFullYear(),
            d.getUTCMonth() + 1,
            d.getUTCDate(),
            d.getUTCHours(),
            d.getUTCMinutes(),
            d.getUTCSeconds(),
          ];
          const duration = task.duration_minutes || 60;
          const endArr: [number, number, number, number, number, number] = [
            ...arr,
          ];
          endArr[4] += duration; // add minutes
          while (endArr[4] >= 60) {
            endArr[3] += 1;
            endArr[4] -= 60;
          }
          return { start: arr, end: endArr };
        });

      const externalSlots: {
        start: [number, number, number, number, number, number];
        end: [number, number, number, number, number, number];
      }[] = externalEventsForDay.map((ev) => {
        const s = ev.start_time as Date;
        const e = ev.end_time as Date;
        const arr: [number, number, number, number, number, number] = [
          s.getUTCFullYear(),
          s.getUTCMonth() + 1,
          s.getUTCDate(),
          s.getUTCHours(),
          s.getUTCMinutes(),
          s.getUTCSeconds(),
        ];
        // Prefer explicit duration if present, otherwise compute from start/end
        const duration =
          ((ev as any).duration_minutes ??
            Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000))) ||
          60;
        const endArr: [number, number, number, number, number, number] = [
          ...arr,
        ];
        endArr[4] += duration; // add minutes
        while (endArr[4] >= 60) {
          endArr[3] += 1;
          endArr[4] -= 60;
        }
        return { start: arr, end: endArr };
      });

      const occupiedSlots: {
        start: [number, number, number, number, number, number];
        end: [number, number, number, number, number, number];
      }[] = [...taskSlots, ...externalSlots].sort((a, b) => {
        // sort by start minutes to ensure free slot calculation is correct
        return toMinutes(a.start) - toMinutes(b.start);
      });

      // Create numeric intervals (minutes since midnight) for easier, robust overlap checks.
      // Use Math.floor for start and Math.ceil for end to ensure we treat any partial-minute
      // occupation as blocking the entire minute and avoid accidental touching issues.
      const occupiedIntervals: { start: number; end: number }[] =
        occupiedSlots.map((s) => {
          return {
            start: Math.floor(toMinutes(s.start)),
            end: Math.ceil(toMinutes(s.end)),
          };
        });

      const freeSlots: {
        start: [number, number, number, number, number, number];
        end: [number, number, number, number, number, number];
      }[] = [];
      // timetableStart is a Date, convert to [y,m,d,h,m,s]
      let lastEventEnd: [number, number, number, number, number, number] = [
        timetableStart.getFullYear(),
        timetableStart.getMonth() + 1,
        timetableStart.getDate(),
        timetableStart.getHours(),
        timetableStart.getMinutes(),
        timetableStart.getSeconds(),
      ];
      if (body.is_for_today && body.user_current_time) {
        const userCurrentArr = parseLocalDateTimeArr(
          body.user_current_time,
        ) as [number, number, number, number, number, number];
        if (compareDateTimeArr(userCurrentArr, lastEventEnd) > 0) {
          lastEventEnd = userCurrentArr;
        }
      }

      occupiedSlots.forEach(
        (slot: {
          start: [number, number, number, number, number, number];
          end: [number, number, number, number, number, number];
        }) => {
          if (compareDateTimeArr(slot.start, lastEventEnd) > 0) {
            freeSlots.push({ start: lastEventEnd, end: slot.start });
          }
          // max of lastEventEnd and slot.end
          lastEventEnd =
            compareDateTimeArr(lastEventEnd, slot.end) > 0
              ? lastEventEnd
              : slot.end;
        },
      );

      // timetableEnd is a Date, convert to [y,m,d,h,m,s]
      const timetableEndArr: [number, number, number, number, number, number] =
        [
          timetableEnd.getFullYear(),
          timetableEnd.getMonth() + 1,
          timetableEnd.getDate(),
          timetableEnd.getHours(),
          timetableEnd.getMinutes(),
          timetableEnd.getSeconds(),
        ];
      if (compareDateTimeArr(lastEventEnd, timetableEndArr) < 0) {
        freeSlots.push({ start: lastEventEnd, end: timetableEndArr });
      }

      const taskDuration = body.duration_minutes || 60;
      let availableSlots = freeSlots.filter(
        (slot) =>
          toMinutes(
            slot.end as [number, number, number, number, number, number],
          ) -
            toMinutes(
              slot.start as [number, number, number, number, number, number],
            ) >=
          taskDuration,
      );
      if (body.is_for_today && body.user_current_time) {
        const nowArr = parseLocalDateTimeArr(body.user_current_time) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        availableSlots = availableSlots.filter(
          (slot) =>
            compareDateTimeArr(
              slot.end as [number, number, number, number, number, number],
              nowArr,
            ) > 0,
        );
      }

      if (availableSlots.length > 0) {
        const randomSlot =
          availableSlots[Math.floor(Math.random() * availableSlots.length)];
        let minStart: [number, number, number, number, number, number] =
          randomSlot.start as [number, number, number, number, number, number];
        if (body.is_for_today && body.user_current_time) {
          const nowArr = parseLocalDateTimeArr(body.user_current_time) as [
            number,
            number,
            number,
            number,
            number,
            number,
          ];
          if (compareDateTimeArr(nowArr, minStart) > 0) minStart = nowArr;
        }
        const maxStartMinutes =
          toMinutes(
            randomSlot.end as [number, number, number, number, number, number],
          ) - taskDuration;
        const minStartMinutes = toMinutes(minStart);

        if (maxStartMinutes > minStartMinutes) {
          // Generate all possible 15-min aligned start times in the slot
          const possibleStarts: [
            number,
            number,
            number,
            number,
            number,
            number,
          ][] = [];
          for (
            let mins = Math.ceil(minStartMinutes / 15) * 15;
            mins <= maxStartMinutes;
            mins += 15
          ) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const s = 0;
            const startArr: [number, number, number, number, number, number] = [
              ...minStart,
            ];
            startArr[3] = h;
            startArr[4] = m;
            startArr[5] = s;
            // Strict overlap checks:
            // - new start must NOT fall strictly inside any existing occupied slot
            // - new end must NOT fall strictly inside any existing occupied slot
            // - no existing start or end may fall strictly inside the new task interval
            // - disallow identical starts (avoid duplicate simultaneous tasks)
            const startMins = mins;
            const endMins = startMins + taskDuration;
            let overlaps = false;
            // Use the precomputed numeric occupied intervals for robust overlap detection.
            // Any intersection or touching boundary is considered a conflict:
            // - if the new interval intersects or touches an existing interval -> disallow.
            for (const occ of occupiedIntervals) {
              const occStartMins = occ.start;
              const occEndMins = occ.end;

              // If intervals intersect or touch at boundaries, treat as overlap.
              // (i.e. NOT (newEnd <= occStart || newStart >= occEnd))
              if (!(endMins <= occStartMins || startMins >= occEndMins)) {
                overlaps = true;
                break;
              }
            }
            if (!overlaps) possibleStarts.push(startArr);
          }
          if (possibleStarts.length > 0) {
            const chosen =
              possibleStarts[Math.floor(Math.random() * possibleStarts.length)];

            scheduledTime = `${chosen[0]}-${String(chosen[1]).padStart(
              2,
              "0",
            )}-${String(chosen[2]).padStart(2, "0")}T${String(
              chosen[3],
            ).padStart(2, "0")}:${String(chosen[4]).padStart(2, "0")}:${String(
              chosen[5],
            ).padStart(2, "0")}.000Z`;
          }
        }
      }
    }

    // [MODIFIED] Encrypt the title before saving
    const encryptedTitle = encrypt(body.title);

    const newTask = await prisma.tasks.create({
      data: {
        user_id: session.user.id,
        title: encryptedTitle, // [MODIFIED] Save encrypted title
        duration_minutes: body.duration_minutes || 60,
        is_time_sensitive: body.is_time_sensitive,
        scheduled_time: scheduledTime,
        is_completed: false,
        is_from_routine: false, // [MODIFIED] Set default
      },
    });

    // [MODIFIED] Decrypt the title for the response
    const serializableNewTask = {
      ...newTask,
      id: newTask.id.toString(),
      title: decrypt(newTask.title),
    };

    return NextResponse.json(serializableNewTask, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, is_completed, scheduled_time, title } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 },
      );
    }

    if (typeof id === "string" && id.startsWith("ext_")) {
      return NextResponse.json(
        { error: "External events are read-only" },
        { status: 400 },
      );
    }

    const dataToUpdate: {
      is_completed?: boolean;
      scheduled_time?: Date;
      is_time_sensitive?: boolean;
      title?: string;
    } = {};

    if (typeof is_completed === "boolean") {
      dataToUpdate.is_completed = is_completed;
    }

    // [MODIFIED] Encrypt title if it's being updated
    if (title && typeof title === "string") {
      dataToUpdate.title = encrypt(title.trim());
    }

    if (scheduled_time) {
      // Format as fake ISO string: YYYY-MM-DDTHH:mm:ss.000Z (do not shift time)
      let iso = scheduled_time;
      // If input is 'YYYY-MM-DDTHH:mm', add ':00.000Z'
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
        iso = iso + ":00.000Z";
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso)) {
        iso = iso + ".000Z";
      }
      dataToUpdate.scheduled_time = iso;
      dataToUpdate.is_time_sensitive = true;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json(
        { error: "No update data provided" },
        { status: 400 },
      );
    }

    const updatedTask = await prisma.tasks.update({
      where: {
        id: BigInt(id),
        user_id: session.user.id,
      },
      data: dataToUpdate,
    });

    // [MODIFIED] Decrypt title for the response
    const serializableUpdatedTask = {
      ...updatedTask,
      id: updatedTask.id.toString(),
      title: decrypt(updatedTask.title),
    };

    return NextResponse.json(serializableUpdatedTask, { status: 200 });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 },
      );
    }

    if (typeof id === "string" && id.startsWith("ext_")) {
      return NextResponse.json(
        { error: "External events are read-only" },
        { status: 400 },
      );
    }

    await prisma.tasks.delete({
      where: {
        id: BigInt(id),
        user_id: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Task deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
