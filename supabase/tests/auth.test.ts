/**
 * Auth integration test: full sign-up + sign-in + sign-out + RLS check
 * against local Supabase, exercising the same code paths the web/native
 * apps use.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_TEST_URL!;
const PUB = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_TEST_SECRET_KEY!;

function userClient(): SupabaseClient {
  return createClient(URL_, PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function adminClient(): SupabaseClient {
  return createClient(URL_, SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe('auth: sign-up + sign-in + sign-out flow', () => {
  let email: string;
  let password: string;
  let createdUserId: string | null = null;

  beforeEach(() => {
    const uniq = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    email = `${uniq}@example.test`;
    password = `pw-${uniq}-secret`;
    createdUserId = null;
  });

  afterEach(async () => {
    if (createdUserId) {
      await adminClient().auth.admin.deleteUser(createdUserId);
    }
  });

  it('client signUp produces a usable session when email confirm is off', async () => {
    // Local Supabase defaults to email confirmations OFF; the first signUp
    // returns a session immediately. (Production has email_confirm=true.)
    const sb = userClient();
    const { data, error } = await sb.auth.signUp({ email, password });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    expect(data.session).toBeTruthy();
    createdUserId = data.user?.id ?? null;

    // Smoke: the signed-up user can read their own (empty) contact list.
    const { data: rows, error: selErr } = await sb.from('contacts').select('*');
    expect(selErr).toBeNull();
    expect(rows).toEqual([]);
  });

  it('client signInWithPassword issues a new JWT for an existing user', async () => {
    // Pre-create the user via admin, then prove the *client* can sign in.
    const admin = adminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    createdUserId = created.user?.id ?? null;

    const sb = userClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    expect(data.user?.email).toBe(email);
  });

  it('signOut clears the session and subsequent queries return empty (RLS)', async () => {
    const sb = userClient();
    const { data: signUpData } = await sb.auth.signUp({ email, password });
    createdUserId = signUpData.user?.id ?? null;

    // Make a row so we can see it disappear after signOut.
    const { error: insErr } = await sb.from('contacts').insert({ name: 'tmp' });
    expect(insErr).toBeNull();
    const { data: beforeRows } = await sb.from('contacts').select('id');
    expect(beforeRows?.length).toBe(1);

    await sb.auth.signOut();

    // After signOut the client has no JWT → RLS denies all reads.
    const { data: afterRows } = await sb.from('contacts').select('id');
    expect(afterRows ?? []).toEqual([]);
  });

  it('wrong password is rejected with a clear error', async () => {
    const admin = adminClient();
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    createdUserId = created.user?.id ?? null;

    const sb = userClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: 'wrong-pw' });
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toMatch(/invalid/);
  });
});
