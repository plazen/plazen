import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Plus, MessageSquare } from "lucide-react";
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = {
  title: "Support",
  description: "Track your support tickets and get help with Plazen.",
};

export default async function SupportPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const tickets = await prisma.support_tickets.findMany({
    where: { user_id: session?.user.id },
    orderBy: { updated_at: "desc" },
    include: { labels: { include: { label: true } } },
  });

  return (
    <div className="container max-w-4xl min-h-screen mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Support Tickets</h1>
          <p className="text-muted-foreground mt-1">
            Track your inquiries and issues.
          </p>
        </div>
        <Button asChild>
          <Link href="/support/new">
            <Plus className="mr-2 h-4 w-4" /> New Ticket
          </Link>
        </Button>
      </div>

      <div className="space-y-4">
        {tickets.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg shadow-sm">
            <div className="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No tickets yet</h3>
            <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
              You haven&apos;t created any support tickets yet. If you need
              help, feel free to create one.
            </p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/support/${ticket.id}`}
              className="block group"
            >
              <div className="bg-card rounded-lg p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:bg-card/80">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                        {ticket.title}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${
                          ticket.status === "open"
                            ? "bg-green-500/10 text-green-500"
                            : ticket.status === "closed"
                              ? "bg-muted text-muted-foreground"
                              : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {ticket.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>#{ticket.id.split("-")[0]}</span>
                      <span>•</span>
                      <span>
                        Updated{" "}
                        {formatDistanceToNow(new Date(ticket.updated_at))} ago
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {ticket.labels.map(({ label }) => (
                      <span
                        key={label.id}
                        className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground font-medium"
                        style={{ borderLeft: `3px solid ${label.color}` }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
