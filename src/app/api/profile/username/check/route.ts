/*
 * API: /api/profile/username/check
 *
 * Endpoint:
 * - GET /api/profile/username/check?username=<username>
 *   - Purpose: Check if a username is available and valid
 *   - Auth: Requires an active Supabase session
 *   - Response: { available: boolean, valid: boolean, message?: string }
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

function validateUsername(
  username: string,
): { valid: boolean; message?: string } {
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

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
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

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { available: false, valid: false, message: "Username is required" },
      { status: 200 },
    );
  }

  // Validate format
  const validation = validateUsername(username);
  if (!validation.valid) {
    return NextResponse.json(
      { available: false, valid: false, message: validation.message },
      { status: 200 },
    );
  }

  try {
    // Check if username is taken by another user (case-insensitive)
    const normalizedUsername = username.toLowerCase();
    const existing = await prisma.userSettings.findFirst({
      where: {
        username: normalizedUsername,
        NOT: { user_id: session.user.id },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          available: false,
          valid: true,
          message: "This username is already taken",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { available: true, valid: true, message: "Username is available" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error checking username:", error);
    return NextResponse.json(
      { error: "Failed to check username availability" },
      { status: 500 },
    );
  }
}
