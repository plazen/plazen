import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { syncGoogleSource } from "@/lib/googleService";

/**
 * Google OAuth2 callback handler
 *
 * Expected query params:
 * - code: authorization code from Google
 * - state: the user id we issued earlier to validate request ownership
 *
 * Behavior:
 * - Validates session and that state equals the logged-in user id.
 * - Exchanges the authorization code for tokens at Google's token endpoint.
 * - Persists refresh_token (and access_token if present) encrypted into calendar_sources.
 *   If a google-type calendar_sources row already exists for the user, it will be updated.
 * - Triggers an initial sync via syncGoogleSource (best-effort).
 * - Redirects back to the account page with a success or error flag.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      // User or Google returned an error (consent_denied etc)
      const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=${encodeURIComponent(
        error,
      )}`;
      return NextResponse.redirect(redirect);
    }

    if (!code) {
      const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=missing_code`;
      return NextResponse.redirect(redirect);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const redirect = `${origin.replace(/\/$/, "")}/login?error=not_signed_in`;
      return NextResponse.redirect(redirect);
    }

    // Validate state matches logged in user id
    if (!state || state !== session.user.id) {
      // Potential CSRF or mismatch
      const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=invalid_state`;
      return NextResponse.redirect(redirect);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${origin.replace(/\/$/, "")}/api/google/oauth/callback`;

    if (!clientId || !clientSecret) {
      const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=server_misconfigured`;
      return NextResponse.redirect(redirect);
    }

    // Exchange auth code for tokens
    const tokenParams = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    const tokenBody = await tokenRes.json();

    if (!tokenRes.ok) {
      const bodyString =
        typeof tokenBody === "object"
          ? JSON.stringify(tokenBody)
          : String(tokenBody);
      const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=token_exchange_failed&details=${encodeURIComponent(
        bodyString,
      )}`;
      return NextResponse.redirect(redirect);
    }

    const accessToken = tokenBody.access_token as string | undefined;
    const refreshToken = tokenBody.refresh_token as string | undefined;

    // Find existing google calendar source for this user, or create one
    // We store encrypted access_token in `username` and encrypted refresh_token in `password`.
    // The `url` field must be non-null in the schema; use Google's Calendar API base URL as a sensible default.
    const apiBaseUrl = "https://www.googleapis.com/calendar/v3";

    const existing = await prisma.calendar_sources.findFirst({
      where: { user_id: session.user.id, type: "google" },
    });

    let source;
    if (existing) {
      // Prepare update payload
      const updateData: Record<string, unknown> = {};
      if (accessToken) updateData.username = encrypt(accessToken);
      // Google only returns refresh_token on first consent in many cases; only update if provided.
      if (refreshToken) updateData.password = encrypt(refreshToken);
      // Ensure name/url set
      if (!existing.url) updateData.url = apiBaseUrl;
      if (!existing.name) updateData.name = "Google Calendar";

      source = await prisma.calendar_sources.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      // Create a new source row
      source = await prisma.calendar_sources.create({
        data: {
          user_id: session.user.id,
          name: "Google Calendar",
          url: apiBaseUrl,
          username: accessToken ? encrypt(accessToken) : null,
          password: refreshToken ? encrypt(refreshToken) : null,
          color: "#DB4437",
          type: "google",
        },
      });
    }

    // Trigger an initial sync (best-effort). Do not block the redirect too long — await but catch errors.
    try {
      await syncGoogleSource(source.id, {
        expectedUserId: session.user.id,
      });
    } catch (syncErr) {
      // Ignore sync errors for the redirect flow; user can manually trigger sync later.
      console.error("Initial Google sync failed:", syncErr);
    }

    const redirect = `${origin.replace(/\/$/, "")}/account?google_linked=1`;
    return NextResponse.redirect(redirect);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
    const redirect = `${origin.replace(/\/$/, "")}/account?google_link_error=internal`;
    return NextResponse.redirect(redirect);
  }
}
