/*
 * API: /api/admin/badges/revoke
 *
 * Endpoint:
 * - POST /api/admin/badges/revoke - Revoke a badge from a user
 *   - Body: { user_id: string, badge_id: string }
 *
 * Auth: Admin only
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function isAdmin() {
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
    return false;
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  return profile?.role === "ADMIN";
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { user_id, badge_id } = body;

    if (!user_id || !badge_id) {
      return NextResponse.json(
        { error: "user_id and badge_id are required" },
        { status: 400 },
      );
    }

    // Find and delete the user badge
    const userBadge = await prisma.user_badges.findFirst({
      where: {
        user_id,
        badge_id,
      },
    });

    if (!userBadge) {
      return NextResponse.json(
        { error: "User does not have this badge" },
        { status: 404 },
      );
    }

    await prisma.user_badges.delete({
      where: { id: userBadge.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking badge:", error);
    return NextResponse.json(
      { error: "Failed to revoke badge" },
      { status: 500 },
    );
  }
}
