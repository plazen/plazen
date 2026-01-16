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

// GET - Fetch a specific email body
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uid } = await params;
    const { searchParams } = new URL(request.url);
    const mailbox = searchParams.get("mailbox") || "INBOX";
    const uidNumber = parseInt(uid, 10);

    if (isNaN(uidNumber)) {
      return NextResponse.json(
        { error: "Invalid email UID" },
        { status: 400 }
      );
    }

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
    const emailBody = await imapClient.getEmailBody(mailbox, uidNumber);

    return NextResponse.json(emailBody);
  } catch (error: unknown) {
    console.error("Error fetching email body:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch email" },
      { status: 500 }
    );
  }
}

// PATCH - Mark email as read/unread
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uid } = await params;
    const body = await request.json();
    const { action, mailbox = "INBOX" } = body;
    const uidNumber = parseInt(uid, 10);

    if (isNaN(uidNumber)) {
      return NextResponse.json(
        { error: "Invalid email UID" },
        { status: 400 }
      );
    }

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

    if (action === "read") {
      await imapClient.markAsRead(mailbox, uidNumber);
    } else if (action === "unread") {
      await imapClient.markAsUnread(mailbox, uidNumber);
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'read' or 'unread'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, action });
  } catch (error: unknown) {
    console.error("Error updating email:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update email" },
      { status: 500 }
    );
  }
}

// DELETE - Delete an email
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uid } = await params;
    const { searchParams } = new URL(request.url);
    const mailbox = searchParams.get("mailbox") || "INBOX";
    const uidNumber = parseInt(uid, 10);

    if (isNaN(uidNumber)) {
      return NextResponse.json(
        { error: "Invalid email UID" },
        { status: 400 }
      );
    }

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
    await imapClient.deleteEmail(mailbox, uidNumber);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting email:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete email" },
      { status: 500 }
    );
  }
}
