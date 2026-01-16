/*
 * API: /api/subscription
 *
 * Purpose:
 * - Provide subscription status information for the authenticated user.
 *
 * Endpoints:
 * - GET /api/subscription
 *   - Auth: Requires an active Supabase session cookie.
 *   - Returns: { isPro: boolean, endsAt: Date | null, provider: string | null }
 *   - Errors:
 *     - 401 when unauthenticated
 *     - 500 on unexpected server errors
 *
 * Behavior:
 * - Uses the Supabase SSR client wired to Next's cookie store to validate the session.
 * - Looks up the user's subscription row in the database and returns a lightweight
 *   representation suitable for frontend feature gating (isPro) and displaying
 *   subscription end date / provider where applicable.
 *
 * Notes:
 * - This handler intentionally returns minimal subscription metadata; sensitive
 *   billing details are not exposed here.
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { user_id: user.id },
      select: {
        is_pro: true,
        ends_at: true,
        provider: true,
      },
    });

    return NextResponse.json({
      isPro: subscription?.is_pro || false,
      endsAt: subscription?.ends_at,
      provider: subscription?.provider,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
