/*
 * API: /api/routine-tasks
 *
 * Endpoints:
 * - GET  /api/routine-tasks
 *   - Purpose: Return the authenticated user's routine tasks (decrypted titles).
 *   - Auth: Requires a valid Supabase session cookie. Returns 401 when unauthenticated.
 *   - Behavior: Fetches routine tasks for the session user, decrypts stored titles
 *     and returns them ordered by creation date (descending).
 *
 * - POST /api/routine-tasks
 *   - Purpose: Create a new routine task for the authenticated user.
 *   - Auth: Requires a valid Supabase session cookie. Returns 401 when unauthenticated.
 *   - Request body (JSON): { title, description?, duration_minutes }
 *     - `title` and `duration_minutes` are required.
 *   - Behavior:
 *     - Enforces a free-plan limit (1 task) unless the user has a Pro subscription.
 *     - Encrypts the task title before persisting and returns the created task with
 *       the title decrypted in the response.
 *   - Responses:
 *     - 201: Created task JSON with decrypted title.
 *     - 400: Validation errors (missing fields).
 *     - 403: Forbidden (quota exceeded for free users).
 *     - 500: Internal server error.
 *
 * Notes:
 * - Handlers use Supabase SSR client wired to Next's cookie store to validate sessions.
 * - Titles are encrypted/decrypted using the project's encryption helpers to keep
 *   sensitive data protected at rest.
 * - The route is marked `force-dynamic` to ensure fresh DB reads on each request.
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.delete({ name, ...options });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const routineTasks = await prisma.routine_tasks.findMany({
      where: {
        user_id: session.user.id,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    const decryptedTasks = routineTasks.map((task) => ({
      ...task,
      title: decrypt(task.title),
    }));

    return NextResponse.json(decryptedTasks);
  } catch (error) {
    console.error("Error fetching routine tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, description, duration_minutes } = body;

    if (!title || !duration_minutes) {
      return NextResponse.json(
        { error: "Title and duration are required" },
        { status: 400 },
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { user_id: session.user.id },
      select: { is_pro: true },
    });

    if (!subscription?.is_pro) {
      const existingCount = await prisma.routine_tasks.count({
        where: { user_id: session.user.id },
      });

      if (existingCount >= 1) {
        return NextResponse.json(
          {
            error:
              "Free plan allows one routine task. Upgrade to Pro to add more.",
          },
          { status: 403 },
        );
      }
    }

    const encryptedTitle = encrypt(title);

    const routineTask = await prisma.routine_tasks.create({
      data: {
        user_id: session.user.id,
        title: encryptedTitle,
        description: description || null,
        duration_minutes: parseInt(duration_minutes),
      },
    });

    const decryptedTask = {
      ...routineTask,
      title: decrypt(routineTask.title),
    };

    return NextResponse.json(decryptedTask, { status: 201 });
  } catch (error) {
    console.error("Error creating routine task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
