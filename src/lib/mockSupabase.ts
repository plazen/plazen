/**
 * mockSupabase.ts
 *
 * Mock Supabase client for dev mode.
 * Returns a fake authenticated session for local@plazen.org without
 * requiring actual Supabase configuration.
 */

import { DEV_USER, DEV_SESSION } from "./devMode";

type AuthChangeCallback = (
  event: string,
  session: typeof DEV_SESSION | null,
) => void;

/**
 * Mock Supabase auth object that always returns the dev user session.
 */
export const mockSupabaseAuth = {
  getSession: async () => ({
    data: { session: DEV_SESSION },
    error: null,
  }),

  getUser: async () => ({
    data: { user: DEV_USER },
    error: null,
  }),

  signInWithOAuth: async () => ({
    data: { provider: "github", url: "/schedule" },
    error: null,
  }),

  signInWithPassword: async () => ({
    data: { user: DEV_USER, session: DEV_SESSION },
    error: null,
  }),

  signUp: async () => ({
    data: { user: DEV_USER, session: DEV_SESSION },
    error: null,
  }),

  signOut: async () => ({
    error: null,
  }),

  resetPasswordForEmail: async () => ({
    data: {},
    error: null,
  }),

  updateUser: async (attributes: { password?: string; email?: string }) => ({
    data: { user: { ...DEV_USER, ...attributes } },
    error: null,
  }),

  onAuthStateChange: (callback: AuthChangeCallback) => {
    // Immediately call with the dev session
    setTimeout(() => callback("SIGNED_IN", DEV_SESSION), 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },

  exchangeCodeForSession: async () => ({
    data: { session: DEV_SESSION },
    error: null,
  }),
};

/**
 * Mock Supabase storage for avatar uploads.
 */
export const mockSupabaseStorage = {
  from: (bucket: string) => ({
    createSignedUploadUrl: async (path: string) => ({
      data: {
        signedUrl: `http://localhost:3000/api/mock-storage/upload/${bucket}/${path}`,
        path,
        token: "mock-token",
      },
      error: null,
    }),

    createSignedUrl: async (path: string, expiresIn: number) => ({
      data: {
        signedUrl: `http://localhost:3000/api/mock-storage/${bucket}/${path}?expires=${expiresIn}`,
      },
      error: null,
    }),

    upload: async (path: string, file: unknown) => ({
      data: { path },
      error: null,
    }),

    download: async (path: string) => ({
      data: new Blob(),
      error: null,
    }),

    remove: async (paths: string[]) => ({
      data: paths.map((path) => ({ name: path })),
      error: null,
    }),

    list: async (path?: string) => ({
      data: [],
      error: null,
    }),
  }),
};

/**
 * Create a mock Supabase client that mimics the real client API.
 */
export function createMockSupabaseClient() {
  return {
    auth: mockSupabaseAuth,
    storage: mockSupabaseStorage,

    // Mock for direct table access (rarely used, but included for completeness)
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (column: string, value: unknown) => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      insert: (data: unknown) => ({
        select: () => ({
          single: async () => ({ data, error: null }),
        }),
      }),
      update: (data: unknown) => ({
        eq: (column: string, value: unknown) => ({
          select: () => ({
            single: async () => ({ data, error: null }),
          }),
        }),
      }),
      delete: () => ({
        eq: (column: string, value: unknown) => async () => ({
          error: null,
        }),
      }),
    }),
  };
}

/**
 * Mock server client creator (mimics createServerClient from @supabase/ssr).
 */
export function createMockServerClient(
  _supabaseUrl: string,
  _supabaseKey: string,
  _options?: unknown,
) {
  return createMockSupabaseClient();
}

/**
 * Mock browser client creator (mimics createBrowserClient from @supabase/ssr).
 */
export function createMockBrowserClient(
  _supabaseUrl: string,
  _supabaseKey: string,
) {
  return createMockSupabaseClient();
}

export default createMockSupabaseClient;
