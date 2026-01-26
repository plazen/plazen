/*
 * API: /api/admin/badges
 *
 * Endpoints:
 * - GET  /api/admin/badges - List all badges
 * - POST /api/admin/badges - Create a new badge
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
    return { isAdmin: false, userId: null };
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  return { isAdmin: profile?.role === "ADMIN", userId: session.user.id };
}

export async function GET() {
  const { isAdmin: adminStatus } = await isAdmin();
  if (!adminStatus) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const badges = await prisma.badges.findMany({
      orderBy: { created_at: "desc" },
      include: {
        _count: {
          select: { user_badges: true },
        },
      },
    });

    return NextResponse.json(
      badges.map((b) => ({
        ...b,
        user_count: b._count.user_badges,
        _count: undefined,
      })),
    );
  } catch (error) {
    console.error("Error fetching badges:", error);
    return NextResponse.json(
      { error: "Failed to fetch badges" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { isAdmin: adminStatus } = await isAdmin();
  if (!adminStatus) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, icon, color } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Badge name is required" },
        { status: 400 },
      );
    }

    const badge = await prisma.badges.create({
      data: {
        name: name.trim().slice(0, 100),
        description: description?.slice(0, 500) || null,
        icon: icon?.slice(0, 100) || null,
        color: color || "#3b82f6",
      },
    });

    return NextResponse.json(badge, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating badge:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A badge with this name already exists" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create badge" },
      { status: 500 },
    );
  }
}
