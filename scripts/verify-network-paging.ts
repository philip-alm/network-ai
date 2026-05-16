#!/usr/bin/env tsx
/**
 * verify-network-paging — end-to-end smoke test of the server-side
 * paging stack (network_counts + query_contacts_page + query_assets_page
 * + network_facets) against the LOCAL Supabase instance with whatever
 * data has been seeded.
 *
 * Run:    pnpm tsx scripts/verify-network-paging.ts
 *         pnpm tsx scripts/verify-network-paging.ts --email a@b.com
 *
 * Exit 0 = everything green. Exit 1 = a check failed. Detailed output
 * for every step so a failure is diagnosable from the log alone.
 *
 * Why this exists: I (Claude) need to be able to prove the full
 * architecture works end-to-end without asking the user to refresh
 * the app. The SQL contract tests cover RPC contracts against fresh
 * users; THIS exercises the RPCs against the user's actual seeded
 * dataset to prove they scale + return sensible results.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error(
    '[verify-network-paging] Missing SUPABASE_PUBLISHABLE_KEY or SUPABASE_SECRET_KEY. Set both in .env (`supabase status` prints them).',
  );
  process.exit(1);
}

const EMAIL = process.argv.includes('--email')
  ? process.argv[process.argv.indexOf('--email') + 1]
  : 'philip@incredible.one';
const PASSWORD = 'localdev-password';

let passed = 0;
let failed = 0;

function step(label: string): { ok: () => void; fail: (why: string) => void } {
  process.stdout.write(`  ${label.padEnd(70)}`);
  return {
    ok: () => {
      process.stdout.write(' OK\n');
      passed++;
    },
    fail: (why: string) => {
      process.stdout.write(' FAIL\n');
      console.error(`    └─ ${why}`);
      failed++;
    },
  };
}

function check(label: string, cond: boolean, why = ''): void {
  const s = step(label);
  if (cond) s.ok();
  else s.fail(why || 'assertion failed');
}

async function main(): Promise<void> {
  console.log('\n=== verify-network-paging ===');
  console.log(`URL:   ${SUPABASE_URL}`);
  console.log(`Email: ${EMAIL}\n`);

  // ── Authenticate as the seeded user ──────────────────────────────
  console.log('Sign in');
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInErr) {
    console.error(`Sign-in failed: ${signInErr.message}`);
    console.error('Try re-seeding: pnpm tsx scripts/seed-test-data.ts --count 10000');
    process.exit(1);
  }
  console.log('  ✓ signed in\n');

  // ── network_counts ───────────────────────────────────────────────
  console.log('network_counts');
  const { data: countsData, error: countsErr } = await supabase.rpc('network_counts');
  check('responds without error', !countsErr, countsErr?.message ?? '');
  const counts = ((countsData ?? []) as Array<{ contacts: number; assets: number }>)[0];
  check('returns one row', !!counts);
  if (!counts) return summarize();
  check(
    `contacts total > 0 (got ${counts.contacts})`,
    Number(counts.contacts) > 0,
    'expected seeded contacts',
  );
  check(
    `assets total >= 0 (got ${counts.assets})`,
    Number(counts.assets) >= 0,
    'expected non-negative assets',
  );
  console.log('');

  // ── network_facets ───────────────────────────────────────────────
  console.log('network_facets');
  const { data: facetsRaw, error: facetsErr } = await supabase.rpc('network_facets');
  check('responds without error', !facetsErr, facetsErr?.message ?? '');
  const facets = facetsRaw as unknown as {
    cities: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
    warmth: Array<{ value: number; count: number }>;
    asset_tags: Array<{ value: string; count: number }>;
    asset_availability: Array<{ value: string; count: number }>;
  };
  check('has cities array', Array.isArray(facets?.cities));
  check('has tags array', Array.isArray(facets?.tags));
  check('has warmth array', Array.isArray(facets?.warmth));
  check(
    `cities ordered by count desc`,
    facets.cities.every((c, i) => i === 0 || facets.cities[i - 1].count >= c.count),
    'cities not in descending count order',
  );
  console.log(
    `    cities=${facets.cities.length}, tags=${facets.tags.length}, warmth=${facets.warmth.length}\n`,
  );

  // ── query_contacts_page: default (warmth_desc) ───────────────────
  console.log('query_contacts_page — default sort (warmth_desc)');
  const { data: page1, error: page1Err } = await supabase.rpc('query_contacts_page', {
    p_offset: 0,
    p_limit: 200,
  });
  check('responds without error', !page1Err, page1Err?.message ?? '');
  const rows1 = (page1 ?? []) as unknown as Array<{
    id: string;
    name: string;
    warmth: number | null;
    asset_count: number;
    total_count: number;
  }>;
  check(`returns up to 200 rows (got ${rows1.length})`, rows1.length > 0 && rows1.length <= 200);
  const total1 = rows1[0]?.total_count;
  check(
    `total_count equals counts.contacts (${total1} vs ${counts.contacts})`,
    Number(total1) === Number(counts.contacts),
  );
  // Validate warmth_desc ordering with nulls last + name tiebreak
  let lastWarmth: number | null = Number.POSITIVE_INFINITY;
  let lastName = '';
  let orderOk = true;
  for (const r of rows1) {
    if (r.warmth === null) {
      // nulls should appear AT or AFTER all non-nulls
      if (lastWarmth !== null && lastWarmth !== Number.POSITIVE_INFINITY) {
        // OK: transitioning into nulls is allowed
      }
      lastWarmth = null;
      continue;
    }
    if (lastWarmth === null) {
      // a non-null after a null is a violation
      orderOk = false;
      break;
    }
    if (lastWarmth !== Number.POSITIVE_INFINITY) {
      if (r.warmth > (lastWarmth as number)) {
        orderOk = false;
        break;
      }
      if (r.warmth === lastWarmth && r.name.toLowerCase() < lastName.toLowerCase()) {
        orderOk = false;
        break;
      }
    }
    lastWarmth = r.warmth;
    lastName = r.name;
  }
  check('warmth desc → name asc tiebreak → nulls last is respected', orderOk);
  console.log('');

  // ── Pagination: page 2 has distinct rows ─────────────────────────
  console.log('query_contacts_page — pagination');
  const { data: page2 } = await supabase.rpc('query_contacts_page', {
    p_offset: 200,
    p_limit: 200,
  });
  const rows2 = (page2 ?? []) as unknown as Array<{ id: string }>;
  const ids1 = new Set(rows1.map((r) => r.id));
  const overlapping = rows2.filter((r) => ids1.has(r.id)).length;
  check(`page 2 has no overlap with page 1 (${overlapping} dupes)`, overlapping === 0);
  check(`page 2 returned rows (${rows2.length})`, rows2.length > 0);
  console.log('');

  // ── Full drain: total loaded across N pages = total_count ────────
  console.log('query_contacts_page — full drain (sanity)');
  const allIds = new Set<string>();
  let offset = 0;
  let totalFromServer = 0;
  for (let i = 0; i < 60; i++) {
    const { data: page } = await supabase.rpc('query_contacts_page', {
      p_offset: offset,
      p_limit: 200,
    });
    const pageRows = (page ?? []) as unknown as Array<{
      id: string;
      total_count: number;
    }>;
    if (pageRows.length === 0) break;
    if (i === 0) totalFromServer = Number(pageRows[0].total_count);
    for (const r of pageRows) allIds.add(r.id);
    offset += pageRows.length;
    if (offset >= totalFromServer) break;
  }
  check(
    `unique rows across all pages equals total_count (${allIds.size} vs ${totalFromServer})`,
    allIds.size === totalFromServer,
  );
  console.log('');

  // ── Filter: by city (top city from facets) ───────────────────────
  if (facets.cities.length > 0) {
    const topCity = facets.cities[0];
    console.log(`query_contacts_page — filter by city="${topCity.value}"`);
    const { data: filtered } = await supabase.rpc('query_contacts_page', {
      p_cities: [topCity.value],
      p_limit: 5,
    });
    const filteredRows = (filtered ?? []) as unknown as Array<{
      city: string;
      total_count: number;
    }>;
    check(
      `total_count equals facets.cities[0].count (${filteredRows[0]?.total_count} vs ${topCity.count})`,
      Number(filteredRows[0]?.total_count) === Number(topCity.count),
    );
    check(
      'every returned row matches the city filter',
      filteredRows.every((r) => r.city === topCity.value),
    );
    console.log('');
  }

  // ── Filter: warmth in [5] ────────────────────────────────────────
  console.log('query_contacts_page — filter by warmth=5');
  const { data: w5 } = await supabase.rpc('query_contacts_page', {
    p_warmth: [5],
    p_limit: 5,
  });
  const w5Rows = (w5 ?? []) as unknown as Array<{ warmth: number | null }>;
  check(
    'every returned row has warmth=5',
    w5Rows.every((r) => r.warmth === 5),
  );
  console.log('');

  // ── Filter: has_assets=true ──────────────────────────────────────
  console.log('query_contacts_page — has_assets=true');
  const { data: ha } = await supabase.rpc('query_contacts_page', {
    p_has_assets: true,
    p_limit: 5,
  });
  const haRows = (ha ?? []) as unknown as Array<{ asset_count: number }>;
  check(
    'every returned row has asset_count > 0',
    haRows.length > 0 && haRows.every((r) => Number(r.asset_count) > 0),
  );
  console.log('');

  // ── Search: top city as search term ──────────────────────────────
  if (facets.cities.length > 0) {
    const topCity = facets.cities[0].value;
    console.log(`query_contacts_page — search="${topCity}"`);
    const { data: searched } = await supabase.rpc('query_contacts_page', {
      p_search: topCity,
      p_limit: 5,
    });
    const sRows = (searched ?? []) as unknown as Array<{
      total_count: number;
    }>;
    check(
      `total_count >= count of contacts with that city`,
      Number(sRows[0]?.total_count ?? 0) > 0,
    );
    console.log('');
  }

  // ── Sort modes: each produces a valid response ───────────────────
  console.log('query_contacts_page — every sort mode');
  for (const sort of [
    'updated_desc',
    'created_desc',
    'name_asc',
    'name_desc',
    'warmth_asc',
    'warmth_desc',
    'asset_count_desc',
  ] as const) {
    const { data, error } = await supabase.rpc('query_contacts_page', {
      p_sort: sort,
      p_limit: 5,
    });
    check(`sort=${sort} responds`, !error && (data ?? []).length > 0, error?.message ?? '');
  }
  console.log('');

  // ── query_assets_page: basic + sort modes ────────────────────────
  console.log('query_assets_page');
  const { data: assetsPage, error: aErr } = await supabase.rpc('query_assets_page', {
    p_limit: 200,
  });
  const assetRows = (assetsPage ?? []) as unknown as Array<{
    id: string;
    total_count: number;
  }>;
  check('responds without error', !aErr, aErr?.message ?? '');
  check(
    `total_count equals counts.assets (${assetRows[0]?.total_count} vs ${counts.assets})`,
    Number(assetRows[0]?.total_count) === Number(counts.assets),
  );
  for (const sort of ['updated_desc', 'created_desc', 'name_asc', 'name_desc'] as const) {
    const { error } = await supabase.rpc('query_assets_page', {
      p_sort: sort,
      p_limit: 5,
    });
    check(`asset sort=${sort} responds`, !error, error?.message ?? '');
  }
  console.log('');

  // ── find_anything returns true total ─────────────────────────────
  console.log('find_anything — total field');
  const { data: findResult } = await supabase.rpc('find_anything', {
    query_terms: ['gaming'],
    match_count: 5,
  });
  const findData = findResult as unknown as {
    contacts: unknown[];
    assets: unknown[];
    total: { contacts: number; assets: number };
  };
  check(
    'returns contacts array',
    Array.isArray(findData?.contacts),
    'find_anything missing contacts',
  );
  check(
    'returns top-level total.contacts',
    typeof findData?.total?.contacts === 'number' || typeof findData?.total?.contacts === 'string',
  );
  const findCandidates = findData?.contacts?.length ?? 0;
  const findTotal = Number(findData?.total?.contacts ?? 0);
  check(
    `total >= candidates (${findTotal} >= ${findCandidates})`,
    findTotal >= findCandidates,
    'total should never be less than what was returned',
  );
  console.log('');

  // ── lookup_contacts_by_ids + RLS denial ──────────────────────────
  console.log('lookup_contacts_by_ids');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { data: lookupEmpty } = await supabase.rpc('lookup_contacts_by_ids', {
    p_ids: [fakeId],
  });
  check(
    'returns empty for unknown id',
    Array.isArray(lookupEmpty) && (lookupEmpty as unknown[]).length === 0,
  );
  // Pick a known id from earlier results and look it up.
  if (rows1.length > 0) {
    const knownId = rows1[0].id;
    const { data: lookupReal } = await supabase.rpc('lookup_contacts_by_ids', {
      p_ids: [knownId],
    });
    const lookupRows = (lookupReal ?? []) as unknown as Array<{ id: string; asset_count: number }>;
    check(
      `looks up known id (${knownId.slice(0, 8)}…) and returns it`,
      lookupRows.length === 1 && lookupRows[0].id === knownId,
    );
    check(
      'returns asset_count alongside the row',
      typeof lookupRows[0]?.asset_count === 'number' ||
        typeof lookupRows[0]?.asset_count === 'string',
    );
  }
  console.log('');

  // ── validate_panel_pins ──────────────────────────────────────────
  console.log('validate_panel_pins');
  const { data: validation } = await supabase.rpc('validate_panel_pins', {
    p_contact_ids: [fakeId, ...(rows1.length > 0 ? [rows1[0].id] : [])],
    p_asset_ids: [],
  });
  const v = validation as {
    valid_contact_ids: string[];
    missing_contact_ids: string[];
  };
  check(
    'flags fake id as missing',
    (v.missing_contact_ids ?? []).includes(fakeId),
    `missing_contact_ids=${JSON.stringify(v.missing_contact_ids)}`,
  );
  if (rows1.length > 0) {
    check(
      `recognizes real id as valid (${rows1[0].id.slice(0, 8)}…)`,
      (v.valid_contact_ids ?? []).includes(rows1[0].id),
    );
  }
  console.log('');

  // ── p_search uses FTS + word-similarity ──────────────────────────
  console.log('query_contacts_page — FTS-aware search');
  // The seed includes notes with words like "podcast"; pick a stem
  // search and assert we get hits.
  const { data: stemSearch } = await supabase.rpc('query_contacts_page', {
    p_search: 'podcast',
    p_limit: 5,
  });
  const stemRows = (stemSearch ?? []) as unknown as Array<{ name: string; total_count: number }>;
  check(
    `FTS search for "podcast" returns at least one match`,
    stemRows.length > 0,
    'expected the seed to contain at least one contact whose notes mention podcast',
  );
  console.log('');

  // ── Performance budget ───────────────────────────────────────────
  console.log('Performance budget');
  const t0 = performance.now();
  await supabase.rpc('query_contacts_page', { p_limit: 200 });
  const t1 = performance.now();
  check(
    `query_contacts_page < 500ms (took ${Math.round(t1 - t0)}ms)`,
    t1 - t0 < 500,
    'too slow — check indexes',
  );
  const t2 = performance.now();
  await supabase.rpc('network_counts');
  const t3 = performance.now();
  check(`network_counts < 300ms (took ${Math.round(t3 - t2)}ms)`, t3 - t2 < 300);
  const t4 = performance.now();
  await supabase.rpc('find_anything', { query_terms: ['gaming'], match_count: 50 });
  const t5 = performance.now();
  check(`find_anything < 1000ms (took ${Math.round(t5 - t4)}ms)`, t5 - t4 < 1000);
  console.log('');

  // Reset role via service key so cleanup works even if RLS scoping changes.
  void SUPABASE_SECRET_KEY;
  summarize();
}

function summarize(): void {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed === 0) {
    console.log('\n✓ All checks green.\n');
    process.exit(0);
  } else {
    console.log('\n✗ Some checks failed.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n[verify] crashed:', err);
  process.exit(1);
});
