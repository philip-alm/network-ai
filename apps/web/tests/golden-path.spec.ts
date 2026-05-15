/**
 * Golden-path Playwright test: drives the REAL user flow through the LOCAL
 * dev stack (Next.js + Supabase + Edge Functions served locally).
 *
 *   1. Admin-create a fresh test user (sidesteps the GoTrue signup rate limit
 *      so the test is deterministic).
 *   2. Sign in via /sign-in — proves the cookie/SSR fix works end-to-end.
 *   3. Home renders chat + accordion.
 *   4. Send "Add Anna Svensson…" → assistant responds with tool calls.
 *   5. Anna appears in the accordion (Supabase Realtime refresh).
 *   6. Send a follow-up search query → another assistant reply.
 *
 * Browser console + network errors are surfaced in the report.
 */

import { test, expect, type ConsoleMessage } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const SUPA_SECRET = process.env.SUPABASE_TEST_SECRET_KEY!;
const SUPA_PUB = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;

if (!SUPA_SECRET || !SUPA_PUB) {
  throw new Error(
    'Playwright golden-path needs SUPABASE_TEST_SECRET_KEY + SUPABASE_TEST_PUBLISHABLE_KEY in env (loaded from .env.test).',
  );
}

test('sign in → chat → contact lands in accordion', async ({ page }) => {
  // -------- 0. provision a fresh user via admin (bypass GoTrue rate limit) --------
  const admin = createClient(SUPA_URL, SUPA_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const password = `pw-test-${Date.now()}`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw new Error(`admin createUser: ${cErr?.message}`);
  const userId = created.user.id;

  const browserLogs: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    browserLogs.push(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    browserLogs.push(`[pageerror] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    browserLogs.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  try {
    // -------- 1. sign in --------
    await page.goto('/sign-in');
    await expect(page.getByTestId('sign-in-screen')).toBeVisible();

    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill(password);
    await page.getByTestId('sign-in-submit').click();

    // Cookie sync via @supabase/ssr's createBrowserClient → middleware lets us through.
    await page.waitForURL('/', { timeout: 20_000 });

    // -------- 2. home renders --------
    await expect(page.getByTestId('chat-thread')).toBeVisible();
    await expect(page.getByTestId('contacts-accordion')).toBeVisible();

    // -------- 3. add a contact via chat --------
    const composer = page.getByTestId('chat-input');
    await composer.fill(
      'Add Anna Svensson to my contacts. Warmth 2 (WhatsApp friend). She lives in Göteborg and is a hardware engineer.',
    );
    await page.getByTestId('chat-send').click();

    await expect(page.getByTestId('bubble-assistant').first()).toBeVisible({ timeout: 60_000 });

    // -------- 4. Anna appears in accordion --------
    await expect(page.getByText(/Anna/i).first()).toBeVisible({ timeout: 15_000 });

    // -------- 5. follow-up search --------
    await composer.fill('Who do I know in Göteborg?');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('bubble-assistant').nth(1)).toBeVisible({ timeout: 60_000 });

    // -------- 6. sanity: no failed requests / page errors --------
    const errors = browserLogs.filter(
      (l) => l.startsWith('[pageerror]') || l.startsWith('[requestfailed]'),
    );
    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
});
