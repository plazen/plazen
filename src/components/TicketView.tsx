"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Send, X, Shield, User } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import LoadingSpinner from "@/app/components/LoadingSpinner";
import { createBrowserClient } from "@supabase/ssr";

type User = {
  id: string;
  email: string | null;
  display_name?: string | null;
  avatar_path?: string | null;
};

type Label = {
  id: string;
  name: string;
  color: string;
};

type TicketLabel = {
  label: Label;
};

type Message = {
  id: string;
  message: string;
  created_at: string;
  is_internal: boolean;
  user: User;
};

type Ticket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  users: User;
  messages: Message[];
  labels: TicketLabel[];
};

type AllLabels = Label;

interface TicketViewProps {
  ticketId: string;
  isAdmin: boolean;
}

export function TicketView({ ticketId, isAdmin }: TicketViewProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [allLabels, setAllLabels] = useState<AllLabels[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<{ [userId: string]: string }>(
    {},
  );

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          setCurrentUserId(session.user.id);
        }

        const ticketRes = await fetch(`/api/support/tickets/${ticketId}`);
        if (!ticketRes.ok) throw new Error("Failed to fetch ticket");
        const ticketData = await ticketRes.json();
        setTicket(ticketData);

        if (isAdmin) {
          const labelsRes = await fetch("/api/support/labels");
          if (!labelsRes.ok) throw new Error("Failed to fetch labels");
          const labelsData = await labelsRes.json();
          setAllLabels(labelsData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ticketId, isAdmin, supabase.auth]);

  // Fetch signed avatar URLs for all users with avatar_path
  useEffect(() => {
    const fetchAvatars = async () => {
      if (!ticket) return;
      const users = [ticket.users, ...ticket.messages.map((msg) => msg.user)];
      const uniqueUsers = Object.values(
        users.reduce(
          (acc, user) => {
            if (user.avatar_path && !acc[user.id]) acc[user.id] = user;
            return acc;
          },
          {} as { [id: string]: User },
        ),
      );

      const urlMap: { [userId: string]: string } = {};
      await Promise.all(
        uniqueUsers.map(async (user) => {
          try {
            const res = await fetch(
              `/api/account/avatar/signed-url?path=${encodeURIComponent(user.avatar_path!)}`,
            );
            const data = await res.json();
            if (data.url) urlMap[user.id] = data.url;
          } catch {}
        }),
      );
      setAvatarUrls(urlMap);
    };
    fetchAvatars();
  }, [ticket]);

  const refreshTicket = async () => {
    const res = await fetch(`/api/support/tickets/${ticketId}`);
    if (res.ok) {
      const data = await res.json();
      setTicket(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticket || !currentUserId) return;

    const optimisticMessage: Message = {
      id: Math.random().toString(),
      message: newMessage,
      created_at: new Date().toISOString(),
      is_internal: isInternal,
      user: {
        id: currentUserId,
        email: ticket.users.email,
      },
    };

    setTicket((prevTicket) => {
      if (!prevTicket) return null;
      return {
        ...prevTicket,
        messages: [...prevTicket.messages, optimisticMessage],
      };
    });

    setNewMessage("");
    setIsInternal(false);

    await fetch(`/api/support/tickets/${ticket.id}`, {
      method: "POST",
      body: JSON.stringify({
        message: newMessage,
        is_internal: isInternal,
      }),
    });

    await refreshTicket();
  };

  const handleStatusChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const newStatus = e.target.value;
    if (!ticket) return;
    await fetch(`/api/support/tickets/${ticket.id}`, {
      method: "POST",
      body: JSON.stringify({ status: newStatus }),
    });
    await refreshTicket();
  };

  const handleAddLabel = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const labelId = e.target.value;
    if (!labelId || !ticket) return;

    await fetch(`/api/support/tickets/${ticket.id}/labels`, {
      method: "POST",
      body: JSON.stringify({ labelId }),
    });
    await refreshTicket();
  };

  const handleRemoveLabel = async (labelId: string) => {
    if (!ticket) return;
    await fetch(`/api/support/tickets/${ticket.id}/labels?labelId=${labelId}`, {
      method: "DELETE",
    });
    await refreshTicket();
  };

  if (loading) {
    return <LoadingSpinner text="Loading ticket..." />;
  }

  if (error) {
    return <div className="text-destructive">{error}</div>;
  }

  if (!ticket) {
    return <div>Ticket not found</div>;
  }

  const ticketLabels = ticket.labels.map((l) => l.label);
  const availableLabels = allLabels.filter(
    (l) => !ticketLabels.find((tl) => tl.id === l.id),
  );

  return (
    <div className="container max-w-4xl mx-auto py-10 px-4">
      <Link
        href={isAdmin ? "/admin/support" : "/support"}
        className="text-sm text-muted-foreground hover:text-primary flex items-center mb-6 transition-colors"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="bg-card rounded-lg mb-6 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/40">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground px-2 py-1 rounded bg-secondary/50">
                  #{ticket.id.split("-")[0]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(ticket.created_at), "PPP p")}
                </span>
              </div>
              <h1 className="text-2xl font-bold">{ticket.title}</h1>
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                {ticket.users.avatar_path && avatarUrls[ticket.users.id] ? (
                  <img
                    src={avatarUrls[ticket.users.id]}
                    alt={
                      ticket.users.display_name ||
                      ticket.users.email ||
                      "Avatar"
                    }
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-background shadow-sm"
                  />
                ) : (
                  <span className="inline-flex h-6 w-6 rounded-full bg-secondary items-center justify-center text-xs font-bold text-foreground">
                    {ticket.users.display_name ? (
                      ticket.users.display_name[0]
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </span>
                )}
                <span className="font-medium text-foreground">
                  {ticket.users.display_name || ticket.users.email}
                </span>
              </p>
            </div>
            <div className="p-6 space-y-6">
              {ticket.messages
                .filter((msg) => isAdmin || !msg.is_internal)
                .map((msg) => (
                  <div key={msg.id} className="flex gap-4 group">
                    <div className="flex-shrink-0">
                      {msg.user.avatar_path && avatarUrls[msg.user.id] ? (
                        <img
                          src={avatarUrls[msg.user.id]}
                          alt={
                            msg.user.display_name || msg.user.email || "Avatar"
                          }
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-background shadow-sm"
                        />
                      ) : (
                        <div
                          className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center ring-2 ring-background shadow-sm",
                            msg.user.id === ticket.user_id
                              ? "bg-secondary text-foreground"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {msg.user.display_name ? (
                            msg.user.display_name[0]
                          ) : msg.user.id === ticket.user_id ? (
                            <User className="w-5 h-5" />
                          ) : (
                            <Shield className="w-5 h-5" />
                          )}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex-1 p-4 rounded-lg shadow-sm transition-colors",
                        msg.is_internal
                          ? "bg-yellow-500/10 border border-yellow-500/20"
                          : msg.user.id === currentUserId
                            ? "bg-primary/5 border border-primary/10"
                            : "bg-secondary/30 border border-border/50",
                      )}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-sm">
                          {msg.user.id === currentUserId
                            ? "You"
                            : msg.user.display_name || msg.user.email}
                          {msg.user.id !== ticket.user_id &&
                            !msg.is_internal &&
                            " (Support)"}
                          {msg.is_internal && " (Internal Note)"}
                        </span>
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {format(parseISO(msg.created_at), "p")}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-card rounded-lg shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-ring/30 transition-all"
          >
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={loading}
              className="flex min-h-[120px] w-full bg-transparent px-6 py-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none resize-none"
              placeholder={
                isAdmin
                  ? "Type your reply or add an internal note..."
                  : "Type your reply..."
              }
            />
            <div className="flex justify-between items-center bg-muted/20 border-t border-border/40 px-4 py-3">
              <div>
                {isAdmin && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary/20"
                    />
                    {isInternal ? "Internal Note" : "Public Reply"}
                  </label>
                )}
              </div>
              <Button type="submit" disabled={loading || !newMessage.trim()}>
                {loading ? "Sending..." : "Send Reply"}
                <Send className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card rounded-lg p-6 shadow-sm">
            <h3 className="font-semibold mb-4 text-lg">Details</h3>
            <div className="space-y-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">
                  Status
                </span>
                {isAdmin ? (
                  <select
                    value={ticket.status}
                    onChange={handleStatusChange}
                    className="w-full bg-secondary/50 rounded-md px-2 py-2 border-none focus:ring-1 focus:ring-primary cursor-pointer hover:bg-secondary/70 transition-colors"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="closed">Closed</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        ticket.status === "open"
                          ? "bg-green-500"
                          : ticket.status === "in_progress"
                            ? "bg-blue-500"
                            : "bg-gray-500",
                      )}
                    />
                    <span className="capitalize font-medium">
                      {ticket.status.replace("_", " ")}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">
                  Priority
                </span>
                <span
                  className={cn(
                    "inline-flex self-start px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                    ticket.priority === "high"
                      ? "bg-red-500/10 text-red-500"
                      : ticket.priority === "low"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-blue-500/10 text-blue-500",
                  )}
                >
                  {ticket.priority}
                </span>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="bg-card rounded-lg p-6 shadow-sm">
              <h3 className="font-semibold mb-4 text-lg">Labels</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {ticketLabels.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No labels assigned
                  </p>
                )}
                {ticketLabels.map((label) => (
                  <span
                    key={label.id}
                    className="flex items-center text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground font-medium group"
                    style={{ borderLeft: `3px solid ${label.color}` }}
                  >
                    {label.name}
                    <button
                      onClick={() => handleRemoveLabel(label.id)}
                      className="ml-2 text-muted-foreground hover:text-destructive transition-colors opacity-50 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <select
                  onChange={handleAddLabel}
                  disabled={availableLabels.length === 0}
                  value=""
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input/50 bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    {availableLabels.length > 0
                      ? "Add label..."
                      : "No labels available"}
                  </option>
                  {availableLabels.map((label) => (
                    <option
                      key={label.id}
                      value={label.id}
                      className="bg-background"
                    >
                      {label.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
