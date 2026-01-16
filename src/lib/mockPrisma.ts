/**
 * mockPrisma.ts
 *
 * A mock Prisma client that uses in-memory storage.
 * This mimics the Prisma client API for all models used in the application.
 *
 * Used when DEV_MODE=true to allow running without a database.
 */

import memoryStore, {
  Task,
  UserSettings,
  RoutineTask,
  CalendarSource,
  ExternalEvent,
  Profile,
  Subscription,
  SupportTicket,
  SupportTicketMessage,
  SupportLabel,
  ReleaseNote,
  DocumentationEntry,
  Notification,
  User,
} from "./memoryStore";

// Helper for filtering with Prisma-like where clauses
type WhereClause<T> = Partial<T> & {
  OR?: WhereClause<T>[];
  AND?: WhereClause<T>[];
  NOT?: WhereClause<T>;
  [key: string]:
    | unknown
    | {
        gte?: unknown;
        lte?: unknown;
        lt?: unknown;
        gt?: unknown;
        in?: unknown[];
        contains?: string;
      };
};

function matchesWhere<T extends Record<string, unknown>>(
  item: T,
  where: WhereClause<T>,
): boolean {
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      const orConditions = condition as WhereClause<T>[];
      if (!orConditions.some((c) => matchesWhere(item, c))) return false;
      continue;
    }
    if (key === "AND") {
      const andConditions = condition as WhereClause<T>[];
      if (!andConditions.every((c) => matchesWhere(item, c))) return false;
      continue;
    }
    if (key === "NOT") {
      if (matchesWhere(item, condition as WhereClause<T>)) return false;
      continue;
    }

    const itemValue = item[key];

    if (
      condition &&
      typeof condition === "object" &&
      !Array.isArray(condition) &&
      !(condition instanceof Date)
    ) {
      const cond = condition as {
        gte?: unknown;
        lte?: unknown;
        lt?: unknown;
        gt?: unknown;
        in?: unknown[];
        contains?: string;
      };

      // Type assertions for comparison operations
      const val = itemValue as number | Date | string;
      if (cond.gte !== undefined && !(val >= (cond.gte as typeof val)))
        return false;
      if (cond.lte !== undefined && !(val <= (cond.lte as typeof val)))
        return false;
      if (cond.lt !== undefined && !(val < (cond.lt as typeof val)))
        return false;
      if (cond.gt !== undefined && !(val > (cond.gt as typeof val)))
        return false;
      if (cond.in !== undefined && !cond.in.includes(itemValue)) return false;
      if (
        cond.contains !== undefined &&
        typeof itemValue === "string" &&
        !itemValue.includes(cond.contains)
      )
        return false;
    } else {
      if (itemValue !== condition) return false;
    }
  }
  return true;
}

// Sort helper
function sortItems<T>(
  items: T[],
  orderBy?:
    | { [key: string]: "asc" | "desc" }
    | { [key: string]: "asc" | "desc" }[],
): T[] {
  if (!orderBy) return items;

  const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];

  return [...items].sort((a, b) => {
    for (const order of orderByArray) {
      for (const [key, direction] of Object.entries(order)) {
        const aVal = (a as Record<string, unknown>)[key];
        const bVal = (b as Record<string, unknown>)[key];

        if (aVal === bVal) continue;
        if (aVal === null || aVal === undefined)
          return direction === "asc" ? -1 : 1;
        if (bVal === null || bVal === undefined)
          return direction === "asc" ? 1 : -1;

        const comparison = aVal < bVal ? -1 : 1;
        return direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
}

// Generic model operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createModelOperations<T extends Record<string, any>>(
  getStore: () => Map<string | bigint, T>,
  getIdField: () => string,
  generateId: () => string | bigint,
) {
  return {
    findMany: async (args?: {
      where?: WhereClause<T>;
      orderBy?:
        | { [key: string]: "asc" | "desc" }
        | { [key: string]: "asc" | "desc" }[];
      include?: Record<string, boolean | object>;
      take?: number;
      skip?: number;
    }): Promise<T[]> => {
      let items = Array.from(getStore().values());

      if (args?.where) {
        items = items.filter((item) =>
          matchesWhere(item as T & Record<string, unknown>, args.where!),
        );
      }

      items = sortItems(items, args?.orderBy);

      if (args?.skip) {
        items = items.slice(args.skip);
      }
      if (args?.take) {
        items = items.slice(0, args.take);
      }

      return items;
    },

    findUnique: async (args: {
      where: Partial<T>;
      include?: Record<string, boolean | object>;
    }): Promise<T | null> => {
      const idField = getIdField();
      const store = getStore();

      // Check if we're querying by the primary key directly
      const idValue = (args.where as Record<string, unknown>)[idField];
      if (idValue !== undefined) {
        return store.get(idValue as string | bigint) || null;
      }

      // Otherwise search through all items
      for (const item of store.values()) {
        if (
          matchesWhere(
            item as T & Record<string, unknown>,
            args.where as WhereClause<T>,
          )
        ) {
          return item;
        }
      }
      return null;
    },

    findFirst: async (args?: {
      where?: WhereClause<T>;
      orderBy?: { [key: string]: "asc" | "desc" };
      include?: Record<string, boolean | object>;
    }): Promise<T | null> => {
      let items = Array.from(getStore().values());

      if (args?.where) {
        items = items.filter((item) =>
          matchesWhere(item as T & Record<string, unknown>, args.where!),
        );
      }

      if (args?.orderBy) {
        items = sortItems(items, args.orderBy);
      }

      return items[0] || null;
    },

    create: async (args: {
      data: Partial<T> & Record<string, unknown>;
    }): Promise<T> => {
      const idField = getIdField();
      const store = getStore();
      const id =
        (args.data as Record<string, unknown>)[idField] ?? generateId();

      const item = {
        ...args.data,
        [idField]: id,
        created_at:
          (args.data as Record<string, unknown>).created_at ?? new Date(),
        updated_at: new Date(),
      } as unknown as T;

      store.set(id as string | bigint, item);
      return item;
    },

    update: async (args: {
      where: Partial<T>;
      data: Partial<T>;
    }): Promise<T> => {
      const idField = getIdField();
      const store = getStore();
      const idValue = (args.where as Record<string, unknown>)[idField];

      let item: T | undefined;
      if (idValue !== undefined) {
        item = store.get(idValue as string | bigint);
      } else {
        // Find by other criteria
        for (const i of store.values()) {
          if (
            matchesWhere(
              i as T & Record<string, unknown>,
              args.where as WhereClause<T>,
            )
          ) {
            item = i;
            break;
          }
        }
      }

      if (!item) {
        throw new Error(`Record not found for update`);
      }

      const updated = {
        ...item,
        ...args.data,
        updated_at: new Date(),
      } as T;

      const itemId = (item as Record<string, unknown>)[idField] as
        | string
        | bigint;
      store.set(itemId, updated);
      return updated;
    },

    upsert: async (args: {
      where: Partial<T>;
      create: Partial<T> & Record<string, unknown>;
      update: Partial<T>;
    }): Promise<T> => {
      const existing = await createModelOperations(
        getStore,
        getIdField,
        generateId,
      ).findUnique({
        where: args.where,
      });

      if (existing) {
        return createModelOperations(getStore, getIdField, generateId).update({
          where: args.where,
          data: args.update,
        });
      } else {
        return createModelOperations(getStore, getIdField, generateId).create({
          data: args.create,
        });
      }
    },

    delete: async (args: { where: Partial<T> }): Promise<T> => {
      const idField = getIdField();
      const store = getStore();
      const idValue = (args.where as Record<string, unknown>)[idField];

      let item: T | undefined;
      let itemId: string | bigint | undefined;

      if (idValue !== undefined) {
        item = store.get(idValue as string | bigint);
        itemId = idValue as string | bigint;
      } else {
        for (const [id, i] of store.entries()) {
          if (
            matchesWhere(
              i as T & Record<string, unknown>,
              args.where as WhereClause<T>,
            )
          ) {
            item = i;
            itemId = id;
            break;
          }
        }
      }

      if (!item || itemId === undefined) {
        throw new Error(`Record not found for delete`);
      }

      store.delete(itemId);
      return item;
    },

    deleteMany: async (args?: {
      where?: WhereClause<T>;
    }): Promise<{ count: number }> => {
      const store = getStore();
      let count = 0;

      if (!args?.where) {
        count = store.size;
        store.clear();
        return { count };
      }

      const toDelete: (string | bigint)[] = [];
      for (const [id, item] of store.entries()) {
        if (matchesWhere(item as T & Record<string, unknown>, args.where)) {
          toDelete.push(id);
        }
      }

      for (const id of toDelete) {
        store.delete(id);
        count++;
      }

      return { count };
    },

    count: async (args?: { where?: WhereClause<T> }): Promise<number> => {
      if (!args?.where) {
        return getStore().size;
      }

      let count = 0;
      for (const item of getStore().values()) {
        if (matchesWhere(item as T & Record<string, unknown>, args.where)) {
          count++;
        }
      }
      return count;
    },
  };
}

// Special handling for tasks with BigInt IDs
const tasksOperations = {
  ...createModelOperations<Task>(
    () => memoryStore.tasks,
    () => "id",
    () => memoryStore.getNextTaskId(),
  ),

  findMany: async (args?: {
    where?: WhereClause<Task>;
    orderBy?:
      | { [key: string]: "asc" | "desc" }
      | { [key: string]: "asc" | "desc" }[];
    include?: Record<string, boolean | object>;
  }): Promise<Task[]> => {
    let items = Array.from(memoryStore.tasks.values());

    if (args?.where) {
      items = items.filter((item) => {
        // Handle nested where clauses like { source: { user_id: ... } }
        const where = args.where as Record<string, unknown>;
        for (const [key, condition] of Object.entries(where)) {
          if (key === "user_id" && item.user_id !== condition) return false;
          if (key === "id" && item.id !== condition) return false;
          if (
            key === "scheduled_time" &&
            condition &&
            typeof condition === "object"
          ) {
            const cond = condition as { gte?: Date; lt?: Date };
            if (
              cond.gte &&
              item.scheduled_time &&
              item.scheduled_time < cond.gte
            )
              return false;
            if (
              cond.lt &&
              item.scheduled_time &&
              item.scheduled_time >= cond.lt
            )
              return false;
          }
        }
        return true;
      });
    }

    items = sortItems(items, args?.orderBy);
    return items;
  },
};

// External events with source relation
const externalEventsOperations = {
  ...createModelOperations<ExternalEvent>(
    () => memoryStore.externalEvents,
    () => "id",
    () => memoryStore.generateId(),
  ),

  findMany: async (args?: {
    where?: WhereClause<ExternalEvent> & { source?: { user_id?: string } };
    orderBy?: { [key: string]: "asc" | "desc" };
    include?: { source?: boolean };
  }): Promise<(ExternalEvent & { source?: CalendarSource })[]> => {
    let items = Array.from(memoryStore.externalEvents.values());

    if (args?.where) {
      items = items.filter((item) => {
        const where = args.where as Record<string, unknown>;

        // Handle nested source.user_id filter
        if (where.source && typeof where.source === "object") {
          const sourceCondition = where.source as { user_id?: string };
          if (sourceCondition.user_id) {
            const source = memoryStore.calendarSources.get(item.source_id);
            if (!source || source.user_id !== sourceCondition.user_id)
              return false;
          }
        }

        // Handle start_time filter
        if (where.start_time && typeof where.start_time === "object") {
          const cond = where.start_time as { gte?: Date; lt?: Date };
          if (cond.gte && item.start_time < cond.gte) return false;
          if (cond.lt && item.start_time >= cond.lt) return false;
        }

        return true;
      });
    }

    // Include source relation if requested
    if (args?.include?.source) {
      return items.map((item) => ({
        ...item,
        source: memoryStore.calendarSources.get(item.source_id)!,
      }));
    }

    return items;
  },
};

// Calendar sources with events relation
const calendarSourcesOperations = {
  ...createModelOperations<CalendarSource>(
    () => memoryStore.calendarSources,
    () => "id",
    () => memoryStore.generateId(),
  ),

  findMany: async (args?: {
    where?: WhereClause<CalendarSource>;
    orderBy?: { [key: string]: "asc" | "desc" };
    include?: { events?: boolean };
  }): Promise<(CalendarSource & { events?: ExternalEvent[] })[]> => {
    let items = Array.from(memoryStore.calendarSources.values());

    if (args?.where) {
      items = items.filter((item) =>
        matchesWhere(
          item as CalendarSource & Record<string, unknown>,
          args.where!,
        ),
      );
    }

    items = sortItems(items, args?.orderBy);

    if (args?.include?.events) {
      return items.map((source) => ({
        ...source,
        events: Array.from(memoryStore.externalEvents.values()).filter(
          (e) => e.source_id === source.id,
        ),
      }));
    }

    return items;
  },

  findUnique: async (args: {
    where: Partial<CalendarSource>;
    include?: { events?: boolean };
  }): Promise<(CalendarSource & { events?: ExternalEvent[] }) | null> => {
    const idValue = (args.where as Record<string, unknown>).id;
    const source = idValue
      ? memoryStore.calendarSources.get(idValue as string)
      : null;

    if (!source) return null;

    if (args.include?.events) {
      return {
        ...source,
        events: Array.from(memoryStore.externalEvents.values()).filter(
          (e) => e.source_id === source.id,
        ),
      };
    }

    return source;
  },
};

// Support tickets with relations
const supportTicketsOperations = {
  ...createModelOperations<SupportTicket>(
    () => memoryStore.supportTickets,
    () => "id",
    () => memoryStore.generateId(),
  ),

  findMany: async (args?: {
    where?: WhereClause<SupportTicket>;
    orderBy?: { [key: string]: "asc" | "desc" };
    include?: {
      messages?: boolean;
      labels?: { include?: { label?: boolean } };
      users?: boolean;
    };
  }): Promise<
    (SupportTicket & {
      messages?: SupportTicketMessage[];
      labels?: { label: SupportLabel }[];
      users?: User;
    })[]
  > => {
    let items = Array.from(memoryStore.supportTickets.values());

    if (args?.where) {
      items = items.filter((item) =>
        matchesWhere(
          item as SupportTicket & Record<string, unknown>,
          args.where!,
        ),
      );
    }

    items = sortItems(items, args?.orderBy);

    return items.map((ticket) => {
      const result: SupportTicket & {
        messages?: SupportTicketMessage[];
        labels?: { label: SupportLabel }[];
        users?: User;
      } = { ...ticket };

      if (args?.include?.messages) {
        result.messages = Array.from(
          memoryStore.supportTicketMessages.values(),
        ).filter((m) => m.ticket_id === ticket.id);
      }

      if (args?.include?.labels) {
        const ticketLabelIds = memoryStore.supportTicketLabels
          .filter((tl) => tl.ticket_id === ticket.id)
          .map((tl) => tl.label_id);
        result.labels = ticketLabelIds
          .map((labelId) => {
            const label = memoryStore.supportLabels.get(labelId);
            return label ? { label } : null;
          })
          .filter((l): l is { label: SupportLabel } => l !== null);
      }

      if (args?.include?.users) {
        result.users = memoryStore.users.get(ticket.user_id);
      }

      return result;
    });
  },

  findUnique: async (args: {
    where: Partial<SupportTicket>;
    include?: {
      messages?: boolean | { orderBy?: { created_at?: "asc" | "desc" } };
      labels?: { include?: { label?: boolean } };
      users?: boolean;
    };
  }): Promise<
    | (SupportTicket & {
        messages?: SupportTicketMessage[];
        labels?: { label: SupportLabel }[];
        users?: User;
      })
    | null
  > => {
    const idValue = (args.where as Record<string, unknown>).id;
    const ticket = idValue
      ? memoryStore.supportTickets.get(idValue as string)
      : null;

    if (!ticket) return null;

    const result: SupportTicket & {
      messages?: SupportTicketMessage[];
      labels?: { label: SupportLabel }[];
      users?: User;
    } = { ...ticket };

    if (args.include?.messages) {
      let messages = Array.from(
        memoryStore.supportTicketMessages.values(),
      ).filter((m) => m.ticket_id === ticket.id);
      if (
        typeof args.include.messages === "object" &&
        args.include.messages.orderBy?.created_at
      ) {
        messages = sortItems(messages, {
          created_at: args.include.messages.orderBy.created_at,
        });
      }
      result.messages = messages;
    }

    if (args.include?.labels) {
      const ticketLabelIds = memoryStore.supportTicketLabels
        .filter((tl) => tl.ticket_id === ticket.id)
        .map((tl) => tl.label_id);
      result.labels = ticketLabelIds
        .map((labelId) => {
          const label = memoryStore.supportLabels.get(labelId);
          return label ? { label } : null;
        })
        .filter((l): l is { label: SupportLabel } => l !== null);
    }

    if (args.include?.users) {
      result.users = memoryStore.users.get(ticket.user_id);
    }

    return result;
  },
};

/**
 * Mock Prisma client that uses in-memory storage.
 * Implements the same API as the real Prisma client.
 */
export const mockPrisma = {
  // Auth schema
  users: createModelOperations<User>(
    () => memoryStore.users,
    () => "id",
    () => memoryStore.generateId(),
  ),

  // Public schema
  tasks: tasksOperations,

  userSettings: createModelOperations<UserSettings>(
    () => memoryStore.userSettings,
    () => "user_id", // UserSettings uses user_id as unique key
    () => memoryStore.generateId(),
  ),

  routineTasks: createModelOperations<RoutineTask>(
    () => memoryStore.routineTasks,
    () => "id",
    () => memoryStore.generateId(),
  ),

  routine_tasks: createModelOperations<RoutineTask>(
    () => memoryStore.routineTasks,
    () => "id",
    () => memoryStore.generateId(),
  ),

  calendar_sources: calendarSourcesOperations,

  external_events: externalEventsOperations,

  profiles: createModelOperations<Profile>(
    () => memoryStore.profiles,
    () => "id",
    () => memoryStore.generateId(),
  ),

  subscription: createModelOperations<Subscription>(
    () => memoryStore.subscriptions,
    () => "user_id", // Subscription uses user_id as unique key
    () => memoryStore.generateId(),
  ),

  support_tickets: supportTicketsOperations,

  support_ticket_messages: createModelOperations<SupportTicketMessage>(
    () => memoryStore.supportTicketMessages,
    () => "id",
    () => memoryStore.generateId(),
  ),

  support_labels: createModelOperations<SupportLabel>(
    () => memoryStore.supportLabels,
    () => "id",
    () => memoryStore.generateId(),
  ),

  support_tickets_labels: {
    create: async (args: { data: { ticket_id: string; label_id: string } }) => {
      memoryStore.supportTicketLabels.push(args.data);
      return args.data;
    },
    delete: async (args: {
      where: { ticket_id_label_id: { ticket_id: string; label_id: string } };
    }) => {
      const { ticket_id, label_id } = args.where.ticket_id_label_id;
      const index = memoryStore.supportTicketLabels.findIndex(
        (tl) => tl.ticket_id === ticket_id && tl.label_id === label_id,
      );
      if (index !== -1) {
        memoryStore.supportTicketLabels.splice(index, 1);
      }
      return { ticket_id, label_id };
    },
    deleteMany: async (args?: { where?: { ticket_id?: string } }) => {
      if (!args?.where) {
        const count = memoryStore.supportTicketLabels.length;
        memoryStore.supportTicketLabels = [];
        return { count };
      }
      const before = memoryStore.supportTicketLabels.length;
      memoryStore.supportTicketLabels = memoryStore.supportTicketLabels.filter(
        (tl) => tl.ticket_id !== args.where?.ticket_id,
      );
      return { count: before - memoryStore.supportTicketLabels.length };
    },
  },

  release_notes: createModelOperations<ReleaseNote>(
    () => memoryStore.releaseNotes,
    () => "id",
    () => memoryStore.generateId(),
  ),

  documentation_entries: createModelOperations<DocumentationEntry>(
    () => memoryStore.documentationEntries,
    () => "id",
    () => memoryStore.generateId(),
  ),

  notifications: createModelOperations<Notification>(
    () => memoryStore.notifications,
    () => "id",
    () => memoryStore.generateId(),
  ),

  // Transaction support (simplified - just executes sequentially)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: async <T>(
    operations: Promise<T>[] | ((tx: any) => Promise<T>),
  ): Promise<T[]> => {
    if (typeof operations === "function") {
      // For transaction callbacks, we pass a reference to the mock client
      // This is set up after the object is created
      const result = await operations(mockPrismaRef);
      return [result];
    }
    return Promise.all(operations);
  },

  // Connection methods (no-op for mock)
  $connect: async () => {},
  $disconnect: async () => {},

  // Raw query (not supported in mock - return empty)
  $queryRaw: async () => [],
  $executeRaw: async () => 0,
};

// Self-reference for $transaction callbacks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockPrismaRef: any = mockPrisma;

export default mockPrisma;
