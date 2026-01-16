/**
 * memoryStore.ts
 *
 * In-memory storage for dev mode. This replaces the PostgreSQL database
 * when running without Supabase/database configuration.
 *
 * All data is stored in memory and will be reset when the server restarts.
 * The store is pre-seeded with default data for the dev user.
 */

import { DEV_USER_ID, DEV_USER_EMAIL } from "./devMode";

// Type definitions matching Prisma schema
export interface Task {
  id: bigint;
  user_id: string;
  created_at: Date;
  title: string;
  duration_minutes: number | null;
  is_time_sensitive: boolean;
  scheduled_time: Date | null;
  is_completed: boolean;
  is_from_routine: boolean;
}

export interface UserSettings {
  id: string;
  user_id: string;
  timetable_start: number;
  timetable_end: number;
  show_time_needle: boolean;
  created_at: Date;
  updated_at: Date;
  theme: string | null;
  email_updates: boolean | null;
  notifications: boolean | null;
  telegram_id: string | null;
  timezone_offset: string | null;
}

export interface RoutineTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CalendarSource {
  id: string;
  user_id: string;
  name: string;
  url: string;
  username: string | null;
  password: string | null;
  color: string;
  type: string;
  created_at: Date;
  updated_at: Date;
  last_synced_at: Date | null;
}

export interface ExternalEvent {
  id: string;
  source_id: string;
  uid: string;
  title: string;
  description: string | null;
  start_time: Date;
  end_time: Date;
  all_day: boolean;
  location: string | null;
  url: string | null;
}

export interface Profile {
  id: string;
  role: "USER" | "ADMIN" | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  is_pro: boolean;
  provider: string;
  subscription_id: string | null;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  priority: string;
  title: string;
  status: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: boolean;
  created_at: Date;
}

export interface SupportLabel {
  id: string;
  name: string;
  color: string;
}

export interface SupportTicketLabel {
  ticket_id: string;
  label_id: string;
}

export interface ReleaseNote {
  id: string;
  version: string | null;
  topic: string | null;
  text: string | null;
  date: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface DocumentationEntry {
  id: string;
  topic: string | null;
  text: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface Notification {
  id: string;
  message: string | null;
  show: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export interface User {
  id: string;
  email: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  raw_user_meta_data: Record<string, unknown> | null;
}

// Helper to generate UUIDs
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Auto-incrementing ID for tasks
let taskIdCounter = BigInt(1);

/**
 * In-memory data store.
 * Stores all application data when running in dev mode.
 */
class MemoryStore {
  // Auth schema tables (minimal - just what we need)
  users: Map<string, User> = new Map();

  // Public schema tables
  tasks: Map<bigint, Task> = new Map();
  userSettings: Map<string, UserSettings> = new Map();
  routineTasks: Map<string, RoutineTask> = new Map();
  calendarSources: Map<string, CalendarSource> = new Map();
  externalEvents: Map<string, ExternalEvent> = new Map();
  profiles: Map<string, Profile> = new Map();
  subscriptions: Map<string, Subscription> = new Map();
  supportTickets: Map<string, SupportTicket> = new Map();
  supportTicketMessages: Map<string, SupportTicketMessage> = new Map();
  supportLabels: Map<string, SupportLabel> = new Map();
  supportTicketLabels: SupportTicketLabel[] = [];
  releaseNotes: Map<string, ReleaseNote> = new Map();
  documentationEntries: Map<string, DocumentationEntry> = new Map();
  notifications: Map<string, Notification> = new Map();

  constructor() {
    this.seedData();
  }

  /**
   * Seed the store with initial data for the dev user.
   */
  private seedData() {
    const now = new Date();

    // Create the dev user in auth.users
    this.users.set(DEV_USER_ID, {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      created_at: now,
      updated_at: now,
      raw_user_meta_data: {
        full_name: "Local Developer",
      },
    });

    // Create default user settings
    const settingsId = generateUUID();
    this.userSettings.set(DEV_USER_ID, {
      id: settingsId,
      user_id: DEV_USER_ID,
      timetable_start: 8,
      timetable_end: 18,
      show_time_needle: true,
      created_at: now,
      updated_at: now,
      theme: "dark",
      email_updates: true,
      notifications: true,
      telegram_id: null,
      timezone_offset: null,
    });

    // Create admin profile for dev user
    this.profiles.set(DEV_USER_ID, {
      id: DEV_USER_ID,
      role: "ADMIN",
    });

    // Create a pro subscription for dev user
    const subscriptionId = generateUUID();
    this.subscriptions.set(DEV_USER_ID, {
      id: subscriptionId,
      user_id: DEV_USER_ID,
      is_pro: true,
      provider: "dev",
      subscription_id: "dev-subscription",
      starts_at: now,
      ends_at: null,
      created_at: now,
      updated_at: now,
    });

    // Add some sample tasks for today
    const today = new Date();
    today.setHours(10, 0, 0, 0);

    this.createTask({
      user_id: DEV_USER_ID,
      title: "Welcome to Plazen Dev Mode!",
      duration_minutes: 30,
      is_time_sensitive: true,
      scheduled_time: today,
      is_completed: false,
      is_from_routine: false,
    });

    const task2Time = new Date(today);
    task2Time.setHours(14, 0, 0, 0);
    this.createTask({
      user_id: DEV_USER_ID,
      title: "Explore the schedule view",
      duration_minutes: 60,
      is_time_sensitive: true,
      scheduled_time: task2Time,
      is_completed: false,
      is_from_routine: false,
    });

    // Add a sample routine task
    const routineId = generateUUID();
    this.routineTasks.set(routineId, {
      id: routineId,
      user_id: DEV_USER_ID,
      title: "Daily standup",
      description: "Team sync meeting",
      duration_minutes: 15,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    // Add sample release note
    const releaseNoteId = generateUUID();
    this.releaseNotes.set(releaseNoteId, {
      id: releaseNoteId,
      version: "1.0.0",
      topic: "Dev Mode Support",
      text: "You can now run Plazen without a database using DEV_MODE=true",
      date: now,
      created_at: now,
      updated_at: now,
    });

    // Add sample documentation
    const docId = generateUUID();
    this.documentationEntries.set(docId, {
      id: docId,
      topic: "Getting Started",
      text: "Welcome to Plazen! This is your task scheduling assistant.",
      category: "General",
      created_at: now,
      updated_at: now,
    });

    // Add sample notification
    const notifId = generateUUID();
    this.notifications.set(notifId, {
      id: notifId,
      message: "Running in Dev Mode - no database required!",
      show: true,
      created_at: now,
      updated_at: now,
    });

    // Add sample support labels
    const labelBug = generateUUID();
    const labelFeature = generateUUID();
    this.supportLabels.set(labelBug, {
      id: labelBug,
      name: "bug",
      color: "#ef4444",
    });
    this.supportLabels.set(labelFeature, {
      id: labelFeature,
      name: "feature",
      color: "#22c55e",
    });
  }

  /**
   * Create a new task and return it.
   */
  createTask(
    data: Omit<Task, "id" | "created_at">,
  ): Task {
    const task: Task = {
      id: taskIdCounter++,
      created_at: new Date(),
      ...data,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Generate a new UUID for use as an ID.
   */
  generateId(): string {
    return generateUUID();
  }

  /**
   * Get the next task ID (for BigInt IDs).
   */
  getNextTaskId(): bigint {
    return taskIdCounter++;
  }

  /**
   * Reset the store to initial state (useful for testing).
   */
  reset() {
    this.users.clear();
    this.tasks.clear();
    this.userSettings.clear();
    this.routineTasks.clear();
    this.calendarSources.clear();
    this.externalEvents.clear();
    this.profiles.clear();
    this.subscriptions.clear();
    this.supportTickets.clear();
    this.supportTicketMessages.clear();
    this.supportLabels.clear();
    this.supportTicketLabels = [];
    this.releaseNotes.clear();
    this.documentationEntries.clear();
    this.notifications.clear();
    taskIdCounter = BigInt(1);
    this.seedData();
  }
}

// Global singleton instance
declare global {
  var memoryStore: MemoryStore | undefined;
}

// Use global to persist across hot reloads in development
export const memoryStore = global.memoryStore || new MemoryStore();

if (process.env.NODE_ENV === "development") {
  global.memoryStore = memoryStore;
}

export default memoryStore;
