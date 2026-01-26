/*
 * API: /api/profile/[username]
 *
 * Endpoint:
 * - GET /api/profile/[username]
 *   - Purpose: Fetch public profile data for a user by username
 *   - Auth: No authentication required (public endpoint)
 *   - Response: Profile data with badges and stats if public, 404 if not found/not public
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 },
    );
  }

  try {
    // Find user settings by username (case-insensitive), only if public
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
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Fetch user stats
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

    // Calculate stats
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

    return NextResponse.json(
      {
        username: settings.username,
        bio: settings.bio,
        badges: userBadges.map((ub) => ({
          name: ub.badge.name,
          description: ub.badge.description,
          icon: ub.badge.icon,
          color: ub.badge.color,
          granted_at: ub.granted_at,
        })),
        stats: {
          totalTasksCompleted: completedTasks,
          currentStreak: currentStreak,
          memberSince: userResult?.created_at?.toISOString() ?? null,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching public profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 },
    );
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
