import { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import PublicProfileClient from "./PublicProfileClient";
import type { PublicProfile } from "@/types/profile";

interface PageProps {
  params: Promise<{ username: string }>;
}

async function getPublicProfile(
  username: string,
): Promise<PublicProfile | null> {
  try {
    const settings = await prisma.userSettings.findFirst({
      where: {
        username: username.toLowerCase(),
        is_profile_public: true,
      },
      include: {
        user_badges: {
          include: {
            badge: true,
          },
          orderBy: {
            granted_at: "desc",
          },
        },
      },
    });

    if (!settings) {
      return null;
    }

    const [tasksResult, userResult] = await Promise.all([
      prisma.tasks.findMany({
        where: { user_id: settings.user_id },
        select: {
          is_completed: true,
          scheduled_time: true,
        },
      }),
      prisma.users.findUnique({
        where: { id: settings.user_id },
        select: { created_at: true },
      }),
    ]);

    const completedTasks = tasksResult.filter((t) => t.is_completed).length;
    const currentStreak = calculateDailyStreak(tasksResult);

    // Handle user_badges safely - it may not exist if migration hasn't run
    const userBadges =
      (
        settings as {
          user_badges?: Array<{
            badge: {
              name: string;
              description: string | null;
              icon: string | null;
              color: string;
            };
            granted_at: Date;
          }>;
        }
      ).user_badges ?? [];

    return {
      username: settings.username!,
      bio: settings.bio,
      badges: userBadges.map((ub) => ({
        name: ub.badge.name,
        description: ub.badge.description,
        icon: ub.badge.icon,
        color: ub.badge.color,
        granted_at: ub.granted_at.toISOString(),
      })),
      stats: {
        totalTasksCompleted: completedTasks,
        currentStreak: currentStreak,
        memberSince: userResult?.created_at?.toISOString() ?? null,
      },
    };
  } catch (error) {
    console.error("Error fetching public profile:", error);
    return null;
  }
}

function calculateDailyStreak(
  tasks: { is_completed: boolean; scheduled_time: Date | null }[],
): number {
  if (!tasks.length) return 0;

  const completedDays = new Set<string>();

  tasks.forEach((task) => {
    if (!task.is_completed || !task.scheduled_time) return;
    const iso = task.scheduled_time.toISOString();
    const dayKey = iso.split("T")[0];
    if (dayKey) completedDays.add(dayKey);
  });

  let streak = 0;

  const getLocalYYYYMMDD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

  const todayKey = getLocalYYYYMMDD(new Date());
  let cursorKey = todayKey;

  while (true) {
    if (completedDays.has(cursorKey)) {
      streak++;
      const d = new Date(`${cursorKey}T00:00:00`);
      d.setDate(d.getDate() - 1);
      cursorKey = getLocalYYYYMMDD(d);
    } else {
      break;
    }
  }

  return streak;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  if (!profile) {
    return {
      title: "Profile Not Found | Plazen",
      description: "This profile does not exist or is not public.",
    };
  }

  return {
    title: `@${profile.username} | Plazen`,
    description:
      profile.bio ||
      `${profile.username}'s productivity profile on Plazen. ${profile.stats.totalTasksCompleted} tasks completed.`,
    openGraph: {
      title: `@${profile.username} | Plazen`,
      description:
        profile.bio ||
        `${profile.stats.totalTasksCompleted} tasks completed, ${profile.stats.currentStreak} day streak`,
      type: "profile",
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  if (!profile) {
    notFound();
  }

  return <PublicProfileClient profile={profile} />;
}
