/*
 * /api/health
 *
 * Endpoints:
 * - GET /api/health
 *   - Checks the health of the application, specifically the database connection.
 *   - Returns 200 OK if the database is reachable.
 *   - Returns 500 Internal Server Error if the database connection fails.
 *
 * - OPTIONS /api/health
 *   - Returns CORS headers for the health check endpoint.
 *
 * Authentication:
 * - Publicly accessible (no authentication required).
 *
 * Notes:
 * - Used for monitoring and readiness probes.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // Run a simple query to check the database connection
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok", message: "Database connection successful" },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "error", message: "Database connection failed" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    },
  );
}
