/*
 * API: GET /api/release-notes
 *
 * Purpose:
 * - Provide a public, read-only list of application release notes ordered by version.
 *
 * Behavior:
 * - Performs a Prisma query against the `release_notes` table and sorts entries
 *   in-memory using semantic versioning (descending), ensuring 1.10 > 1.2.
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
    const releaseNotes = await prisma.release_notes.findMany({});

    // Sort in memory to handle semantic versioning correctly (e.g. 1.10 > 1.2)
    releaseNotes.sort((a, b) => {
      const versionA = (a.version || "").replace(/^v/, "");
      const versionB = (b.version || "").replace(/^v/, "");

      const partsA = versionA.split(".").map(Number);
      const partsB = versionB.split(".").map(Number);

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const valA = partsA[i] || 0;
        const valB = partsB[i] || 0;
        if (valA > valB) return -1;
        if (valA < valB) return 1;
      }
      return 0;
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
