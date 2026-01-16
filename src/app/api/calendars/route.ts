/*
 * API: /api/calendars
 *
 * This file exposes the server-side handlers for managing a user's calendar sources.
 * It relies on Supabase session cookies to authenticate the logged-in user, and uses
 * Prisma for database access. Credentials (username/access token and password/refresh
 * token) are stored encrypted via the project's encryption helpers.
 *
 * Endpoints:
 * - GET /api/calendars
 *   - Auth: Requires an active Supabase session.
 *   - Returns: List of calendar sources belonging to the authenticated user.
 *     Credentials (password) are intentionally nulled in the response and any stored
 *     usernames are returned decrypted for safe display.
 *   - Behavior: Performs a lookup in `calendar_sources` filtered by the session user.
 *
 * - POST /api/calendars
 *   - Auth: Requires an active Supabase session.
 *   - Accepts JSON body: { name, url, username, password, color, type }
 *     - `type` may be "caldav" (default) or "google".
 *     - Credentials (username/password) will be encrypted before saving.
 *   - Query params:
 *     - `debug=1|true` (optional) — if present, the handler will collect debug log
 *       entries produced during the initial sync and include them in the JSON response.
 *   - Behavior:
 *     - Creates a new `calendar_sources` row for the user with encrypted credentials.
 *     - Attempts an initial sync:
 *       - For `type: "google"`, triggers Google-specific sync flow.
 *       - For other types, triggers CalDAV sync flow.
 *     - Returns the created source with `password: null` and, when requested,
 *       a `debug` array of SyncLogEntry objects.
 *
 * Notes:
 * - The handlers below expect and use the Supabase SSR client wired to Next's cookie
 *   storage helpers so authentication is validated server-side.
 * - Initial sync is best-effort: sync failures are logged but do not block the creation
 *   of the calendar source.
 * - Error responses use NextResponse with appropriate HTTP status codes.
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { syncCalendarSource, type SyncLogEntry } from "@/lib/calDavService";
import { syncGoogleSource } from "@/lib/googleService";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.calendar_sources.findMany({
    where: { user_id: session.user.id },
  });

  const safeSources = sources.map((s) => ({
    ...s,
    password: null,
    username: s.username ? decrypt(s.username) : null,
  }));

  return NextResponse.json(safeSources);
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
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const requestUrl = new URL(request.url);
    const debugParam = requestUrl.searchParams.get("debug");
    const includeDebug = debugParam === "1" || debugParam === "true";
    const debugLogs: SyncLogEntry[] = [];

    const body = await request.json();
    const { name, url, username, password, color, type } = body;

    const newSource = await prisma.calendar_sources.create({
      data: {
        user_id: session.user.id,
        name,
        url,
        username: username ? encrypt(username) : null,
        password: password ? encrypt(password) : null,
        color: color || "#3b82f6",
        type: type || "caldav",
      },
    });

    try {
      if (newSource.type === "google") {
        await syncGoogleSource(newSource.id, {
          expectedUserId: session.user.id,
          onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
        });
      } else {
        await syncCalendarSource(newSource.id, {
          expectedUserId: session.user.id,
          onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
        });
      }
    } catch (e) {
      console.error("Initial sync failed", e);
    }

    const responseBody: Record<string, unknown> = {
      ...newSource,
      password: null,
    };

    if (includeDebug) {
      responseBody.debug = debugLogs;
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Failed to add calendar", error);
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 },
    );
  }
}
