/**
 * testUserHarness — creates an isolated Supabase user for a test, returns a
 * client signed in as that user, plus a cleanup() that deletes the user.
 *
 * Reads env from SUPABASE_TEST_URL / SUPABASE_TEST_PUBLISHABLE_KEY /
 * SUPABASE_TEST_SECRET_KEY. The .env.test file at repo root sets these to
 * the local Supabase instance (`supabase start`).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type TestUser = {
  /** The Supabase user id (auth.users.id). */
  userId: string;
  /** Supabase client signed in as the user; RLS scopes to this user_id. */
  supabase: SupabaseClient;
  /** Admin client (service role). Use sparingly — bypasses RLS. */
  adminSupabase: SupabaseClient;
  /** Email assigned to the user (deterministic per test for debugging). */
  email: string;
  /** Deletes the user and all owned rows. Always call in `afterEach` or `using`. */
  cleanup: () => Promise<void>;
};

type Env = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

function readEnv(): Env {
  const url = process.env.SUPABASE_TEST_URL;
  const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_TEST_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      'testUserHarness requires SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY. ' +
        'Did you run `supabase start` and source `.env.test`? See supabase/CLAUDE.md.',
    );
  }
  return { url, publishableKey, secretKey };
}

/**
 * Spin up a fresh test user with a random email + password.
 * @param tag optional label that appears in the email — useful for debugging which test owned a user.
 */
export async function testUserHarness(tag = 'test'): Promise<TestUser> {
  const env = readEnv();

  const adminSupabase = createClient(env.url, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const uniq = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${uniq}@example.test`;
  const password = `pw-${uniq}`;

  const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(
      `testUserHarness: createUser failed — ${createErr?.message ?? 'no user returned'}`,
    );
  }
  const userId = created.user.id;

  // Sign in as that user to get a real JWT scoped to auth.uid().
  const userSupabase = createClient(env.url, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await userSupabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    await adminSupabase.auth.admin.deleteUser(userId);
    throw new Error(`testUserHarness: signIn failed — ${signInErr.message}`);
  }

  const cleanup = async (): Promise<void> => {
    // RLS cascade on auth.users.id delete drops every owned row.
    await adminSupabase.auth.admin.deleteUser(userId);
  };

  return { userId, supabase: userSupabase, adminSupabase, email, cleanup };
}
