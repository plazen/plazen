/*
 * API: POST /api/calendars/[id]/sync
 *
 * Purpose:
 * - Trigger a manual sync for a specific calendar source.
 *
 * Behavior:
 * - Validates the Supabase-authenticated user server-side.
 * - Confirms the calendar source exists and belongs to the authenticated user.
 * - Runs a sync operation:
 *   - Uses Google sync flow when the source `type` is "google".
 *   - Uses the CalDAV sync flow for other source types.
 * - Supports optional `debug` query parameter (debug=1 or debug=true). When present,
 *   the handler collects SyncLogEntry objects produced during the sync and returns
 *   them in the response under the `debug` key to aid troubleshooting.
 *
 * Authentication & Authorization:
 * - Requires an active Supabase session (via SSR client + cookies).
 * - Returns 401 if the request is not authenticated.
 * - Returns 403 if the source exists but does not belong to the authenticated user.
 *
 * Request:
 * - Path param: `id` — calendar source id to sync.
 * - Optional query: `debug=1|true` — include sync debug log entries in the response.
 *
 * Responses:
 * - 200: { status: "ok" } (may include debug array)
 * - 401: { error: "Unauthorized" }
 * - 403: { error: "Forbidden" }
 * - 404: { error: "Source not found" }
 * - 500: { error: "Failed to run manual calendar sync" } (or other error message)
 *
 * Notes:
 * - The handler logs useful context for operations and maps sync errors to appropriate
 *   HTTP statuses where possible. Initial sync details are best-effort — heavy sync
 *   operations should be performed asynchronously when necessary.
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { syncCalendarSource, type SyncLogEntry } from "@/lib/calDavService";
import { syncGoogleSource } from "@/lib/googleService";
import prisma from "@/lib/prisma";

type RouteParams = Promise<{ id: string }>;

export async function POST(request: Request, context: { params: RouteParams }) {
  const params = await context.params;
  const sourceId = params.id;
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

  console.log("[CalDAV] Manual sync requested", {
    sourceId,
    userId: user.id,
  });

  const requestUrl = new URL(request.url);
  const debugParam = requestUrl.searchParams.get("debug");
  const includeDebug = debugParam === "1" || debugParam === "true";
  const debugLogs: SyncLogEntry[] = [];

  try {
    const source = await prisma.calendar_sources.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      console.warn("[CalDAV] Manual sync source lookup failed", {
        sourceId,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Source not found", debug: debugLogs },
        { status: 404 },
      );
    }

    if (source.user_id !== user.id) {
      console.warn("[CalDAV] Manual sync forbidden", {
        sourceId,
        ownerId: source.user_id,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Forbidden", debug: debugLogs },
        { status: 403 },
      );
    }

    if (source.type === "google") {
      // Use Google sync for Google-type sources
      await syncGoogleSource(sourceId, {
        expectedUserId: user.id,
        onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
      });
    } else {
      // Fallback to CalDAV sync for other source types (existing behaviour)
      await syncCalendarSource(sourceId, {
        expectedUserId: user.id,
        onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
      });
    }

    const body: Record<string, unknown> = { status: "ok" };
    if (includeDebug) {
      body.debug = debugLogs;
    }

    return NextResponse.json(body);
  } catch (error) {
    const message = (error as Error)?.message || "Failed to sync calendar";
    const status =
      message === "Source not found"
        ? 404
        : message === "Forbidden"
          ? 403
          : 500;

    const body: Record<string, unknown> = { error: message };
    if (includeDebug) {
      body.debug = debugLogs;
    }

    console.error("Failed to run manual calendar sync", {
      sourceId,
      userId: user.id,
      message,
      status,
    });

    return NextResponse.json(body, { status });
  }
}
