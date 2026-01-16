/**
 * supabaseServer.ts
 *
 * Drop-in replacement for @supabase/ssr's createServerClient that automatically
 * uses mock authentication when DEV_MODE=true.
 *
 * Usage:
 * Replace:
 *   import { createServerClient } from "@supabase/ssr";
 * With:
 *   import { createServerClient } from "@/lib/supabaseServer";
 *
 * The rest of the code remains unchanged.
 */

import { createServerClient as realCreateServerClient } from "@supabase/ssr";
import { isDevMode } from "./devMode";
import { createMockServerClient } from "./mockSupabase";

// Type for cookie options (matches @supabase/ssr deprecated interface)
interface CookieOptions {
  get: (name: string) => string | undefined;
  set?: (
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ) => void;
  remove?: (name: string, options?: Record<string, unknown>) => void;
}

/**
 * Create a Supabase server client.
 *
 * When DEV_MODE=true, returns a mock client that always returns the dev user session.
 * Otherwise, creates a real Supabase client with the provided configuration.
 *
 * @param supabaseUrl - Supabase project URL (ignored in dev mode)
 * @param supabaseKey - Supabase anon key (ignored in dev mode)
 * @param options - Configuration options including cookie handlers
 */
export function createServerClient(
  supabaseUrl: string,
  supabaseKey: string,
  options?: { cookies: CookieOptions },
) {
  if (isDevMode()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createMockServerClient(supabaseUrl, supabaseKey, options) as any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return realCreateServerClient(supabaseUrl, supabaseKey, options as any);
}

// Re-export for convenience
export { isDevMode } from "./devMode";
