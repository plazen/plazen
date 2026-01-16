import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, selectedRoutineTaskIds } = body;

    if (
      !date ||
      !selectedRoutineTaskIds ||
      !Array.isArray(selectedRoutineTaskIds)
    ) {
      return NextResponse.json(
        {
          error: "Date and selected routine task IDs are required",
        },
        { status: 400 }
      );
    }

    // Get the selected routine tasks
    const routineTasks = await prisma.routine_tasks.findMany({
      where: {
        id: { in: selectedRoutineTaskIds },
        user_id: session.user.id,
        is_active: true,
      },
    });

    if (routineTasks.length === 0) {
      return NextResponse.json(
        {
          error: "No valid routine tasks found",
        },
        { status: 400 }
      );
    }

    // Get user's timetable settings
    const userSettings = await prisma.userSettings.findUnique({
      where: { user_id: session.user.id },
    });

    const timetableStartHour = userSettings?.timetable_start ?? 8;
    const timetableEndHour = userSettings?.timetable_end ?? 18;

    const scheduleDay = new Date(date);
    const timetableStart = new Date(scheduleDay);
    timetableStart.setHours(timetableStartHour, 0, 0, 0);

    const timetableEnd = new Date(scheduleDay);
    timetableEnd.setHours(timetableEndHour, 0, 0, 0);

    // Get existing tasks for the day
    const existingTasks = await prisma.tasks.findMany({
      where: {
        user_id: session.user.id,
        scheduled_time: {
          gte: timetableStart,
          lt: timetableEnd,
        },
      },
      orderBy: { scheduled_time: "asc" },
    });

    // Helper functions for time calculations
    function parseLocalDateTimeArr(
      str: string
    ): [number, number, number, number, number, number] {
      const [datePart, timePart] = str.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, minute, second] = timePart.split(":").map(Number);
      return [year, month, day, hour, minute, second];
    }

    function toMinutes(
      arr: [number, number, number, number, number, number]
    ): number {
      return arr[3] * 60 + arr[4] + arr[5] / 60;
    }

    function compareDateTimeArr(
      a: [number, number, number, number, number, number],
      b: [number, number, number, number, number, number]
    ): number {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    }

    // Calculate occupied slots
    const occupiedSlots: {
      start: [number, number, number, number, number, number];
      end: [number, number, number, number, number, number];
    }[] = existingTasks
      .filter((task) => task.scheduled_time)
      .map((task) => {
        const iso = (task.scheduled_time as Date)
          .toISOString()
          .replace(/\..*$/, "")
          .replace("Z", "");
        const arr = parseLocalDateTimeArr(iso) as [
          number,
          number,
          number,
          number,
          number,
          number
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

    // Calculate free slots
    const freeSlots: {
      start: [number, number, number, number, number, number];
      end: [number, number, number, number, number, number];
    }[] = [];

    let lastEventEnd: [number, number, number, number, number, number] = [
      timetableStart.getFullYear(),
      timetableStart.getMonth() + 1,
      timetableStart.getDate(),
      timetableStart.getHours(),
      timetableStart.getMinutes(),
      timetableStart.getSeconds(),
    ];

    occupiedSlots.forEach((slot) => {
      if (compareDateTimeArr(slot.start, lastEventEnd) > 0) {
        freeSlots.push({ start: lastEventEnd, end: slot.start });
      }
      lastEventEnd =
        compareDateTimeArr(lastEventEnd, slot.end) > 0
          ? lastEventEnd
          : slot.end;
    });

    const timetableEndArr: [number, number, number, number, number, number] = [
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

    // Shuffle routine tasks for randomization
    const shuffledRoutineTasks = [...routineTasks].sort(
      () => Math.random() - 0.5
    );

    const createdTasks = [];
    const updatedOccupiedSlots = [...occupiedSlots];

    // Try to schedule each routine task
    for (const routineTask of shuffledRoutineTasks) {
      const taskDuration = routineTask.duration_minutes;

      // Find available slots for this task
      let availableSlots = freeSlots.filter(
        (slot) =>
          toMinutes(
            slot.end as [number, number, number, number, number, number]
          ) -
            toMinutes(
              slot.start as [number, number, number, number, number, number]
            ) >=
          taskDuration
      );

      // Remove slots that are now occupied by previously scheduled routine tasks
      availableSlots = availableSlots.filter((freeSlot) => {
        return !updatedOccupiedSlots.some((occupiedSlot) => {
          const freeStart = toMinutes(
            freeSlot.start as [number, number, number, number, number, number]
          );
          const freeEnd = toMinutes(
            freeSlot.end as [number, number, number, number, number, number]
          );
          const occStart = toMinutes(occupiedSlot.start);
          const occEnd = toMinutes(occupiedSlot.end);

          // Check if the occupied slot overlaps with the free slot
          return freeStart < occEnd && freeEnd > occStart;
        });
      });

      if (availableSlots.length > 0) {
        const randomSlot =
          availableSlots[Math.floor(Math.random() * availableSlots.length)];
        const minStart = randomSlot.start as [
          number,
          number,
          number,
          number,
          number,
          number
        ];
        const maxStartMinutes =
          toMinutes(
            randomSlot.end as [number, number, number, number, number, number]
          ) - taskDuration;
        const minStartMinutes = toMinutes(minStart);

        if (maxStartMinutes > minStartMinutes) {
          // Generate possible 15-min aligned start times
          const possibleStarts: [
            number,
            number,
            number,
            number,
            number,
            number
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

            // Check for overlap with all occupied slots
            const startMins = mins;
            const endMins = startMins + taskDuration;
            let overlaps = false;
            for (const occ of updatedOccupiedSlots) {
              const occStartMins = toMinutes(occ.start);
              const occEndMins = toMinutes(occ.end);
              if (
                (startMins < occEndMins && endMins > occStartMins) ||
                startMins === occStartMins
              ) {
                overlaps = true;
                break;
              }
            }
            if (!overlaps) possibleStarts.push(startArr);
          }

          if (possibleStarts.length > 0) {
            const chosen =
              possibleStarts[Math.floor(Math.random() * possibleStarts.length)];
            const scheduledTime = `${chosen[0]}-${String(chosen[1]).padStart(
              2,
              "0"
            )}-${String(chosen[2]).padStart(2, "0")}T${String(
              chosen[3]
            ).padStart(2, "0")}:${String(chosen[4]).padStart(2, "0")}:${String(
              chosen[5]
            ).padStart(2, "0")}.000Z`;

            const decryptedTitle = decrypt(routineTask.title);
            const encryptedTitle = encrypt(decryptedTitle);

            const newTask = await prisma.tasks.create({
              data: {
                user_id: session.user.id,
                title: encryptedTitle,
                duration_minutes: routineTask.duration_minutes,
                is_time_sensitive: false,
                scheduled_time: scheduledTime,
                is_completed: false,
                is_from_routine: true,
              },
            });

            createdTasks.push({
              ...newTask,
              id: newTask.id.toString(),
              title: decrypt(newTask.title),
            });

            const endArr: [number, number, number, number, number, number] = [
              ...chosen,
            ];
            endArr[4] += taskDuration;
            while (endArr[4] >= 60) {
              endArr[3] += 1;
              endArr[4] -= 60;
            }
            updatedOccupiedSlots.push({ start: chosen, end: endArr });
          }
        }
      }
    }

    return NextResponse.json(
      {
        message: `Successfully created ${createdTasks.length} routine tasks`,
        tasks: createdTasks,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error generating routine tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
