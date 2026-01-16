/**
 * prisma.ts
 *
 * A small helper module that constructs and exports a configured Prisma client.
 *
 * Purpose:
 * - Centralise Prisma client creation so the rest of the application can import
 *   a single `prisma` instance.
 * - In development, attach the client to the global object to avoid creating
 *   multiple PrismaClient instances across hot reloads (prevents exhausting DB connections).
 * - Use a pg Pool with the Prisma Postgres adapter so connections are efficiently pooled.
 * - When DEV_MODE=true, use an in-memory mock client instead of a real database.
 *
 * Usage:
 * - import prisma from "@/lib/prisma";
 * - Use `prisma` for database queries as a standard PrismaClient instance.
 *
 * Notes:
 * - Expects `DATABASE_URL` to be set in the environment (unless DEV_MODE=true).
 * - This module performs no automatic migrations; it only provides the client.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { isDevMode } from "./devMode";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * createPrismaClient
 *
 * Build a PrismaClient using a `pg` Pool and the `@prisma/adapter-pg` adapter.
 * Reading the connection string from `process.env.DATABASE_URL` keeps configuration
 * out of code and consistent with Twelve-Factor principles.
 *
 * In dev mode, returns a mock client that implements the same API using in-memory storage.
 *
 * Returns:
 *   A newly constructed `PrismaClient` instance backed by a shared `pg` Pool,
 *   or a mock client when DEV_MODE=true.
 */
const createPrismaClient = (): PrismaClient => {
  // In dev mode, use the mock Prisma client with in-memory storage
  if (isDevMode()) {
    console.log("🔧 DEV_MODE enabled: Using in-memory mock database");
    // Dynamic import to avoid loading mock code in production
    // The mock implements the same API as PrismaClient
    const { mockPrisma } = require("./mockPrisma");
    return mockPrisma as unknown as PrismaClient;
  }

  // Otherwise use the real Prisma client with PostgreSQL
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
};

/**
 * `prisma`
 *
 * The default exported Prisma client used across the application.
 *
 * Behaviour:
 * - When DEV_MODE=true, returns an in-memory mock client that works without a database.
 * - In development we store the client on the global object to avoid creating
 *   multiple clients during module hot-reloads (which can otherwise exhaust DB connections).
 * - In production a fresh client is created for the process.
 */
const prisma: PrismaClient = global.prisma || createPrismaClient();

if (process.env.NODE_ENV === "development") {
  global.prisma = prisma;
}

export default prisma;
