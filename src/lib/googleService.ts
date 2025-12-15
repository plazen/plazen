import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

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

function createLogger(
  name: string,
  onLog?: (entry: SyncLogEntry) => void,
): LogFn {
  return (level, message, meta) => {
    const prefix = `[GoogleCalendar][${name}] ${message}`;
    if (level === "error") {
      if (meta) console.error(prefix, meta);
      else console.error(prefix);
    } else if (level === "warn") {
      if (meta) console.warn(prefix, meta);
      else console.warn(prefix);
    } else {
      if (meta) console.log(prefix, meta);
      else console.log(prefix);
    }

    if (onLog) onLog({ level, message, meta });
  };
}

/**
 * Exchanges a refresh token for a fresh access token using Google's OAuth2 token endpoint.
 * Returns access token string on success, or null on failure.
 */
async function refreshAccessToken(
  refreshToken: string,
  log: LogFn,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log(
      "warn",
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables",
    );
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
    params.set("refresh_token", refreshToken);
    params.set("grant_type", "refresh_token");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const body = await res.json();
    if (!res.ok) {
      log("warn", "Failed to refresh Google access token", {
        status: res.status,
        body,
      });
      return null;
    }

    if (!body.access_token) {
      log("warn", "Refresh response missing access_token", { body });
      return null;
    }

    return String(body.access_token);
  } catch (err) {
    log("error", "Error refreshing Google access token", {
      error: (err as Error)?.message ?? err,
    });
    return null;
  }
}

/**
 * Synchronise a single calendar_sources entry that represents a Google Calendar source.
 * Assumes the source stores tokens in `username` and `password` (encrypted) — access token in `username`, refresh token in `password`.
 */
export async function syncGoogleSource(
  sourceId: string,
  options?: SyncCalendarOptions,
) {
  const source = await prisma.calendar_sources.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    console.warn("[GoogleCalendar] Source not found", { sourceId });
    throw new Error("Source not found");
  }

  if (options?.expectedUserId && source.user_id !== options.expectedUserId) {
    throw new Error("Forbidden");
  }

  // By convention in this app:
  // - calendar_sources.username is used for stored auth data (encrypted)
  // - calendar_sources.password is used for stored secret data (encrypted)
  // We'll treat `username` as an encrypted access token (optional) and `password` as an encrypted refresh token (optional).
  const maybeAccessToken = source.username
    ? decrypt(source.username)
    : undefined;
  const maybeRefreshToken = source.password
    ? decrypt(source.password)
    : undefined;

  const log = createLogger(source.name, options?.onLog);

  if (!maybeAccessToken && !maybeRefreshToken) {
    log("warn", "No Google tokens available for source", { sourceId });
    return;
  }

  let accessToken: string | undefined = maybeAccessToken;
  if (!accessToken && maybeRefreshToken) {
    accessToken =
      (await refreshAccessToken(maybeRefreshToken, log)) || undefined;
  }

  if (!accessToken) {
    log("error", "Unable to obtain a Google access token", { sourceId });
    return;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  try {
    // List calendars on the account
    const calListUrl =
      "https://www.googleapis.com/calendar/v3/users/me/calendarList";
    const calListRes = await fetch(calListUrl, { headers });
    if (!calListRes.ok) {
      const text = await calListRes.text();
      log("error", "Failed to fetch Google calendar list", {
        status: calListRes.status,
        body: text,
      });
      return;
    }

    const calListBody = await calListRes.json();
    const calendars: Array<{ id: string; summary?: string }> = (
      calListBody.items || []
    ).map((c: any) => ({
      id: c.id,
      summary: c.summary,
    }));

    log("info", `Found ${calendars.length} calendars`, {
      calendars: calendars.map((c) => c.id),
    });

    const allSyncedUids = new Set<string>();
    let syncedCount = 0;

    for (const cal of calendars) {
      try {
        // Use calendar ID as provided by Google; when using in path, it must be URL-encoded
        const calendarId = cal.id;
        const encodedCalendarId = encodeURIComponent(calendarId);

        // Build events endpoint with parameters
        const params = new URLSearchParams();
        params.set("singleEvents", "true"); // expand recurring events
        params.set("maxResults", "2500"); // reasonable upper bound

        if (options?.rangeStart)
          params.set("timeMin", options.rangeStart.toISOString());
        if (options?.rangeEnd)
          params.set("timeMax", options.rangeEnd.toISOString());

        const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${params.toString()}`;

        const eventsRes = await fetch(eventsUrl, { headers });
        if (!eventsRes.ok) {
          const text = await eventsRes.text();
          log("warn", "Failed to fetch events for calendar", {
            calendarId: cal.id,
            status: eventsRes.status,
            body: text,
          });
          // If it's an auth error, we might try refreshing once
          if (
            (eventsRes.status === 401 || eventsRes.status === 403) &&
            maybeRefreshToken
          ) {
            log(
              "info",
              "Attempting to refresh access token due to auth error",
              { calendarId: cal.id },
            );
            const refreshed = await refreshAccessToken(maybeRefreshToken, log);
            if (refreshed) {
              // Retry once
              const retryHeaders = {
                ...headers,
                Authorization: `Bearer ${refreshed}`,
              };
              const retryRes = await fetch(eventsUrl, {
                headers: retryHeaders,
              });
              if (!retryRes.ok) {
                const retryText = await retryRes.text();
                log("warn", "Retry failed to fetch events for calendar", {
                  calendarId: cal.id,
                  status: retryRes.status,
                  body: retryText,
                });
                continue;
              }
              // update local accessToken variable so subsequent requests use it
              accessToken = refreshed;
            } else {
              continue;
            }
          } else {
            continue;
          }
        }

        // If we refreshed above, ensure headers use new token
        const effectiveHeaders = {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        };

        const effectiveEventsRes = await fetch(eventsUrl, {
          headers: effectiveHeaders,
        });

        if (!effectiveEventsRes.ok) {
          const text = await effectiveEventsRes.text();
          log("warn", "Failed to fetch events (effective) for calendar", {
            calendarId: cal.id,
            status: effectiveEventsRes.status,
            body: text,
          });
          continue;
        }

        const eventsBody = await effectiveEventsRes.json();
        const items: any[] = eventsBody.items || [];

        log("info", `Retrieved ${items.length} events for calendar`, {
          calendarId: cal.id,
          summary: cal.summary,
        });

        for (const ev of items) {
          // Create a UID unique across calendars for this source
          const uid = `google::${cal.id}::${ev.id}`;
          allSyncedUids.add(uid);

          const startRaw = ev.start?.dateTime ?? ev.start?.date ?? null;
          const endRaw = ev.end?.dateTime ?? ev.end?.date ?? null;

          if (!startRaw || !endRaw) {
            log("warn", "Skipping event due to missing start/end", {
              uid,
              calendarId: cal.id,
            });
            continue;
          }

          const startTime = new Date(startRaw);
          const endTime = new Date(endRaw);

          if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            log("warn", "Skipping event due to invalid dates", {
              uid,
              startRaw,
              endRaw,
            });
            continue;
          }

          const title = ev.summary || "Untitled Event";
          const description = ev.description || null;
          const location = ev.location || null;
          const htmlLink = ev.htmlLink || null;
          const allDay = !!ev.start?.date; // presence of `date` indicates all-day

          // Upsert into external_events table
          await prisma.external_events.upsert({
            where: {
              source_id_uid: {
                source_id: source.id,
                uid,
              },
            },
            update: {
              title,
              description,
              start_time: startTime,
              end_time: endTime,
              all_day: allDay,
              location,
              url: htmlLink,
            },
            create: {
              source_id: source.id,
              uid,
              title,
              description,
              start_time: startTime,
              end_time: endTime,
              all_day: allDay,
              location,
              url: htmlLink,
            },
          });
        }

        syncedCount++;
      } catch (err) {
        log("error", "Failed to sync individual calendar", {
          calendarId: cal.id,
          error: (err as Error)?.message ?? err,
        });
        continue;
      }
    }

    if (syncedCount > 0) {
      await prisma.calendar_sources.update({
        where: { id: sourceId },
        data: { last_synced_at: new Date() },
      });

      // Delete stale events that were not synced
      if (allSyncedUids.size > 0 || syncedCount > 0) {
        const deleteWhere: any = {
          source_id: source.id,
          uid: { notIn: Array.from(allSyncedUids) },
        };

        // If we had a date range, only delete stale events within that range
        if (options?.rangeStart && options?.rangeEnd) {
          deleteWhere.start_time = {
            gte: options.rangeStart,
            lt: options.rangeEnd,
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
    log("error", "Failed to sync Google source", {
      sourceId,
      error: (error as Error)?.message ?? error,
    });
    // Don't rethrow to avoid crashing a multi-source sync
  }
}
