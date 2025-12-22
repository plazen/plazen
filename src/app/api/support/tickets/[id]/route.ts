import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import SMTPClient from "@/lib/smtpClient";
import { generateEmailFromMarkdown } from "@/lib/emailTemplate";

/**
 * Helper to send notification emails using existing SMTP client and
 * the project's markdown -> HTML/email template utilities.
 *
 * This intentionally does not throw on failures so ticket operations
 * won't fail if email sending has transient problems.
 */
async function sendNotifications(
  messages: Array<{
    to: string | string[];
    subject: string;
    markdownBody: string;
    buttonText?: string;
    buttonUrl?: string;
  }>,
) {
  try {
    const smtp = SMTPClient.fromEnv();

    const emailMessages = messages.map((m) => {
      const { html, text } = generateEmailFromMarkdown(
        m.subject,
        m.markdownBody,
        {
          buttonText: m.buttonText,
          buttonUrl: m.buttonUrl,
          preheader: m.subject,
        },
      );

      return {
        to: m.to,
        subject: m.subject,
        text,
        html,
      };
    });

    // send all messages using one connection
    await smtp.sendBatch(emailMessages);
  } catch (err) {
    // Log and continue; don't block ticket operations on email errors
    // eslint-disable-next-line no-console
    console.error("Failed to send notification emails:", err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });
  const isAdmin = profile?.role === "ADMIN";

  const ticket = await prisma.support_tickets.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { created_at: "asc" },
        include: {
          user: { select: { email: true, id: true, raw_user_meta_data: true } },
        },
      },
      labels: { include: { label: true } },
      users: { select: { email: true, id: true, raw_user_meta_data: true } },
    },
  });

  if (!ticket)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Access control
  if (!isAdmin && ticket.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Map display_name and avatar_path for users and message authors
  const mapUser = (user: any) => {
    const meta = user.raw_user_meta_data || {};
    return {
      id: user.id,
      email: user.email,
      display_name: meta.display_name || (user.email?.split("@")[0] ?? ""),
      avatar_path: meta.avatar_path || null,
    };
  };

  const ticketWithNames = {
    ...ticket,
    users: mapUser(ticket.users),
    messages: ticket.messages.map((msg) => ({
      ...msg,
      user: mapUser(msg.user),
    })),
  };

  return NextResponse.json(ticketWithNames);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Add a new message to the ticket or update status
  const { id } = await params;
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

  const json = await request.json();
  const { message, status, is_internal } = json;

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });
  const isAdmin = profile?.role === "ADMIN";

  // Fetch ticket and owner email for notifications / validations
  const ticket = await prisma.support_tickets.findUnique({
    where: { id },
    include: {
      users: { select: { email: true, id: true, raw_user_meta_data: true } },
    },
  });
  if (!ticket)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const ticketUrl = `${baseUrl}/support/${id}`;

  const getDisplayName = (user: any) => {
    const meta = user?.raw_user_meta_data || {};
    return meta.display_name || user?.email?.split("@")[0] || "User";
  };

  // Notifications accumulator
  const notifyMessages: Array<{
    to: string | string[];
    subject: string;
    markdownBody: string;
    buttonText?: string;
    buttonUrl?: string;
  }> = [];

  if (status) {
    await prisma.support_tickets.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });

    // Notify about status change
    try {
      const ticketRec = await prisma.support_tickets.findUnique({
        where: { id },
        include: {
          users: { select: { email: true, raw_user_meta_data: true } },
          messages: { select: { id: true } },
          labels: true,
        },
      });

      const userEmail = ticketRec?.users?.email || session.user?.email || null;
      const changer = session.user?.email || session.user?.id || "Someone";
      const title = (ticketRec as any)?.title || "Support ticket";

      if (isAdmin) {
        // Admin changed status -> notify ticket owner (user)
        if (userEmail) {
          notifyMessages.push({
            to: userEmail,
            subject: `Ticket status updated: ${title}`,
            markdownBody: `
The status of your support ticket **${title}** was changed to **${status}** by **${changer}**.
            `.trim(),
            buttonText: "View Ticket",
            buttonUrl: ticketUrl,
          });
        }
      } else {
        // User changed status -> notify support team
        notifyMessages.push({
          to: "support@plazen.org",
          subject: `Ticket status updated by user: ${title}`,
          markdownBody: `
User **${changer}** updated the status of ticket **${title}** to **${status}**.

          `.trim(),
          buttonText: "Open Ticket",
          buttonUrl: ticketUrl,
        });
      }

      if (notifyMessages.length > 0) {
        sendNotifications(notifyMessages);
      }
    } catch (err) {
      // Log and continue
      // eslint-disable-next-line no-console
      console.error("Error while sending status change notifications:", err);
    }
  }

  if (message) {
    const createdMsg = await prisma.support_ticket_messages.create({
      data: {
        ticket_id: id,
        user_id: session.user.id,
        message,
        is_internal: isAdmin ? is_internal || false : false,
      },
    });

    await prisma.support_tickets.update({
      where: { id },
      data: { updated_at: new Date() },
    });

    // Decide who to notify based on who posted the message
    if (isAdmin) {
      // Admin posted: if message is not internal, notify ticket owner
      if (!is_internal) {
        const ownerEmail = ticket.users?.email || null;
        if (ownerEmail) {
          notifyMessages.push({
            to: ownerEmail,
            subject: `Reply on ticket: ${ticket.title}`,
            markdownBody: `
A member of the support team has replied to your ticket.

**Reply:**
${message}

View the ticket: [View Ticket](${ticketUrl})
            `.trim(),
            buttonText: "View Ticket",
            buttonUrl: ticketUrl,
          });
        }
      }
    } else {
      // Regular user posted: notify support team
      const userDisplay = getDisplayName(
        ticket.users || {
          email: session.user.email,
          raw_user_meta_data: session.user.user_metadata,
        },
      );
      notifyMessages.push({
        to: "support@plazen.org",
        subject: `New message on ticket: ${ticket.title}`,
        markdownBody: `
User **${userDisplay}** added a new message to ticket **${ticket.title}**.

**Message:**
${message}

        `.trim(),
        buttonText: "Open Ticket",
        buttonUrl: ticketUrl,
      });
    }
  }

  // Send notifications (non-blocking; errors are logged inside helper)
  if (notifyMessages.length > 0) {
    sendNotifications(notifyMessages);
  }

  return NextResponse.json({ success: true });
}

// Allow administrators to delete a ticket and associated messages/labels
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });
  const isAdmin = profile?.role === "ADMIN";
  if (!isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Use a transaction to remove messages and label relations, then the ticket
    await prisma.$transaction([
      prisma.support_ticket_messages.deleteMany({ where: { ticket_id: id } }),
      prisma.support_tickets_labels.deleteMany({ where: { ticket_id: id } }),
      prisma.support_tickets.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to delete ticket:", err);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 },
    );
  }
}
