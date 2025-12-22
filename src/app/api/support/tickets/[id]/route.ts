import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
  const mapUser = (user) => {
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
  // Add a new message to the ticket
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

  if (status) {
    await prisma.support_tickets.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
  }

  if (message) {
    await prisma.support_ticket_messages.create({
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
  }

  return NextResponse.json({ success: true });
}
