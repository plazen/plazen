/**
 * routineTasksService.ts
 *
 * Utilities for generating and managing user routine tasks.
 *
 * Responsibilities:
 * - Determine whether routine-generated tasks should be created for a given
 *   date and user's timezone.
 * - Generate routine tasks for "today" based on user timetable settings and
 *   active routine templates, persisting them into the `tasks` table.
 * - Provide CRUD helpers for routine task templates stored in `routine_tasks`.
 *
 * Exports (high-level):
 * - shouldGenerateRoutineTasksForToday(userId, dateString, timezoneOffset)
 * - autoGenerateRoutineTasksForToday(userId, dateString, timezoneOffset)
 * - getRoutineTasks(userId)
 * - createRoutineTask(userId, title, duration)
 * - updateRoutineTask(id, userId, data)
 * - deleteRoutineTask(id, userId)
 *
 * Behavioural notes:
 * - Titles and other sensitive strings are encrypted in the DB using the
 *   `encrypt`/`decrypt` helpers exported by `./encryption`.
 * - This module uses Prisma (`prisma`) for database operations; ensure the
 *   application supplies a configured Prisma client.
 * - The generation logic attempts to avoid duplicate routine-generated tasks
 *   for a given date by checking for existing generated tasks before creating new ones.
 *
 * Implementation notes:
 * - Time slots are chosen via a simple randomized (but non-overlapping) algorithm
 *   snapped to 15-minute increments. This is intended for usability rather than
 *   strict scheduling guarantees.
 */
import prisma from "./prisma";
import { encrypt, decrypt } from "./encryption"; // [MODIFIED] Import helpers

export interface RoutineTask {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface GeneratedTask {
  id: bigint;
  user_id: string;
  title: string;
  duration_minutes: number | null;
  is_time_sensitive: boolean;
  scheduled_time: Date | null;
  is_completed: boolean;
  created_at: Date;
}

/**
 * Check if routine tasks should be generated for the given date
 * Only generates for "today" based on user's timezone
 */
export async function shouldGenerateRoutineTasksForToday(
  userId: string,
  dateString: string,
  timezoneOffset: number,
): Promise<boolean> {
  // Calculate user's current date based on timezone offset
  const now = new Date();
  const userTime = new Date(now.getTime() - timezoneOffset * 60000);
  const userDateString = userTime.toISOString().split("T")[0];

  // Only generate for today
  if (dateString !== userDateString) {
    return false;
  }

  // Check if routine tasks have already been generated for this specific date
  // We'll check if any tasks are scheduled for the requested date with the routine pattern
  const requestedDateStart = new Date(dateString + "T00:00:00.000Z");
  const requestedDateEnd = new Date(dateString + "T23:59:59.999Z");

  const existingGeneratedTasks = await prisma.tasks.findFirst({
    where: {
      user_id: userId,
      scheduled_time: {
        gte: requestedDateStart,
        lte: requestedDateEnd,
      },
      is_from_routine: true, // [MODIFIED] Use the new boolean flag
    },
  });

  return !existingGeneratedTasks;
}

/**
 * Automatically generate routine tasks for today
 */
export async function autoGenerateRoutineTasksForToday(
  userId: string,
  dateString: string,
  timezoneOffset: number,
): Promise<GeneratedTask[]> {
  const shouldGenerate = await shouldGenerateRoutineTasksForToday(
    userId,
    dateString,
    timezoneOffset,
  );

  if (!shouldGenerate) {
    return [];
  }

  // Get user's timetable settings
  const userSettings = await prisma.userSettings.findFirst({
    where: {
      user_id: userId,
    },
  });

  // Default to 8 AM - 6 PM if no settings found
  const timetableStart = userSettings?.timetable_start || 8;
  const timetableEnd = userSettings?.timetable_end || 18;

  // Get user's active routine tasks
  const routineTasks = await prisma.routine_tasks.findMany({
    where: {
      user_id: userId,
      is_active: true,
    },
  });

  if (routineTasks.length === 0) {
    return [];
  }

  const generatedTasks: GeneratedTask[] = [];
  const usedTimeSlots: { start: number; end: number }[] = [];

  for (const routineTask of routineTasks) {
    const startTime = generateRandomTimeSlot(
      routineTask.duration_minutes,
      usedTimeSlots,
      timetableStart,
      timetableEnd,
    );
    const endTime = startTime + routineTask.duration_minutes;

    usedTimeSlots.push({ start: startTime, end: endTime });

    const scheduledDateTime = new Date(dateString + "T00:00:00.000Z");
    scheduledDateTime.setMinutes(scheduledDateTime.getMinutes() + startTime);

    const decryptedTitle = decrypt(routineTask.title);
    const encryptedTitle = encrypt(decryptedTitle);

    const createdTask = await prisma.tasks.create({
      data: {
        user_id: userId,
        title: encryptedTitle,
        duration_minutes: routineTask.duration_minutes,
        is_time_sensitive: true,
        scheduled_time: scheduledDateTime,
        is_completed: false,
        is_from_routine: true,
      },
    });

    generatedTasks.push({
      ...createdTask,
      title: decrypt(createdTask.title),
    });
  }

  return generatedTasks;
}

function generateRandomTimeSlot(
  duration: number,
  usedTimeSlots: { start: number; end: number }[],
  timetableStartHour: number,
  timetableEndHour: number,
): number {
  const dayStartMinutes = timetableStartHour * 60;
  const dayEndMinutes = timetableEndHour * 60;
  const maxAttempts = 100;

  const snapTo15Minutes = (minutes: number): number => {
    const remainder = minutes % 15;
    if (remainder === 0) return minutes;
    return minutes - remainder + (remainder > 7 ? 15 : 0);
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const latestStart = dayEndMinutes - duration;
    const randomStart = Math.floor(
      Math.random() * (latestStart - dayStartMinutes) + dayStartMinutes,
    );

    const snappedStart = snapTo15Minutes(randomStart);

    if (
      snappedStart < dayStartMinutes ||
      snappedStart + duration > dayEndMinutes
    ) {
      continue;
    }

    const hasOverlap = usedTimeSlots.some(
      (slot) =>
        !(snappedStart >= slot.end || snappedStart + duration <= slot.start),
    );

    if (!hasOverlap) {
      return snappedStart;
    }
  }

  return snapTo15Minutes(dayStartMinutes);
}

export async function getRoutineTasks(userId: string): Promise<RoutineTask[]> {
  const tasks = await prisma.routine_tasks.findMany({
    where: {
      user_id: userId,
      is_active: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return tasks.map((task) => ({
    ...task,
    title: decrypt(task.title),
  }));
}

export async function createRoutineTask(
  userId: string,
  title: string,
  duration: number,
): Promise<RoutineTask> {
  const encryptedTitle = encrypt(title);

  const createdTask = await prisma.routine_tasks.create({
    data: {
      user_id: userId,
      title: encryptedTitle,
      duration_minutes: duration,
      is_active: true,
    },
  });

  return {
    ...createdTask,
    title: decrypt(createdTask.title),
  };
}

export async function updateRoutineTask(
  id: string,
  userId: string,
  data: { title?: string; duration_minutes?: number; is_active?: boolean },
): Promise<RoutineTask | null> {
  if (data.title !== undefined) {
    data.title = encrypt(data.title);
  }

  const updatedTask = await prisma.routine_tasks.update({
    where: {
      id,
      user_id: userId,
    },
    data,
  });

  if (updatedTask) {
    return {
      ...updatedTask,
      title: decrypt(updatedTask.title),
    };
  }
  return null;
}

export async function deleteRoutineTask(
  id: string,
  userId: string,
): Promise<RoutineTask | null> {
  const deletedTask = await prisma.routine_tasks.delete({
    where: {
      id,
      user_id: userId,
    },
  });

  if (deletedTask) {
    return {
      ...deletedTask,
      title: decrypt(deletedTask.title),
    };
  }
  return null;
}
