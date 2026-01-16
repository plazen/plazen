/*
 * API: GET /api/notifications
 *
 * Purpose:
 * - Return active notifications for the application. The endpoint is intended for
 *   client-side consumption to show site-wide messages to authenticated users.
 *
 * Authentication:
 * - This handler validates a Supabase session via the SSR client and Next cookie
 *   helpers. It returns HTTP 401 when no active session is present.
 *
 * Behavior:
 * - Queries `notifications` for rows where `show` is true and returns them ordered
 *   by `created_at` descending.
 *
 * Response:
 * - 200: JSON array of notifications (when successful).
 * - 401: { error: "Unauthorized" } when no valid session is present.
 * - 500: { error: "Failed to fetch notifications" } on unexpected server errors.
 *
 * Notes:
 * - The route is marked `force-dynamic` to always fetch fresh data from the DB.
 * - If you want notifications to be public (no auth), remove the session check below.
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
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // Public route, but only for authenticated users.
    // If you want it truly public, remove this check.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notifications = await prisma.notifications.findMany({
      where: {
        show: true, // Only fetch notifications marked as "show"
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json(notifications, { status: 200 });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
