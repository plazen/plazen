/**
 * devMode.ts
 *
 * Development mode detection and configuration.
 *
 * When DEV_MODE=true is set in environment variables, the application will:
 * - Use in-memory storage instead of PostgreSQL/Supabase
 * - Auto-authenticate as local@plazen.org
 * - All APIs continue to work normally but without external dependencies
 *
 * This allows running and testing the application without configuring:
 * - Supabase project
 * - PostgreSQL database
 * - External OAuth providers
 */

/**
 * Check if the application is running in dev mode (no database required).
 * Set DEV_MODE=true in your environment to enable this.
 *
 * Works on both server and client side by checking both env vars.
 */
export function isDevMode(): boolean {
  // Check server-side env var first, then client-side
  return (
    process.env.DEV_MODE === "true" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true"
  );
}

/**
 * The default user ID for dev mode.
 * This is a fixed UUID that represents the local@plazen.org user.
 */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * The default user email for dev mode.
 */
export const DEV_USER_EMAIL = "local@plazen.org";

/**
 * Dev mode user object that mimics Supabase auth user structure.
 */
export const DEV_USER = {
  id: DEV_USER_ID,
  email: DEV_USER_EMAIL,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {
    full_name: "Local Developer",
    avatar_url: null,
  },
};

/**
 * Dev mode session object that mimics Supabase auth session structure.
 */
export const DEV_SESSION = {
  access_token: "dev-mode-access-token",
  refresh_token: "dev-mode-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: DEV_USER,
};
