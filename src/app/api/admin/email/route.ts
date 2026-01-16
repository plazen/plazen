import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SMTPClient, EmailMessage } from "@/lib/smtpClient";
import { generateEmailFromMarkdown } from "@/lib/emailTemplate";
import { htmlToText } from "html-to-text";

export const dynamic = "force-dynamic";

// Allowed sender email addresses
const ALLOWED_SENDERS = [
  { email: "support@plazen.org", name: "Plazen Support" },
  { email: "us@plazen.org", name: "Plazen Team" },
];

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

// GET - Get email configuration status and sent emails history
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const smtpConfigured = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    const imapConfigured = !!(
      process.env.IMAP_HOST &&
      (process.env.IMAP_USER || process.env.SMTP_USER) &&
      (process.env.IMAP_PASS || process.env.SMTP_PASS)
    );

    // Return configuration status
    return NextResponse.json({
      smtp: {
        configured: smtpConfigured,
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT || "587",
        secure: process.env.SMTP_SECURE === "true",
        from: {
          name: process.env.SMTP_FROM_NAME || "Plazen",
          email: process.env.SMTP_FROM_EMAIL || null,
        },
        allowedSenders: ALLOWED_SENDERS,
      },
      imap: {
        configured: imapConfigured,
        host: process.env.IMAP_HOST || null,
        port: process.env.IMAP_PORT || "993",
        secure: process.env.IMAP_SECURE !== "false",
      },
    });
  } catch (error: unknown) {
    console.error("Error fetching email config:", error);
    return NextResponse.json(
      { error: "Failed to fetch email configuration" },
      { status: 500 },
    );
  }
}

// POST - Send an email
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      to,
      cc,
      bcc,
      subject,
      content,
      contentType = "markdown",
      replyTo,
      inReplyTo,
      references,
      template,
      templateData,
      from,
    } = body;

    // Validate required fields
    if (!to || !subject) {
      return NextResponse.json(
        { error: "Recipient (to) and subject are required" },
        { status: 400 },
      );
    }

    if (!content && !template) {
      return NextResponse.json(
        { error: "Either content or template is required" },
        { status: 400 },
      );
    }

    // Check SMTP configuration
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS
    ) {
      return NextResponse.json(
        {
          error:
            "SMTP is not configured. Please set SMTP environment variables.",
        },
        { status: 500 },
      );
    }

    // Generate email content
    let html: string;
    let text: string;

    if (template) {
      // Use a pre-built template
      // This could be extended to support more templates
      const emailContent = generateEmailFromMarkdown(
        subject,
        templateData?.content || content || "",
        {
          preheader: templateData?.preheader,
          footerText: templateData?.footerText,
        },
      );
      html = emailContent.html;
      text = emailContent.text;
    } else if (contentType === "markdown") {
      const emailContent = generateEmailFromMarkdown(subject, content);
      html = emailContent.html;
      text = emailContent.text;
    } else if (contentType === "html") {
      html = content;
      text = htmlToText(content);
    } else {
      html = `<p>${content.replace(/\n/g, "<br>")}</p>`;
      text = content;
    }

    // Prepare recipients
    const recipients: string[] = Array.isArray(to) ? to : [to];
    const ccRecipients = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;
    const bccRecipients = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;

    // Validate and set the from address
    let fromAddress: { email: string; name: string } | undefined;
    if (from) {
      const allowedSender = ALLOWED_SENDERS.find(
        (s) => s.email.toLowerCase() === from.toLowerCase(),
      );
      if (!allowedSender) {
        return NextResponse.json(
          {
            error: `Invalid sender address. Allowed: ${ALLOWED_SENDERS.map((s) => s.email).join(", ")}`,
          },
          { status: 400 },
        );
      }
      fromAddress = allowedSender;
    }

    // Create SMTP client
    const smtpClient = SMTPClient.fromEnv();

    // Build email message
    const message: EmailMessage = {
      to: recipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      html,
      text,
      replyTo,
      inReplyTo,
      references,
      from: fromAddress,
    };

    // Send email
    const result = await smtpClient.send(message);

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        recipients:
          recipients.length +
          (ccRecipients?.length || 0) +
          (bccRecipients?.length || 0),
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 500 },
    );
  }
}
