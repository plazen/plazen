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
    }
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

// GET - List all mailboxes/folders
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check IMAP configuration
    if (
      !process.env.IMAP_HOST &&
      !(process.env.SMTP_USER && process.env.SMTP_PASS)
    ) {
      return NextResponse.json(
        { error: "IMAP is not configured. Please set IMAP environment variables." },
        { status: 500 }
      );
    }

    const imapClient = IMAPClient.fromEnv();
    const mailboxes = await imapClient.listMailboxes();

    // Get info for common mailboxes
    const mailboxInfo = await Promise.all(
      mailboxes.slice(0, 10).map(async (name) => {
        try {
          const info = await imapClient.getMailboxInfo(name);
          return {
            name,
            exists: info.exists,
            recent: info.recent,
            unseen: info.unseen,
          };
        } catch {
          return {
            name,
            exists: 0,
            recent: 0,
            unseen: 0,
          };
        }
      })
    );

    return NextResponse.json({
      mailboxes: mailboxInfo,
    });
  } catch (error: unknown) {
    console.error("Error fetching mailboxes:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch mailboxes" },
      { status: 500 }
    );
  }
}
