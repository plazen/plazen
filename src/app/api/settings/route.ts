/*
 * API: /api/settings
 *
 * Endpoints supported:
 * - GET  /api/settings
 *   - Purpose: Return the authenticated user's settings row (creates a default
 *     settings row if one does not exist).
 *   - Auth: Requires an active Supabase session (server-side cookie via SSR client).
 *   - Response: 200 with the settings object on success, 401 when unauthenticated,
 *     500 on server error.
 *
 * - PATCH /api/settings
 *   - Purpose: Update user settings (partial updates supported).
 *   - Auth: Requires an active Supabase session.
 *   - Request body: any subset of:
 *       { timetable_start?, timetable_end?, show_time_needle?, theme?, telegram_id?, notifications? }
 *   - Behavior: Only provided fields will be updated; `updated_at` will be set to now.
 *   - Response: 200 with the updated settings object on success, 401 when unauthenticated,
 *     400 for invalid input, 500 on server error.
 *
 * Notes:
 * - Handlers use the Supabase SSR client wired to Next's cookie store so authentication
 *   is validated server-side.
 * - This route is marked `force-dynamic` elsewhere to ensure fresh DB reads rather than
 *   serving cached static content.
 * - Errors are returned as JSON `{ error: string }` with appropriate HTTP status codes.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
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
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let settings = await prisma.userSettings.findUnique({
      where: { user_id: session.user.id },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          user_id: session.user.id,
          timetable_start: 8,
          timetable_end: 18,
          show_time_needle: true,
          theme: "dark",
          telegram_id: null,
          notifications: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return NextResponse.json(settings, { status: 200 });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      timetable_start,
      timetable_end,
      show_time_needle,
      theme,
      telegram_id,
      notifications,
    } = body;

    const dataToUpdate: {
      timetable_start?: number;
      timetable_end?: number;
      show_time_needle?: boolean;
      theme?: string;
      telegram_id?: string | null;
      notifications?: boolean;
      updated_at: Date;
    } = {
      updated_at: new Date(),
    };

    // Conditionally add fields to update object
    if (timetable_start !== undefined)
      dataToUpdate.timetable_start = timetable_start;
    if (timetable_end !== undefined) dataToUpdate.timetable_end = timetable_end;
    if (show_time_needle !== undefined)
      dataToUpdate.show_time_needle = show_time_needle;
    if (theme !== undefined) dataToUpdate.theme = theme;
    if (telegram_id !== undefined) {
      console.log("Updating telegram_id to:", telegram_id);
      dataToUpdate.telegram_id = telegram_id || null;
    }
    if (notifications !== undefined) dataToUpdate.notifications = notifications;

    const updatedSettings = await prisma.userSettings.update({
      where: { user_id: session.user.id },
      data: dataToUpdate,
    });

    return NextResponse.json(updatedSettings, { status: 200 });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
