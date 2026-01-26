/*
 * API: /api/admin/badges/[id]
 *
 * Endpoints:
 * - GET    /api/admin/badges/[id] - Get a single badge
 * - PATCH  /api/admin/badges/[id] - Update a badge
 * - DELETE /api/admin/badges/[id] - Delete a badge
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const badge = await prisma.badges.findUnique({
      where: { id },
      include: {
        user_badges: {
          include: {
            settings: {
              select: {
                user_id: true,
                username: true,
              },
            },
          },
          orderBy: { granted_at: "desc" },
        },
      },
    });

    if (!badge) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }

    return NextResponse.json(badge);
  } catch (error) {
    console.error("Error fetching badge:", error);
    return NextResponse.json(
      { error: "Failed to fetch badge" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, description, icon, color } = body;

    const dataToUpdate: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      color?: string;
      updated_at: Date;
    } = {
      updated_at: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Badge name cannot be empty" },
          { status: 400 },
        );
      }
      dataToUpdate.name = name.trim().slice(0, 100);
    }
    if (description !== undefined)
      dataToUpdate.description = description?.slice(0, 500) || null;
    if (icon !== undefined) dataToUpdate.icon = icon?.slice(0, 100) || null;
    if (color !== undefined) dataToUpdate.color = color || "#3b82f6";

    const badge = await prisma.badges.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(badge);
  } catch (error: unknown) {
    console.error("Error updating badge:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }
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
      { error: "Failed to update badge" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.badges.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting badge:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to delete badge" },
      { status: 500 },
    );
  }
}
