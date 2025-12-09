import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { publishToSocials } from "@/lib/socials";

export const dynamic = "force-dynamic";

async function isAdmin() {
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
    return false;
  }

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  return profile?.role === "ADMIN";
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notes = await prisma.release_notes.findMany({
      orderBy: {
        date: "desc",
      },
    });
    return NextResponse.json(notes);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to fetch notes, error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { topic, version, text, date } = body;

    if (!topic || !version || !text || !date) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const newNote = await prisma.release_notes.create({
      data: {
        topic,
        version,
        text,
        date: new Date(date),
      },
    });

    try {
      await publishToSocials({
        id: newNote.id,
        version: newNote.version || version,
        topic: newNote.topic || topic,
      });
    } catch (socialError) {
      console.error(
        "Failed to publish to socials, but note was saved:",
        socialError,
      );
    }

    return NextResponse.json(newNote, { status: 201 });
  } catch (error) {
    console.error("Error creating release note:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
