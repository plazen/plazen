/*
 * API: GET /api/documentation
 *
 * Purpose:
 * - Return all documentation entries grouped/ordered by category for public consumption.
 *
 * Behavior:
 * - Performs a Prisma query to fetch all rows from `documentation_entries`, ordering
 *   the results by the `category` column (ascending).
 *
 * Authentication:
 * - Public endpoint (does not require authentication). Consumers should treat the
 *   returned content as public documentation.
 *
 * Response:
 * - 200: JSON array of documentation entries.
 * - 500: JSON object { error: "Failed to fetch documentation entries" } on server error.
 *
 * Notes:
 * - The route is marked `force-dynamic` to ensure it always reads fresh data from the
 *   database rather than being statically cached.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const docEntries = await prisma.documentation_entries.findMany({
      orderBy: {
        category: "asc",
      },
    });

    return NextResponse.json(docEntries, { status: 200 });
  } catch (error) {
    console.error("Error fetching documentation entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch documentation entries" },
      { status: 500 },
    );
  }
}
