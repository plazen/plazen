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
        // Start with UTC midnight for the requested date
        rangeStart = new Date(parsedDate);
        rangeStart.setUTCHours(0, 0, 0, 0);

        // Apply timezone offset if provided
        // getTimezoneOffset() returns minutes (UTC - Local)
        // e.g., For UTC+4, offset is -240.
        // UTC 00:00 + (-240m) = Previous Day 20:00 UTC (which is 00:00 Local)
        if (typeof body.timezoneOffset === "number") {
          rangeStart.setMinutes(rangeStart.getMinutes() + body.timezoneOffset);
        }

        // Set rangeEnd to exactly 24 hours after rangeStart
        rangeEnd = new Date(rangeStart);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

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
