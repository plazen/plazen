import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import SMTPClient from "@/lib/smtpClient";
import { generateEmailFromMarkdown } from "@/lib/emailTemplate";

/**
 * Helper: send notification emails using the existing SMTP client and
 * the email template generator.
 *
 * This keeps the actual API handler logic small and avoids hard-failing
 * the request if email sending fails.
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

    // Build EmailMessage[] compatible with SMTPClient.sendBatch
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

    // Use a single connection to send all messages
    await smtp.sendBatch(emailMessages);
  } catch (err) {
    // Don't block the API on email failures — just log
    // (In production you might want structured logging or retry/backoff)
    // eslint-disable-next-line no-console
    console.error("Failed to send notification emails:", err);
  }
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

  const json = await request.json();
  const { title, message, priority } = json;

  const ticket = await prisma.support_tickets.create({
    data: {
      user_id: session.user.id,
      title,
      priority: priority || "normal",
      messages: {
        create: {
          user_id: session.user.id,
          message: message,
        },
      },
    },
  });

  // Notify both support team and user about the new ticket.
  // Build a friendly markdown body with a link to view the ticket.
  try {
    // Determine user email (prefer session value, fallback to DB)
    let userEmail = session.user.email || null;
    if (!userEmail) {
      const userRecord = await prisma.users.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      });
      userEmail = userRecord?.email || null;
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    const ticketUrl = `${baseUrl}/support/${ticket.id}`;

    const creatorName =
      session.user?.user_metadata?.full_name ||
      session.user?.user_metadata?.display_name ||
      session.user?.email?.split("@")[0] ||
      "A user";

    const subjectForUser = `Support ticket created: ${title}`;
    const markdownForUser = `
Hi ${creatorName},

Your support ticket has been created.

**Subject:** ${title}

**Message:**
${message || "_(no message provided)_"}

    `.trim();

    const subjectForSupport = `New support ticket: ${title}`;
    const markdownForSupport = `
A new support ticket was created by **${creatorName}**.

**Subject:** ${title}

**Message:**
${message || "_(no message provided)_"}

    `.trim();

    const notifyMsgs = [];

    if (userEmail) {
      notifyMsgs.push({
        to: userEmail,
        subject: subjectForUser,
        markdownBody: markdownForUser,
        buttonText: "View Ticket",
        buttonUrl: ticketUrl,
      });
    }

    // Always notify support team
    notifyMsgs.push({
      to: "support@plazen.org",
      subject: subjectForSupport,
      markdownBody: markdownForSupport,
      buttonText: "Open Ticket",
      buttonUrl: ticketUrl,
    });

    // Fire-and-forget; failures are logged inside helper
    sendNotifications(notifyMsgs);
  } catch (err) {
    // Log and continue — do not fail ticket creation on email problems
    // eslint-disable-next-line no-console
    console.error("Error preparing/sending ticket creation emails:", err);
  }

  return NextResponse.json(ticket);
}

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

  const profile = await prisma.profiles.findUnique({
    where: { id: session.user.id },
  });

  const isAdmin = profile?.role === "ADMIN";

  const tickets = await prisma.support_tickets.findMany({
    where: isAdmin ? {} : { user_id: session.user.id },
    include: {
      users: { select: { email: true } },
      labels: { include: { label: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json(tickets);
}
