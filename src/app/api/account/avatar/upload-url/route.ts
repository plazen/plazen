import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

const AVATAR_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET ?? "avatars";

export async function POST(request: Request) {
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
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    fileExt?: string;
    contentType?: string;
  } | null;

  const rawExt = body?.fileExt ?? "";
  if (!rawExt) {
    return NextResponse.json(
      { error: "Missing file extension." },
      { status: 400 }
    );
  }

  const fileExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const contentType =
    body?.contentType && typeof body.contentType === "string"
      ? body.contentType
      : undefined;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceRoleKey) {
    console.error("Missing service role key for avatar uploads.");
    return NextResponse.json(
      { error: "Avatar uploads are temporarily unavailable." },
      { status: 503 }
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
    }
  );

  const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  const uploadOptions: { upsert: boolean; contentType?: string } = {
    upsert: true,
  };

  if (contentType) {
    uploadOptions.contentType = contentType;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .createSignedUploadUrl(filePath);

  if (error || !data) {
    console.error("Failed to create signed upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare avatar upload." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      filePath,
      token: data.token,
    },
    { status: 200 }
  );
}
