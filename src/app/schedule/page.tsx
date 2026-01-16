import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabaseServer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule",
  description:
    "View and manage your daily schedule with Plazen's smart auto-scheduling.",
};

export default async function SchedulePage() {
  // Server-side session check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } },
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authCode = cookieStore.get("authCode")?.value;
  if (authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (!error) {
      cookieStore.delete("authCode");
      redirect("/schedule");
    } else {
      console.error("Error exchanging auth code:", error);
      redirect("/login?error=" + error.message);
    }
  }

  if (!session) {
    console.log("No session found, redirecting to login.");
    redirect("/login");
  }
  // Render the client timetable app
  const TimetableApp = (await import("./TimetableApp")).default;

  return (
    <div className="font-lexend">
      <TimetableApp />
    </div>
  );
}
