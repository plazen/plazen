/**
 * calDavService.ts
 *
 * CalDAV calendar synchronisation utilities.
 *
 * Responsibilities:
 * - Initialise CalDAV clients (with base-URL fallbacks) and fetch calendars/events.
 * - Parse and normalise iCalendar data into application-friendly Date objects.
 * - Upsert remote events into the `external_events` table and remove stale events
 *   within the synced range when appropriate.
 * - Emit structured log entries via an optional `onLog` callback to aid tracing
 *   and observability from background jobs.
 *
 * Exports:
 * - `syncCalendarSource(sourceId, options?)` — primary entry point to sync a single
 *   calendar source stored in the application's `calendar_sources` table.
 *
 * Behavioural notes:
 * - This module is defensive: it prefers range-based fetches where supported and
 *   falls back to broader queries when necessary. Per-calendar failures are
 *   logged and do not abort the whole sync process.
 * - Credentials persisted in the DB are expected to be encrypted; callers should
 *   ensure the decryption key is configured. This helper will call `decrypt`.
 *
 * Usage:
 * - Intended for background jobs or API handlers that orchestrate sync runs.
 */
import { CalDAVClient } from "ts-caldav";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

type CalDavEvent = {
  uid?: string | null;
  summary?: string | null;
  description?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  allDay?: boolean | null;
  location?: string | null;
  url?: string | null;
  start?: string | Date | null;
  end?: string | Date | null;
  calendarData?: string | null;
  data?: string | null;
};

type LogLevel = "info" | "warn" | "error";

export type SyncLogEntry = {
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
};

export type SyncCalendarOptions = {
  onLog?: (entry: SyncLogEntry) => void;
  expectedUserId?: string;
  rangeStart?: Date;
  rangeEnd?: Date;
};

type LogFn = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) => void;

/**
 * Synchronise a CalDAV calendar source into the application's `external_events`.
 *
 * High-level behaviour:
 * - Look up the calendar source by `sourceId` in `calendar_sources`.
 * - Optionally validate that the source belongs to `options.expectedUserId`.
 * - Decrypt stored credentials (if present) and attempt to initialise a CalDAV
 *   client using a set of base-URL fallbacks.
 * - Fetch calendars and events (prefer a supplied date range; fall back to a
 *   sane default window), parse iCalendar dates robustly and upsert events by
 *   UID into `external_events`.
 * - Remove stale events that are no longer present on the remote for the synced
 *   date range; update `last_synced_at` on the source when syncs succeed.
 * - Emit structured logs via `options.onLog` to aid observability.
 *
 * Error handling and notes:
 * - Per-calendar errors (network, auth, 404) are logged and skipped; they do
 *   not abort the whole sync run. This keeps background jobs resilient.
 * - The function is defensive about iCalendar date formats and will skip events
 *   that fail date parsing to avoid crashing the sync job.
 *
 * @param sourceId - Identifier of the calendar source to sync (calendar_sources.id).
 * @param options - Optional sync parameters:
 *   @param options.onLog - (entry: { level, message, meta }) => void. If provided,
 *                          called with structured log entries for info/warn/error.
 *   @param options.expectedUserId - string | undefined. When provided the function
 *                                  validates that the calendar source belongs to this user.
 *   @param options.rangeStart - Date | undefined. Optional start of the desired fetch window.
 *   @param options.rangeEnd - Date | undefined. Optional end of the desired fetch window.
 *
 * @returns Promise<void> - resolves when the sync completes (successfully or with non-fatal skips).
 * @throws Error when the `sourceId` is not found or when a permission check fails.
 */
export async function syncCalendarSource(
  sourceId: string,
  options?: SyncCalendarOptions,
) {
  const source = await prisma.calendar_sources.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    console.warn("[CalDAV] Source not found", { sourceId });
    throw new Error("Source not found");
  }

  if (options?.expectedUserId && source.user_id !== options.expectedUserId) {
    throw new Error("Forbidden");
  }

  const password = source.password ? decrypt(source.password) : undefined;
  const username = source.username ? decrypt(source.username) : undefined;

  const auth =
    username && password
      ? ({
          type: "basic",
          username,
          password,
        } as const)
      : undefined;

  const log: LogFn = (level, message, meta) => {
    const prefix = `[CalDAV][${source.name}] ${message}`;
    if (level === "error") {
      if (meta) {
        console.error(prefix, meta);
      } else {
        console.error(prefix);
      }
    } else if (level === "warn") {
      if (meta) {
        console.warn(prefix, meta);
      } else {
        console.warn(prefix);
      }
    } else {
      if (meta) {
        console.log(prefix, meta);
      } else {
        console.log(prefix);
      }
    }

    if (options?.onLog) {
      options.onLog({ level, message, meta });
    }
  };

  // Default to loading events for the upcoming week when no explicit range is provided.
  const now = new Date();
  const defaultStart = new Date(now);
  // Start at top of current day for a sensible range
  defaultStart.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultEnd.getDate() + 7); // one week ahead

  const effectiveRangeStart: Date | undefined =
    options?.rangeStart ?? defaultStart;
  const effectiveRangeEnd: Date | undefined = options?.rangeEnd ?? defaultEnd;

  if (!options?.rangeStart || !options?.rangeEnd) {
    log(
      "info",
      "No explicit range provided, defaulting to background fetch for next 7 days",
      {
        rangeStart: effectiveRangeStart.toISOString(),
        rangeEnd: effectiveRangeEnd.toISOString(),
      },
    );
  }

  try {
    const client = await createClientWithFallback(source.url, auth, log);

    if (!client) {
      log("error", "Failed to initialise CalDAV client", {
        sourceId: source.id,
        attemptedUrls: buildBaseUrlCandidates(source.url),
      });
      return;
    }

    const calendars = await client.getCalendars();
    log("info", `Found ${calendars.length} calendars`, {
      calendars: calendars.map((c) => ({
        url: c.url,
        displayName: c.displayName,
      })),
    });

    let syncedCount = 0;
    // Track all UIDs we've seen from CalDAV to identify stale events for deletion
    const allSyncedUids: Set<string> = new Set();

    for (const calendar of calendars) {
      if (shouldSkipCalendar(calendar.url, calendar.displayName)) {
        log("info", "Skipping system calendar", {
          url: calendar.url,
          displayName: calendar.displayName,
        });
        continue;
      }
      try {
        log("info", "Syncing calendar", {
          url: calendar.url,
          displayName: calendar.displayName,
        });
        const events = await fetchEventsWithRange(
          client,
          calendar.url,
          log,
          effectiveRangeStart,
          effectiveRangeEnd,
        );
        log("info", `Retrieved ${events.length} events`, {
          url: calendar.url,
          displayName: calendar.displayName,
        });

        for (const event of events) {
          if (!event.uid) continue;

          const calendarData = event.calendarData ?? event.data ?? null;
          const fallbackStart = extractICalDate(calendarData, "DTSTART");
          const fallbackEnd = extractICalDate(calendarData, "DTEND");

          const startTime =
            parseICalDateValue(event.startDate) ??
            parseICalDateValue(event.start) ??
            parseICalDateValue(fallbackStart);
          const endTime =
            parseICalDateValue(event.endDate) ??
            parseICalDateValue(event.end) ??
            parseICalDateValue(fallbackEnd);

          // Skip if dates are invalid (prevents the crash you saw)
          if (!startTime || !endTime) {
            log("warn", "Skipping event due to invalid dates", {
              uid: event.uid,
              summary: event.summary,
              rawStart: event.startDate ?? event.start ?? fallbackStart,
              rawEnd: event.endDate ?? event.end ?? fallbackEnd,
              hasCalendarData: Boolean(calendarData),
            });
            continue;
          }

          log("info", "Upserting event", {
            uid: event.uid,
            summary: event.summary,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            allDay: Boolean(event.allDay),
            location: event.location,
            calendarUrl: calendar.url,
          });

          // Track this UID as synced
          allSyncedUids.add(event.uid);

          await prisma.external_events.upsert({
            where: {
              source_id_uid: {
                source_id: source.id,
                uid: event.uid,
              },
            },
            update: {
              title: event.summary || "Untitled Event",
              description: event.description || null,
              start_time: startTime,
              end_time: endTime,
              all_day: event.allDay || false,
              location: event.location || null,
              url: calendar.url,
            },
            create: {
              source_id: source.id,
              uid: event.uid,
              title: event.summary || "Untitled Event",
              description: event.description || null,
              start_time: startTime,
              end_time: endTime,
              all_day: event.allDay || false,
              location: event.location || null,
              url: calendar.url,
            },
          });
        }
        syncedCount++;
      } catch (unknownError) {
        const { status, message } = normaliseCalDavError(unknownError);

        if (status === 401 || status === 403) {
          log("warn", "Skipping restricted calendar folder", {
            url: calendar.url,
            status,
          });
          continue;
        }

        if (status === 404) {
          log("warn", "Calendar not found, skipping", {
            url: calendar.url,
            status,
          });
          continue;
        }

        log("error", "Failed to sync calendar", {
          url: calendar.url,
          status,
          message,
        });
      }
    }

    if (syncedCount > 0) {
      await prisma.calendar_sources.update({
        where: { id: sourceId },
        data: { last_synced_at: new Date() },
      });

      // Delete stale events that are no longer in CalDAV
      // If we have a date range, only delete events within that range that weren't synced
      // If no date range, delete all events for this source that weren't synced
      if (allSyncedUids.size > 0 || syncedCount > 0) {
        const deleteWhere: {
          source_id: string;
          uid: { notIn: string[] };
          start_time?: { gte: Date; lt: Date };
        } = {
          source_id: source.id,
          uid: { notIn: Array.from(allSyncedUids) },
        };

        // If we synced with a date range, only delete stale events within that range
        if (effectiveRangeStart && effectiveRangeEnd) {
          deleteWhere.start_time = {
            gte: effectiveRangeStart,
            lt: effectiveRangeEnd,
          };
        }

        const deleteResult = await prisma.external_events.deleteMany({
          where: deleteWhere,
        });

        if (deleteResult.count > 0) {
          log("info", `Deleted ${deleteResult.count} stale events`, {
            sourceId: source.id,
            rangeStart: options?.rangeStart?.toISOString(),
            rangeEnd: options?.rangeEnd?.toISOString(),
          });
        }
      }
    }
  } catch (error) {
    log("error", "Failed to sync calendar source", {
      sourceId,
      error: (error as Error)?.message,
    });
    // Don't throw here to prevent one failing calendar from crashing the whole request
  }
}

async function fetchEventsWithRange(
  client: CalDAVClient,
  calendarUrl: string,
  log: LogFn,
  rangeStart?: Date,
  rangeEnd?: Date,
): Promise<CalDavEvent[]> {
  if (rangeStart && rangeEnd) {
    try {
      return (await client.getEvents(calendarUrl, {
        start: rangeStart,
        end: rangeEnd,
      })) as CalDavEvent[];
    } catch (err) {
      const normalised = normaliseCalDavError(err);
      log("warn", "Failed to fetch events within requested range", {
        url: calendarUrl,
        status: normalised.status,
        message: normalised.message,
      });
    }
  }

  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const fallbackRangeStart = new Date(now - oneYearMs);
  const fallbackRangeEnd = new Date(now + oneYearMs);

  try {
    return (await client.getEvents(calendarUrl, {
      start: fallbackRangeStart,
      end: fallbackRangeEnd,
    })) as CalDavEvent[];
  } catch (err) {
    const normalised = normaliseCalDavError(err);
    log("warn", "Fallback range fetch failed, requesting all events", {
      url: calendarUrl,
      status: normalised.status,
      message: normalised.message,
    });
  }

  return (await client.getEvents(calendarUrl)) as CalDavEvent[];
}

function buildBaseUrlCandidates(rawUrl: string): string[] {
  const trimmed = rawUrl.trim();
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (url: string | null | undefined) => {
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    candidates.push(url);
  };

  addCandidate(trimmed);

  if (!trimmed.endsWith("/") && !trimmed.toLowerCase().endsWith(".ics")) {
    addCandidate(`${trimmed}/`);
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname.includes(".well-known")) {
      addCandidate(`${parsed.origin}/.well-known/caldav`);
    }
  } catch {
    // URL may be relative or invalid; leave candidate list as-is.
  }

  return candidates;
}

async function createClientWithFallback(
  baseUrl: string,
  auth: { type: "basic"; username: string; password: string } | undefined,
  log: LogFn,
) {
  const candidates = buildBaseUrlCandidates(baseUrl);
  const errors: Array<{ url: string; message?: string; status?: number }> = [];

  for (const candidate of candidates) {
    try {
      log("info", "Trying base URL", { candidate });
      const options: Record<string, unknown> = {
        baseUrl: candidate,
      };

      if (auth) {
        options.auth = auth;
      }

      const createdClient = await CalDAVClient.create(
        options as unknown as Parameters<typeof CalDAVClient.create>[0],
      );
      log("info", "Connected using base URL", { candidate });
      return createdClient;
    } catch (unknownError) {
      const err = unknownError as {
        response?: { status?: number };
        status?: number;
        message?: string;
      };
      const status = err.response?.status ?? err.status;
      errors.push({ url: candidate, message: err.message, status });
      log("warn", "Failed with base URL", {
        candidate,
        status,
        message: err.message,
      });

      // Only continue trying alternatives for 404 responses; other errors likely won't succeed.
      if (status !== 404) {
        break;
      }
    }
  }

  if (errors.length > 0) {
    log("error", "CalDAV client initialisation attempts failed", {
      errors,
    });
  }

  return null;
}

function shouldSkipCalendar(url: string, displayName?: string | null): boolean {
  const normalisedUrl = url.toLowerCase();

  if (normalisedUrl.endsWith("/calendars/")) {
    return true;
  }

  if (/\/(inbox|outbox)\/$/i.test(normalisedUrl)) {
    return true;
  }

  if (!displayName && normalisedUrl.endsWith("/")) {
    return true;
  }

  return false;
}

function normaliseCalDavError(error: unknown): {
  status?: number;
  message: string;
} {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown> & {
      message?: string;
      status?: number;
      statusCode?: number;
      code?: string | number;
      response?: { status?: number };
    };

    const rawStatus =
      err.response?.status ??
      err.status ??
      err.statusCode ??
      (typeof err.code === "string" && /^\d+$/.test(err.code)
        ? Number(err.code)
        : undefined) ??
      (typeof err.code === "number" ? err.code : undefined);

    const status =
      typeof rawStatus === "number" && !Number.isNaN(rawStatus)
        ? rawStatus
        : undefined;

    const message =
      typeof err.message === "string"
        ? err.message
        : JSON.stringify(err, Object.getOwnPropertyNames(err));

    return { status, message };
  }

  return { status: undefined, message: String(error) };
}

function extractICalDate(
  calendarData: string | null,
  property: "DTSTART" | "DTEND",
): string | null {
  if (!calendarData) return null;

  const unfolded = calendarData.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    if (!line.toUpperCase().startsWith(property)) continue;
    const [, value] = line.split(":");
    if (!value) continue;
    return value.trim();
  }

  return null;
}

function parseICalDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) return null;

    // Pure date (all-day)
    if (/^\d{8}$/.test(trimmed)) {
      const year = trimmed.slice(0, 4);
      const month = trimmed.slice(4, 6);
      const day = trimmed.slice(6, 8);
      const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (!isNaN(date.getTime())) return date;
    }

    // Local time without timezone suffix
    if (/^\d{8}T\d{6}$/.test(trimmed)) {
      const formatted = trimmed.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
        "$1-$2-$3T$4:$5:$6Z",
      );
      const date = new Date(formatted);
      if (!isNaN(date.getTime())) return date;
    }

    // Standard timestamp, optionally with Z
    if (/^\d{8}T\d{6}Z?$/.test(trimmed)) {
      const formatted = trimmed.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
        "$1-$2-$3T$4:$5:$6$7",
      );
      const date = new Date(formatted);
      if (!isNaN(date.getTime())) return date;
    }

    // Attempt direct Date parsing as last resort
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) return fallback;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}
