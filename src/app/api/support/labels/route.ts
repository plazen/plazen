/*
 * API: /api/support/labels
 *
 * Purpose:
 * - Provide administrative CRUD operations for support ticket labels.
 *
 * Endpoints:
 * - GET  /api/support/labels
 *   - Returns: list of support labels (ordered by name).
 *   - Auth: Admin-only (returns 401 if unauthenticated or not an admin).
 *
 * - POST /api/support/labels
 *   - Creates a new support label.
 *   - Request body: { name: string, color: string }
 *   - Responses:
 *     - 201: created label
 *     - 400: validation error (missing fields)
 *     - 409: conflict (label already exists)
 *     - 401: not authorized (non-admin)
 *
 * - DELETE /api/support/labels
 *   - Query param: id (label id to delete)
 *   - Auth: Admin-only
 *   - Responses:
 *     - 200: { success: true } on success
 *     - 400: { error: 'ID is required' } when id missing
 *     - 401: { error: 'Unauthorized' } when not admin
 *     - 500: { error: 'Failed to delete label' } on failure
 *
 * Notes:
 * - Authentication is validated using the Supabase SSR client wired to Next's cookie store.
 * - Only users with a `profiles.role === 'ADMIN'` are permitted to call these handlers.
 * - Error responses are JSON objects with an `error` string and appropriate HTTP status codes.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SupabaseClient } from "@supabase/supabase-js";

async function isAdmin(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  return profile?.role === "ADMIN";
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const labels = await prisma.support_labels.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(labels);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, color } = await request.json();
  if (!name || !color) {
    return NextResponse.json(
      { error: "Name and color are required" },
      { status: 400 },
    );
  }

  try {
    const label = await prisma.support_labels.create({
      data: { name, color },
    });
    return NextResponse.json(label, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Label already exists" },
      { status: 409 },
    );
  }
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    await prisma.support_labels.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete label" },
      { status: 500 },
    );
  }
}
