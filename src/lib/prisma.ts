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
 *
 * Usage:
 * - import prisma from "@/lib/prisma";
 * - Use `prisma` for database queries as a standard PrismaClient instance.
 *
 * Notes:
 * - Expects `DATABASE_URL` to be set in the environment.
 * - This module performs no automatic migrations; it only provides the client.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * createPrismaClient
 *
 * Build a PrismaClient using a `pg` Pool and the `@prisma/adapter-pg` adapter.
 * Reading the connection string from `process.env.DATABASE_URL` keeps configuration
 * out of code and consistent with Twelve-Factor principles.
 *
 * Returns:
 *   A newly constructed `PrismaClient` instance backed by a shared `pg` Pool.
 */
const createPrismaClient = () => {
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
 * - In development we store the client on the global object to avoid creating
 *   multiple clients during module hot-reloads (which can otherwise exhaust DB connections).
 * - In production a fresh client is created for the process.
 */
const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV === "development") {
  global.prisma = prisma;
}

export default prisma;
