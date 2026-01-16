/**
 * account/route.ts
 *
 * API handlers related to the authenticated user's account.
 *
 * Exports:
 * - DELETE: Remove the current user's account and purge associated application data.
 *
 * Behaviour and notes:
 * - Uses Supabase server-side helpers to validate the session and to perform
 *   admin-level user deletion (via a service role key).
 * - Prior to deleting the auth user, the handler attempts to purge application
 *   data related to the user (tasks, routine templates, profile, subscriptions,
 *   support tickets/messages, settings) in a single database transaction to
 *   keep the database consistent.
 * - Returns structured JSON responses complying with Next.js Edge Route/Route
 *   handler expectations (NextResponse).
 *
 * Security:
 * - Requires a valid Supabase session. The Supabase service role key is read
 *   from environment variables. If the service role key is missing the handler
 *   returns a 500 and does not attempt account deletion.
 *
 * Usage:
 * - Called by the client when a user requests account deletion. The handler
 *   performs best-effort cleanup and surfaces errors for operator visibility.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import prisma from "@/lib/prisma";

export async function DELETE() {
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

  const userId = session.user.id;

  try {
    await prisma.$transaction([
      prisma.support_ticket_messages.deleteMany({ where: { user_id: userId } }),
      prisma.support_tickets.deleteMany({ where: { user_id: userId } }),
      prisma.tasks.deleteMany({ where: { user_id: userId } }),
      prisma.routine_tasks.deleteMany({ where: { user_id: userId } }),
      prisma.subscription.deleteMany({ where: { user_id: userId } }),
      prisma.userSettings.deleteMany({ where: { user_id: userId } }),
      prisma.profiles.deleteMany({ where: { id: userId } }),
    ]);
  } catch (error) {
    console.error("Failed to purge user data before deletion:", error);
    return NextResponse.json(
      { error: "Failed to purge account data. Please contact support." },
      { status: 500 },
    );
  }

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    console.error("Missing Supabase service role key for account deletion.");
    return NextResponse.json(
      { error: "Account deletion is unavailable. Please contact support." },
      { status: 500 },
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { error: deleteError } =
    await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error("Failed to delete Supabase auth user:", deleteError);
    return NextResponse.json(
      { error: "Failed to delete account. Please contact support." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
