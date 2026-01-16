import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SMTPClient } from "@/lib/smtpClient";
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

// POST - Verify email configuration (SMTP and/or IMAP)
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type = "both" } = body; // 'smtp', 'imap', or 'both'

    const results: {
      smtp?: { success: boolean; error?: string };
      imap?: { success: boolean; error?: string };
    } = {};

    // Verify SMTP
    if (type === "smtp" || type === "both") {
      if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS
      ) {
        results.smtp = {
          success: false,
          error: "SMTP is not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.",
        };
      } else {
        try {
          const smtpClient = SMTPClient.fromEnv();
          const verified = await smtpClient.verify();
          results.smtp = {
            success: verified,
            error: verified ? undefined : "Failed to authenticate with SMTP server",
          };
        } catch (error) {
          results.smtp = {
            success: false,
            error: error instanceof Error ? error.message : "SMTP verification failed",
          };
        }
      }
    }

    // Verify IMAP
    if (type === "imap" || type === "both") {
      if (
        !process.env.IMAP_HOST &&
        !(process.env.SMTP_USER && process.env.SMTP_PASS)
      ) {
        results.imap = {
          success: false,
          error: "IMAP is not configured. Please set IMAP_HOST and credentials environment variables.",
        };
      } else {
        try {
          const imapClient = IMAPClient.fromEnv();
          const verified = await imapClient.verify();
          results.imap = {
            success: verified,
            error: verified ? undefined : "Failed to authenticate with IMAP server",
          };
        } catch (error) {
          results.imap = {
            success: false,
            error: error instanceof Error ? error.message : "IMAP verification failed",
          };
        }
      }
    }

    const allSuccess = Object.values(results).every((r) => r?.success);

    return NextResponse.json({
      success: allSuccess,
      results,
    });
  } catch (error: unknown) {
    console.error("Error verifying email configuration:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
