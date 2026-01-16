import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { IMAPClient } from "@/lib/imapClient";

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

// GET - Fetch emails from inbox
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const mailbox = searchParams.get("mailbox") || "INBOX";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const perPage = parseInt(searchParams.get("perPage") || "20", 10);
    // Filter to only show emails for us@plazen.org and support@plazen.org by default
    const filterRecipients = searchParams.get("filterRecipients") !== "false";

    // Check IMAP configuration
    if (
      !process.env.IMAP_HOST &&
      !(process.env.SMTP_USER && process.env.SMTP_PASS)
    ) {
      return NextResponse.json(
        {
          error:
            "IMAP is not configured. Please set IMAP environment variables.",
        },
        { status: 500 },
      );
    }

    const imapClient = IMAPClient.fromEnv();
    const start = (page - 1) * perPage;

    const result = await imapClient.fetchEmails(
      mailbox,
      start,
      perPage,
      filterRecipients,
    );

    return NextResponse.json({
      emails: result.headers,
      total: result.total,
      page,
      perPage,
      totalPages: Math.ceil(result.total / perPage),
      mailbox,
    });
  } catch (error: unknown) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch emails",
      },
      { status: 500 },
    );
  }
}
