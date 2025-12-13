import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { syncCalendarSource, type SyncLogEntry } from "@/lib/calDavService";
import { syncGoogleSource } from "@/lib/googleService";

export async function GET() {
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

  const sources = await prisma.calendar_sources.findMany({
    where: { user_id: session.user.id },
  });

  const safeSources = sources.map((s) => ({
    ...s,
    password: null,
    username: s.username ? decrypt(s.username) : null,
  }));

  return NextResponse.json(safeSources);
}

export async function POST(request: Request) {
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

  try {
    const requestUrl = new URL(request.url);
    const debugParam = requestUrl.searchParams.get("debug");
    const includeDebug = debugParam === "1" || debugParam === "true";
    const debugLogs: SyncLogEntry[] = [];

    const body = await request.json();
    const { name, url, username, password, color, type } = body;

    const newSource = await prisma.calendar_sources.create({
      data: {
        user_id: session.user.id,
        name,
        url,
        username: username ? encrypt(username) : null,
        password: password ? encrypt(password) : null,
        color: color || "#3b82f6",
        type: type || "caldav",
      },
    });

    try {
      if (newSource.type === "google") {
        await syncGoogleSource(newSource.id, {
          expectedUserId: session.user.id,
          onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
        });
      } else {
        await syncCalendarSource(newSource.id, {
          expectedUserId: session.user.id,
          onLog: includeDebug ? (entry) => debugLogs.push(entry) : undefined,
        });
      }
    } catch (e) {
      console.error("Initial sync failed", e);
    }

    const responseBody: Record<string, unknown> = {
      ...newSource,
      password: null,
    };

    if (includeDebug) {
      responseBody.debug = debugLogs;
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Failed to add calendar", error);
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 },
    );
  }
}
