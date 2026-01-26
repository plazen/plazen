/*
 * API: /api/admin/badges/grant
 *
 * Endpoint:
 * - POST /api/admin/badges/grant - Grant a badge to a user
 *   - Body: { user_id: string, badge_id: string }
 *
 * Auth: Admin only
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getAdminInfo() {
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
    return { isAdmin: false, userId: null };
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  return { isAdmin: profile?.role === "ADMIN", userId: session.user.id };
}

export async function POST(request: Request) {
  const { isAdmin, userId: adminId } = await getAdminInfo();
  if (!isAdmin) {
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

    // Verify badge exists
    const badge = await prisma.badges.findUnique({
      where: { id: badge_id },
    });

    if (!badge) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }

    // Verify user settings exist (user must have settings to receive badges)
    const settings = await prisma.userSettings.findUnique({
      where: { user_id },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "User not found or has no settings" },
        { status: 404 },
      );
    }

    // Grant the badge
    const userBadge = await prisma.user_badges.create({
      data: {
        user_id,
        badge_id,
        granted_by: adminId,
      },
      include: {
        badge: true,
      },
    });

    return NextResponse.json(userBadge, { status: 201 });
  } catch (error: unknown) {
    console.error("Error granting badge:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "User already has this badge" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to grant badge" },
      { status: 500 },
    );
  }
}
