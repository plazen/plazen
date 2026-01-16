/**
 * supabase.ts
 *
 * Unified Supabase client creation helpers that automatically use mock clients
 * when DEV_MODE=true.
 *
 * Usage:
 * - Import { createSupabaseServerClient } for server-side routes
 * - Import { createSupabaseBrowserClient } for client-side components
 *
 * These functions will automatically return mock clients in dev mode.
 */

import { isDevMode } from "./devMode";
import {
  createMockServerClient,
  createMockBrowserClient,
} from "./mockSupabase";

// Re-export types for convenience
export type { Session, User } from "@supabase/supabase-js";

/**
 * Create a Supabase server client for use in API routes and server components.
 *
 * In dev mode, returns a mock client that always authenticates as local@plazen.org.
 *
 * @param cookieStore - The Next.js cookie store from `cookies()`
 */
export async function createSupabaseServerClient(cookieStore: {
  get: (name: string) => { value: string } | undefined;
  set?: (options: { name: string; value: string; [key: string]: unknown }) => void;
  delete?: (options: { name: string; [key: string]: unknown }) => void;
}) {
  if (isDevMode()) {
    return createMockServerClient("", "");
  }

  const { createServerClient } = await import("@supabase/ssr");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          cookieStore.set?.({ name, value, ...options });
        },
        remove(name: string, options) {
          cookieStore.delete?.({ name, ...options });
        },
      },
    },
  );
}

/**
 * Create a Supabase browser client for use in client components.
 *
 * In dev mode, returns a mock client that always authenticates as local@plazen.org.
 */
export function createSupabaseBrowserClient() {
  if (isDevMode()) {
    return createMockBrowserClient("", "");
  }

  const { createBrowserClient } = require("@supabase/ssr");

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Helper to check if we're in dev mode from client-side code.
 * This reads from the environment variable that's exposed to the client.
 */
export function isClientDevMode(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}
