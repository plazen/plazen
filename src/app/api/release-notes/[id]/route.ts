/*
 * API: GET /api/release-notes/[id]
 *
 * Purpose:
 * - Return a single release note entry identified by its `id`.
 *
 * Behavior:
 * - Performs a Prisma lookup against `release_notes` using the provided path parameter `id`.
 *
 * Parameters:
 * - Path param: `id` (string) — required. The unique identifier of the release note.
 *
 * Authentication:
 * - Public read-only endpoint. No authentication is required by this handler.
 *
 * Responses:
 * - 200: Returns the requested release note as JSON.
 * - 400: { error: "ID is required" } when `id` is missing or empty.
 * - 404: { error: "Note not found" } when no row matches the given id.
 * - 500: { error: "Failed to fetch release note" } on unexpected server errors.
 *
 * Notes:
 * - The route aligns with other release-notes/documentation endpoints and is intended
 *   to always return fresh data from the database rather than a cached static response.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const releaseNote = await prisma.release_notes.findUnique({
      where: { id },
    });

    if (!releaseNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json(releaseNote, { status: 200 });
  } catch (error) {
    console.error("Error fetching release note:", error);
    return NextResponse.json(
      { error: "Failed to fetch release note" },
      { status: 500 },
    );
  }
}
