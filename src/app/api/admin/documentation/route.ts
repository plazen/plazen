import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

/**
 * GET /api/admin/documentation
 *
 * Return the list of documentation entries for the admin UI.
 *
 * Behaviour:
 * - Verifies the caller is an admin via `isAdmin`. If the caller is not an admin
 *   the handler returns a 401 Unauthorized JSON response.
 * - Queries `prisma.documentation_entries` ordering by `topic` (ascending)
 *   and returns the results as JSON with a 200 status on success.
 * - On unexpected errors the handler logs the error and returns a 500 JSON error
 *   response suitable for the admin UI to display a failure state.
 *
 * Notes:
 * - This handler is intended for admin-only consumption; callers must be
 *   authenticated and authorised as admins.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await prisma.documentation_entries.findMany({
      orderBy: {
        topic: "asc",
      },
    });

    return NextResponse.json(entries, { status: 200 });
  } catch (error) {
    console.error("Error fetching documentation entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch documentation entries" },
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
    const { topic, text, category } = body;

    if (!topic || !text) {
      return NextResponse.json(
        { error: "Topic and text are required" },
        { status: 400 },
      );
    }

    const newEntry = await prisma.documentation_entries.create({
      data: {
        topic,
        text,
        category: category || null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return NextResponse.json(newEntry, { status: 201 });
  } catch (error) {
    console.error("Error creating documentation entry:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
