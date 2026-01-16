import type { Metadata } from "next";
import { TicketView } from "@/components/TicketView";
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const ticket = await prisma.support_tickets.findUnique({
      where: { id },
      select: { title: true },
    });

    if (ticket) {
      return {
        title: `${ticket.title} - Support Ticket`,
        description: `View and manage your support ticket: ${ticket.title}`,
      };
    }
  } catch (error) {
    console.error("Failed to fetch ticket for metadata", error);
  }

  return {
    title: "Support Ticket",
    description: "View and manage your support ticket.",
  };
}

export default async function UserTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="min-h-screen bg-background">
      <TicketView ticketId={id} isAdmin={false} />
    </div>
  );
}
