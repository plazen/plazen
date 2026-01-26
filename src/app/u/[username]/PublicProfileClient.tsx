"use client";

import Link from "next/link";
import { PlazenLogo } from "@/components/plazen-logo";
import { Button } from "@/app/components/ui/button";
import { BadgeDisplay } from "@/app/components/BadgeDisplay";
import type { PublicProfile } from "@/types/profile";
import { User as UserIcon, Check, BarChart3, Calendar } from "lucide-react";

interface PublicProfileClientProps {
  profile: PublicProfile;
}

export default function PublicProfileClient({
  profile,
}: PublicProfileClientProps) {
  const memberSinceFormatted = profile.stats.memberSince
    ? new Date(profile.stats.memberSince).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "N/A";

  return (
    <div className="min-h-screen bg-background text-foreground font-lexend">
      {/* Header */}
      <header className="border-b border-border backdrop-blur-sm bg-background/95">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <PlazenLogo />
            <span className="font-semibold">Plazen</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Profile header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center mb-4">
            <UserIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold">@{profile.username}</h1>
          {profile.bio && (
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Badges */}
        {profile.badges.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 text-center">Badges</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {profile.badges.map((badge) => (
                <BadgeDisplay key={badge.name} badge={badge} />
              ))}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Tasks Completed"
            value={profile.stats.totalTasksCompleted}
            icon={Check}
            color="text-green-500"
          />
          <StatCard
            label="Day Streak"
            value={profile.stats.currentStreak}
            icon={BarChart3}
            color="text-orange-500"
          />
          <StatCard
            label="Member Since"
            value={memberSinceFormatted}
            icon={Calendar}
            color="text-blue-500"
          />
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col items-center text-center">
      <div
        className={`p-2 rounded-full bg-background border border-border mb-3 ${color}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </span>
    </div>
  );
}
