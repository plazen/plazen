/*
 * API: GET /api/release-notes
 *
 * Purpose:
 * - Provide a public, read-only list of application release notes ordered by version.
 *
 * Behavior:
 * - Performs a Prisma query against the `release_notes` table and orders entries
 *   descending by the `version` field so the newest notes are returned first.
 *
 * Authentication:
 * - This endpoint is public and does not require authentication.
 *
 * Response:
 * - 200: JSON array of release note rows ordered by version (desc).
 * - 500: { error: "Failed to fetch release notes" } when an unexpected server error occurs.
 *
 * Notes:
 * - The route is marked `force-dynamic` to ensure fresh data is returned from the database
 *   rather than serving a cached static response.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const releaseNotes = await prisma.release_notes.findMany({
      orderBy: {
        version: "desc",
      },
    });

    return NextResponse.json(releaseNotes, { status: 200 });
  } catch (error) {
    console.error("Error fetching release notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch release notes" },
      { status: 500 },
    );
  }
}
