import { NextResponse } from "next/server";
import { isDevMode, DEV_USER_ID } from "@/lib/devMode";
import memoryStore from "@/lib/memoryStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/settings
 * Returns current dev mode settings (admin status, subscription status)
 */
export async function GET() {
  if (!isDevMode()) {
    return NextResponse.json(
      { error: "Dev mode is not enabled" },
      { status: 403 },
    );
  }

  const profile = memoryStore.profiles.get(DEV_USER_ID);
  const subscription = memoryStore.subscriptions.get(DEV_USER_ID);

  return NextResponse.json({
    isAdmin: profile?.role === "ADMIN",
    isSubscribed: subscription?.is_pro ?? false,
  });
}

/**
 * PATCH /api/dev/settings
 * Updates dev mode settings (admin status, subscription status)
 */
export async function PATCH(request: Request) {
  if (!isDevMode()) {
    return NextResponse.json(
      { error: "Dev mode is not enabled" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { isAdmin, isSubscribed } = body;

    // Update admin status if provided
    if (typeof isAdmin === "boolean") {
      const profile = memoryStore.profiles.get(DEV_USER_ID);
      if (profile) {
        profile.role = isAdmin ? "ADMIN" : "USER";
        memoryStore.profiles.set(DEV_USER_ID, profile);
      }
    }

    // Update subscription status if provided
    if (typeof isSubscribed === "boolean") {
      const subscription = memoryStore.subscriptions.get(DEV_USER_ID);
      const OneYearFromNow = new Date();
      OneYearFromNow.setFullYear(OneYearFromNow.getFullYear() + 1); // One year from the current time
      if (subscription) {
        subscription.is_pro = isSubscribed;
        if (isSubscribed) {
          subscription.ends_at = OneYearFromNow; // Subscription will end a year from the date of modification
        } else {
          subscription.ends_at = new Date(); // Ended subscription
        }
        memoryStore.subscriptions.set(DEV_USER_ID, subscription);
      }
    }

    // Return updated settings
    const updatedProfile = memoryStore.profiles.get(DEV_USER_ID);
    const updatedSubscription = memoryStore.subscriptions.get(DEV_USER_ID);

    return NextResponse.json({
      isAdmin: updatedProfile?.role === "ADMIN",
      isSubscribed: updatedSubscription?.is_pro ?? false,
    });
  } catch (error) {
    console.error("Error updating dev settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
