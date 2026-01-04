/**
 * avatar/signed-url/route.ts
 *
 * Generate a signed URL for a user's avatar stored in Supabase Storage.
 *
 * Exports:
 * - GET(request): returns a signed URL for the avatar at the `path` query param.
 *
 * Behaviour notes:
 * - Validates the presence of a Supabase session (read from cookies).
 * - Requires a Supabase service role key to create signed URLs; when the key is
 *   missing the endpoint returns a 503 to indicate the feature is unavailable.
 * - Returns 400 for missing/invalid `path`, 401 for unauthenticated requests,
 *   and 500 for internal errors when signed URL generation fails.
 *
 * Implementation details:
 * - Uses the Supabase admin client (service role) to call `storage.from(bucket).createSignedUrl`.
 * - The signed URL TTL is configured via `SIGNED_URL_TTL_SECONDS` below (default 1 hour).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const AVATAR_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ?? "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  if (!path) {
    return NextResponse.json(
      { error: "Missing required 'path' parameter." },
      { status: 400 },
    );
  }

  if (path.includes("..")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

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

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    console.error("Missing service role key for avatar signed URLs.");
    return NextResponse.json(
      { error: "Avatar previews are unavailable. Please contact support." },
      { status: 503 },
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

  const { data, error } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("Failed to generate signed avatar URL:", error);
    return NextResponse.json(
      { error: "Unable to load avatar. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: data.signedUrl }, { status: 200 });
}
