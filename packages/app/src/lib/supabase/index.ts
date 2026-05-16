/**
 * Supabase client factory.
 *
 * Web: `getBrowserSupabase()` returns a singleton that persists sessions in
 * cookies via `@supabase/ssr` (when used inside `apps/web`). For client-side
 * code we accept the default localStorage persistence — middleware in
 * `apps/web/middleware.ts` keeps the cookie session refreshed.
 *
 * Native: callers (apps/native) pass a SecureStore-backed adapter into
 * `createSupabaseClient({ sessionStorage })` so tokens live in the OS keychain.
 */

import { createClient, type SupabaseClient as RawSupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@reknowable/types';
import { env } from '../env';

export type SupabaseClient = RawSupabaseClient<Database>;

export type SessionStorage = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

type Options = {
  /** Override session storage. On native, pass a SecureStore-backed adapter. */
  sessionStorage?: SessionStorage;
  /** Disable session persistence — for one-shot scripts. */
  persistSession?: boolean;
};

export function createSupabaseClient(opts: Options = {}): SupabaseClient {
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      ...(opts.sessionStorage ? { storage: opts.sessionStorage } : {}),
      persistSession: opts.persistSession ?? true,
      autoRefreshToken: true,
      detectSessionInUrl: typeof window !== 'undefined',
    },
  });
}

let browserSingleton: SupabaseClient | null = null;

/**
 * Browser-only singleton. Throws if called outside a browser environment.
 * Server-side rendering on Next.js uses `@supabase/ssr`'s `createServerClient`
 * directly inside route handlers / middleware — not this singleton.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      'getBrowserSupabase() called outside a browser. Use createSupabaseClient() in server contexts.',
    );
  }
  if (!browserSingleton) {
    // createBrowserClient persists the session in cookies (not localStorage),
    // which the @supabase/ssr middleware reads on every request. This is what
    // keeps client-side auth state in sync with server components — without
    // it, signInWithPassword sets localStorage but the middleware sees no
    // session cookie and bounces the user back to /sign-in.
    //
    // The `as unknown as SupabaseClient` cast bridges a tiny shape mismatch
    // between @supabase/ssr's 4-generic and supabase-js's 3-generic
    // SupabaseClient (functionally identical for our use).
    browserSingleton = createBrowserClient(
      env.supabaseUrl,
      env.supabasePublishableKey,
    ) as unknown as SupabaseClient;
  }
  return browserSingleton;
}

/** TEST-ONLY: reset the singleton between tests. */
export function __resetBrowserSupabaseForTests(): void {
  browserSingleton = null;
}
