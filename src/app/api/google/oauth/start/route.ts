/*
 * API: GET /api/google/oauth/start
 *
 * Purpose:
 * - Initiate the Google OAuth2 authorization flow for linking a user's Google Calendar.
 * - Returns a JSON object containing an authorization `url` the client should redirect the user to.
 *
 * Authentication:
 * - Requires an active Supabase session cookie. Returns 401 if unauthenticated.
 *
 * Behavior:
 * - Constructs an OAuth2 authorization URL using the configured `GOOGLE_CLIENT_ID`
 *   and a callback URL under the current request origin (`/api/google/oauth/callback`).
 * - Requests offline access and forces consent (to maximize the chance Google returns a refresh token).
 * - Sets the `state` parameter to the session user id; the callback handler must validate this
 *   to protect against CSRF/mismatched flows.
 *
 * Query / Response:
 * - On success: HTTP 200 with JSON { url: string }.
 * - 401: { error: "Unauthorized" } when no valid session is present.
 * - 500: { error: "Server misconfigured: missing GOOGLE_CLIENT_ID" } when env is missing.
 *
 * Notes:
 * - The client should redirect the user to the returned `url`. Google will redirect back to the
 *   callback endpoint where the code will be exchanged for tokens and persisted (server-side).
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GOOGLE_CLIENT_ID" },
      { status: 500 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin.replace(/\/$/, "")}/api/google/oauth/callback`;
  // const redirectUri = `https://plazen.org/api/google/oauth/callback`;
  const scopes = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "openid",
    "email",
    "profile",
  ].join(" ");

  const state = session.user.id;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline", // request refresh token
    prompt: "consent", // force consent so refresh token is returned (first time)
    scope: scopes,
    state: state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.json({ url });
}
