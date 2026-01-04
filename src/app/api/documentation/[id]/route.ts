/*
 * API: GET /api/documentation/[id]
 *
 * Purpose:
 * - Return a single documentation entry identified by its `id`.
 *
 * Behavior:
 * - Performs a Prisma lookup against `documentation_entries` using the provided
 *   path parameter `id`. If the entry exists it is returned as JSON.
 *
 * Parameters:
 * - Path param: `id` (string) — required. The unique identifier of the documentation entry.
 *
 * Authentication:
 * - Public read-only endpoint. No authentication is required by this handler.
 *
 * Responses:
 * - 200: Returns the requested documentation entry as JSON.
 * - 400: { error: "ID is required" } when `id` is missing or empty.
 * - 404: { error: "Entry not found" } when no row matches the given id.
 * - 500: { error: "Failed to fetch documentation entry" } on unexpected server errors.
 *
 * Notes:
 * - The route is marked `force-dynamic` in other documentation routes to ensure fresh
 *   data is returned; this handler follows the same dynamic/data-first expectation.
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

    const docEntry = await prisma.documentation_entries.findUnique({
      where: { id },
    });

    if (!docEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json(docEntry, { status: 200 });
  } catch (error) {
    console.error("Error fetching documentation entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch documentation entry" },
      { status: 500 },
    );
  }
}
