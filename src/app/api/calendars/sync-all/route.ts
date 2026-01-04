/*
 * API: POST /api/calendars/sync-all
 *
 * Purpose:
 * - Trigger synchronization for all calendar sources belonging to the authenticated user.
 *
 * Behavior:
 * - Validates Supabase session using the SSR client wired to Next's cookie store.
 * - Optionally accepts a JSON body with { date: "YYYY-MM-DD" } to narrow the sync range
 *   to a single UTC day; this range is converted to start/end UTC instants.
 * - Iterates over the user's calendar sources and:
 *   - Delegates to the Google sync flow for sources with `type === "google"`.
 *   - Delegates to the CalDAV sync flow for other source types.
 * - Runs syncs in parallel using Promise.allSettled and returns a summary object:
 *   { status: 'ok', synced: <number>, failed: <number>, total: <number> }.
 *
 * Authentication:
 * - Requires an active Supabase session (via cookies). Returns HTTP 401 when unauthenticated.
 *
 * Notes:
 * - The handler caps computed date ranges to avoid Date overflow (year >= 10000).
 * - Sync failures for individual sources are captured and reported in the summary;
 *   the overall handler only fails on unexpected internal errors.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { syncCalendarSource } from "@/lib/calDavService";
import { syncGoogleSource } from "@/lib/googleService";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse optional date range from request body
  let rangeStart: Date | undefined;
  let rangeEnd: Date | undefined;

  try {
    const body = await request.json();
    if (body.date) {
      const parsedDate = new Date(body.date);
      if (!Number.isNaN(parsedDate.getTime())) {
        const start = new Date(parsedDate);
        const end = new Date(parsedDate);
        start.setUTCHours(0, 0, 0, 0);
        end.setUTCHours(0, 0, 0, 0);
        end.setUTCDate(end.getUTCDate() + 1);
        rangeStart = start;
        rangeEnd = end;

        // Cap valid range to avoid year 10000+ overflow
        if (rangeEnd.getUTCFullYear() >= 10000) {
          rangeEnd = new Date("9999-12-31T23:59:59.999Z");
        }
      }
    }
  } catch {
    // No body or invalid JSON - sync without date range (will use default logic)
  }

  try {
    const calendarSources = await prisma.calendar_sources.findMany({
      where: { user_id: user.id },
    });

    if (calendarSources.length === 0) {
      return NextResponse.json({
        status: "ok",
        message: "No calendar sources to sync",
        synced: 0,
      });
    }

    const results = await Promise.allSettled(
      calendarSources.map(async (source) => {
        // Use Google sync for Google-type sources, otherwise fall back to CalDAV
        if (source.type === "google") {
          await syncGoogleSource(source.id, {
            expectedUserId: user.id,
            rangeStart,
            rangeEnd,
          });
        } else {
          await syncCalendarSource(source.id, {
            expectedUserId: user.id,
            rangeStart,
            rangeEnd,
          });
        }
        return source.id;
      }),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log("[CalDAV] Sync-all completed", {
      userId: user.id,
      total: calendarSources.length,
      succeeded,
      failed,
      rangeStart: rangeStart?.toISOString(),
      rangeEnd: rangeEnd?.toISOString(),
    });

    return NextResponse.json({
      status: "ok",
      synced: succeeded,
      failed,
      total: calendarSources.length,
    });
  } catch (error) {
    console.error("[CalDAV] Sync-all failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Failed to sync calendars" },
      { status: 500 },
    );
  }
}
