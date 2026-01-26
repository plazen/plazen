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
 *       { timetable_start?, timetable_end?, show_time_needle?, theme?, telegram_id?,
 *         notifications?, is_profile_public?, username?, bio? }
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
import { createServerClient } from "@/lib/supabaseServer";
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
      is_profile_public,
      username,
      bio,
    } = body;

    const dataToUpdate: {
      timetable_start?: number;
      timetable_end?: number;
      show_time_needle?: boolean;
      theme?: string;
      telegram_id?: string | null;
      notifications?: boolean;
      is_profile_public?: boolean;
      username?: string | null;
      bio?: string | null;
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

    // Handle public profile fields
    if (is_profile_public !== undefined)
      dataToUpdate.is_profile_public = is_profile_public;
    if (bio !== undefined) dataToUpdate.bio = bio?.slice(0, 500) || null;
    if (username !== undefined) {
      if (username === null || username === "") {
        dataToUpdate.username = null;
      } else {
        // Validate username format
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
          return NextResponse.json(
            { error: usernameValidation.message },
            { status: 400 },
          );
        }

        // Check uniqueness (case-insensitive)
        const normalizedUsername = username.toLowerCase();
        const existing = await prisma.userSettings.findFirst({
          where: {
            username: normalizedUsername,
            NOT: { user_id: session.user.id },
          },
        });

        if (existing) {
          return NextResponse.json(
            { error: "This username is already taken" },
            { status: 400 },
          );
        }

        dataToUpdate.username = normalizedUsername;
      }
    }

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

const RESERVED_USERNAMES = [
  "admin",
  "api",
  "settings",
  "account",
  "login",
  "signup",
  "logout",
  "profile",
  "user",
  "users",
  "support",
  "help",
  "pricing",
  "about",
  "documentation",
  "docs",
  "schedule",
  "plazen",
  "null",
  "undefined",
  "u",
  "release-notes",
  "privacy_policy",
  "tos",
  "license",
  "forgot-password",
  "reset-password",
];

function validateUsername(username: string): {
  valid: boolean;
  message?: string;
} {
  if (!username) return { valid: false, message: "Username is required" };
  if (username.length < 3)
    return { valid: false, message: "Username must be at least 3 characters" };
  if (username.length > 30)
    return { valid: false, message: "Username must be 30 characters or less" };
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return {
      valid: false,
      message: "Username can only contain letters, numbers, and underscores",
    };
  if (username.startsWith("_"))
    return { valid: false, message: "Username cannot start with underscore" };
  if (RESERVED_USERNAMES.includes(username.toLowerCase()))
    return { valid: false, message: "This username is reserved" };
  return { valid: true };
}
