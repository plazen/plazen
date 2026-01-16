/*
 * API: DELETE /api/calendars/[id]
 *
 * Purpose:
 * - Remove a calendar source belonging to the currently authenticated user.
 *
 * Authentication & Authorization:
 * - Requires an active Supabase session cookie. Returns HTTP 401 if not authenticated.
 * - Deletion is performed using a compound WHERE clause (`id` + `user_id`) so only
 *   the owner of the calendar source can delete it. If the row does not exist or does
 *   not belong to the user, the delete will not affect other users' data.
 *
 * Request:
 * - URL parameter: `id` (path param) — the calendar source id to delete.
 *
 * Response:
 * - On success: { success: true } with HTTP 200.
 * - On auth failure: { error: "Unauthorized" } with HTTP 401.
 * - On other failures: an error JSON with an appropriate HTTP status.
 *
 * Notes:
 * - This handler uses the Supabase SSR client wired to Next's cookie store to validate
 *   the session server-side and Prisma to perform the delete operation.
 * - The route intentionally keeps the logic small; Prisma will throw for unexpected DB
 *   errors which are surfaced as 500 responses by Next/Node if not explicitly caught here.
 */

import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;

  await prisma.calendar_sources.delete({
    where: { id: id, user_id: session.user.id },
  });

  return NextResponse.json({ success: true });
}
