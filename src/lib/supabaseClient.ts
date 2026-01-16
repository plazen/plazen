/**
 * supabaseClient.ts
 *
 * Drop-in replacement for @supabase/ssr's createBrowserClient that automatically
 * uses mock authentication when DEV_MODE=true.
 *
 * Usage:
 * Replace:
 *   import { createBrowserClient } from "@supabase/ssr";
 * With:
 *   import { createBrowserClient } from "@/lib/supabaseClient";
 *
 * The rest of the code remains unchanged.
 */

import { createBrowserClient as realCreateBrowserClient } from "@supabase/ssr";
import { isDevMode } from "./devMode";
import { createMockBrowserClient } from "./mockSupabase";

/**
 * Create a Supabase browser client.
 *
 * When DEV_MODE=true, returns a mock client that always returns the dev user session.
 * Otherwise, creates a real Supabase browser client with the provided configuration.
 *
 * @param supabaseUrl - Supabase project URL (ignored in dev mode)
 * @param supabaseKey - Supabase anon key (ignored in dev mode)
 */
export function createBrowserClient(supabaseUrl: string, supabaseKey: string) {
  if (isDevMode()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createMockBrowserClient(supabaseUrl, supabaseKey) as any;
  }

  return realCreateBrowserClient(supabaseUrl, supabaseKey);
}

// Re-export for convenience
export { isDevMode } from "./devMode";
