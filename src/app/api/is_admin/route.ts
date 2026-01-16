/*
 * API: GET /api/is_admin
 *
 * Purpose:
 * - Determine whether the currently authenticated user has an ADMIN role.
 *
 * Behavior:
 * - Uses the Supabase SSR client wired to Next's cookie store to validate the
 *   user's session server-side.
 * - Ensures a `profiles` row exists for the user; if not, a default profile
 *   with role "USER" is created.
 * - Returns a boolean: `true` when the user's role equals "ADMIN", otherwise `false`.
 *
 * Authentication:
 * - Requires an active Supabase session cookie. Returns HTTP 401 when unauthenticated.
 *
 * Responses:
 * - 200: boolean (true if admin, false otherwise)
 * - 401: { error: "Unauthorized" } when not authenticated
 * - 500: { error: "Failed to fetch settings" } on unexpected server error
 *
 * Notes:
 * - This route is intentionally lightweight and idempotent. It will create a basic
 *   profile record for new users so downstream admin-checking logic has a stable
 *   place to read roles from.
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
    let profile = await prisma.profiles.findUnique({
      where: { id: session.user.id },
    });

    if (!profile) {
      profile = await prisma.profiles.create({
        data: {
          id: session.user.id,
          role: "USER",
        },
      });
    }

    return NextResponse.json(profile.role == "ADMIN" ? true : false, {
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}
