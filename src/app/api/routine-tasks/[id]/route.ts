/*
 * API: /api/routine-tasks/[id]
 *
 * Endpoints:
 * - PATCH /api/routine-tasks/[id]
 *   - Purpose: Update a routine task template belonging to the authenticated user.
 *   - Request body fields: { title?, description?, duration_minutes?, is_active? }
 *   - Behavior: Encrypts `title` before persisting, updates `updated_at`, and
 *     returns the updated routine task with the title decrypted for safe display.
 *
 * - DELETE /api/routine-tasks/[id]
 *   - Purpose: Delete a routine task template belonging to the authenticated user.
 *   - Behavior: Removes the task row when it belongs to the session user.
 *
 * Authentication:
 * - All handlers require an active Supabase session (validated via the SSR client
 *   and Next's cookie helpers). Requests without a valid session receive 401.
 *
 * Responses:
 * - 200 / 201 on success (handlers document specifics inline).
 * - 401 when unauthenticated.
 * - 400/403/500 for various validation/permission/server errors as appropriate.
 *
 * Notes:
 * - Titles are stored encrypted at rest using the project's encryption helpers.
 * - Handlers are implemented server-side and use Prisma for DB access.
 */
import { createServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

/*
 * PATCH /api/routine-tasks/[id]
 *
 * Purpose:
 * - Update a routine task template owned by the authenticated user.
 *
 * Expected request body (any subset):
 * - { title?: string, description?: string | null, duration_minutes?: number, is_active?: boolean }
 *
 * Behavior:
 * - Validates the Supabase session server-side.
 * - Encrypts the `title` (if provided) before persisting.
 * - Updates `updated_at` to the current time.
 * - Returns the updated routine task with the `title` decrypted in the response.
 *
 * Responses:
 * - 200: updated routine task (title decrypted)
 * - 401: { error: "Unauthorized" } when not authenticated
 * - 500: { error: "Internal server error" } on unexpected errors
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    const body = await request.json();
    const { title, description, duration_minutes, is_active } = body;

    const dataToUpdate: {
      title?: string;
      description?: string | null;
      duration_minutes?: number;
      is_active?: boolean;
      updated_at?: Date;
    } = {
      updated_at: new Date(),
    };

    if (title !== undefined) {
      dataToUpdate.title = encrypt(title);
    }

    if (description !== undefined) {
      dataToUpdate.description = description || null;
    }

    if (duration_minutes !== undefined) {
      dataToUpdate.duration_minutes = parseInt(duration_minutes);
    }

    if (is_active !== undefined) {
      dataToUpdate.is_active = is_active;
    }

    const updatedRoutineTask = await prisma.routine_tasks.update({
      where: {
        id,
        user_id: session.user.id,
      },
      data: dataToUpdate,
    });

    const decryptedTask = {
      ...updatedRoutineTask,
      title: decrypt(updatedRoutineTask.title),
    };

    return NextResponse.json(decryptedTask, { status: 200 });
  } catch (error) {
    console.error("Error updating routine task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/*
 * DELETE /api/routine-tasks/[id]
 *
 * Purpose:
 * - Delete a routine task template owned by the authenticated user.
 *
 * Behavior:
 * - Validates the Supabase session server-side.
 * - Deletes the specified routine task, ensuring the row belongs to the session user.
 *
 * Responses:
 * - 200: { message: "Routine task deleted successfully" } on success
 * - 401: { error: "Unauthorized" } when not authenticated
 * - 500: { error: "Internal server error" } on unexpected errors
 */
export async function DELETE(
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

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.routine_tasks.delete({
      where: {
        id,
        user_id: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Routine task deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting routine task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
