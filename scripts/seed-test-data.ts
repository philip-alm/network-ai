#!/usr/bin/env tsx
/**
 * seed-test-data — populate local Supabase with synthetic contacts +
 * assets for a given user, so you can stress-test virtualization,
 * filtering, sorting, search, etc. against realistic scale.
 *
 * Usage:
 *   pnpm tsx scripts/seed-test-data.ts                       # defaults: 1000 contacts, philip@incredible.one
 *   pnpm tsx scripts/seed-test-data.ts --count 5000          # 5000 contacts
 *   pnpm tsx scripts/seed-test-data.ts --email a@b.com       # different user
 *   pnpm tsx scripts/seed-test-data.ts --wipe                # delete existing seed rows first
 *   pnpm tsx scripts/seed-test-data.ts --count 1000 --wipe   # combined
 *
 * Seed rows are tagged with `__seed__` so --wipe can find them
 * without touching anything you've created yourself.
 *
 * Talks to LOCAL Supabase (127.0.0.1:54321) using the local service
 * (secret) key — bypasses RLS, so the script doesn't need to sign in.
 *
 * Required env (both live in .env at the repo root):
 *   SUPABASE_URL          — defaults to http://127.0.0.1:54321
 *   SUPABASE_SECRET_KEY   — local service-role / secret key. Grab it
 *                           from `supabase status` after `supabase start`.
 *
 * Run with `pnpm exec dotenv -e .env -- pnpm tsx scripts/seed-test-data.ts`
 * (the `seed` package script does this for you).
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SECRET_KEY) {
  console.error(
    '[seed-test-data] Missing SUPABASE_SECRET_KEY. Set it in .env (`supabase status` prints the local one).',
  );
  process.exit(1);
}

const SEED_TAG = '__seed__';
const BATCH_SIZE = 500;

// ─── CLI parsing ───────────────────────────────────────────────────────

type Args = {
  count: number;
  email: string;
  wipe: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    count: 1000,
    email: 'philip@incredible.one',
    wipe: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count' && argv[i + 1]) {
      args.count = parseInt(argv[++i], 10);
    } else if (a === '--email' && argv[i + 1]) {
      args.email = argv[++i];
    } else if (a === '--wipe') {
      args.wipe = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: pnpm tsx scripts/seed-test-data.ts [--count N] [--email X] [--wipe]`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.count) || args.count < 0) {
    throw new Error(`Invalid --count: ${args.count}`);
  }
  return args;
}

// ─── Synthetic data sources ────────────────────────────────────────────

const FIRST_NAMES = [
  'Anna',
  'Erik',
  'Maja',
  'Oscar',
  'Linnea',
  'Hugo',
  'Alice',
  'Liam',
  'Astrid',
  'Theo',
  'Saga',
  'Noah',
  'Ella',
  'Vincent',
  'Wilma',
  'Arvid',
  'Olivia',
  'Isak',
  'Selma',
  'Charlie',
  'Freja',
  'Adam',
  'Klara',
  'Lucas',
  'Sofia',
  'Walter',
  'Iris',
  'Albin',
  'Nora',
  'Elias',
  'Stella',
  'Leo',
  'Agnes',
  'Ludvig',
  'Lova',
  'Edvin',
  'Vera',
  'Henry',
  'Tilde',
  'Alvar',
  'Sigrid',
  'August',
  'Hedda',
  'Theodor',
  'Ines',
  'Felix',
  'Cornelia',
  'Otto',
  'Ronja',
  'Loke',
  'Naomi',
  'Kai',
  'Yusuf',
  'Mei',
  'Aiden',
  'Priya',
  'Mateo',
  'Aria',
  'Ethan',
  'Zara',
  'Ravi',
  'Lina',
  'Jin',
  'Sara',
  'Daniel',
  'Maya',
  'Rohan',
  'Amira',
  'Felix',
  'Nina',
  'Henrik',
  'Camilla',
  'Jonas',
  'Helena',
  'Magnus',
  'Petra',
  'Anders',
  'Birgitta',
  'Sven',
  'Marie',
];

const LAST_NAMES = [
  'Andersson',
  'Johansson',
  'Karlsson',
  'Nilsson',
  'Eriksson',
  'Larsson',
  'Olsson',
  'Persson',
  'Svensson',
  'Gustafsson',
  'Pettersson',
  'Jonsson',
  'Jansson',
  'Hansson',
  'Bengtsson',
  'Lindberg',
  'Magnusson',
  'Lindström',
  'Lundberg',
  'Lindgren',
  'Berg',
  'Holmström',
  'Sandberg',
  'Holm',
  'Nyström',
  'Engström',
  'Lindholm',
  'Strömberg',
  'Forsberg',
  'Holmberg',
  'Bergström',
  'Lindkvist',
  'Sjöberg',
  'Wikström',
  'Hellström',
  'Isaksson',
  'Bergman',
  'Nordström',
  'Lundgren',
  'Berglund',
  'Patel',
  'Khan',
  'Chen',
  'Tanaka',
  'Kim',
  'Singh',
  'Müller',
  'Schmidt',
  'Rossi',
  'Garcia',
  'Nguyen',
  'Yamamoto',
  'Brown',
  'Wilson',
  'Davis',
  'Cohen',
  'Levine',
  'Hoffman',
  'Becker',
];

const CITIES = [
  'Stockholm',
  'Göteborg',
  'Malmö',
  'Uppsala',
  'Lund',
  'Umeå',
  'Linköping',
  'Copenhagen',
  'Oslo',
  'Helsinki',
  'Reykjavik',
  'Tallinn',
  'London',
  'Berlin',
  'Paris',
  'Amsterdam',
  'Barcelona',
  'Lisbon',
  'Dublin',
  'Zurich',
  'New York',
  'San Francisco',
  'Los Angeles',
  'Austin',
  'Boston',
  'Seattle',
  'Tokyo',
  'Singapore',
  'Sydney',
  'Bangalore',
  'Tel Aviv',
];

const TAG_POOL = [
  'engineer',
  'founder',
  'designer',
  'investor',
  'angel',
  'vc',
  'operator',
  'cto',
  'ceo',
  'cpo',
  'pm',
  'researcher',
  'phd',
  'ml',
  'ai',
  'hardware',
  'firmware',
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devtools',
  'fintech',
  'climate',
  'health',
  'edtech',
  'gaming',
  'media',
  'podcast',
  'newsletter',
  'community',
  'event',
  'launch',
  'partner',
  'studio',
  'venue',
  'equipment',
  'consultant',
  'lawyer',
  'recruiter',
];

const NOTE_TEMPLATES = [
  'Met at {event}. Working on {topic}. Follow up about {nextStep}.',
  'Intro from {referrer}. Strong on {topic}. Looking for {seeking}.',
  'Former colleague from {company}. Now {currentRole} at {newCompany}.',
  'Speaks at {event}. Deep expertise in {topic}. Could intro to {who}.',
  'On sabbatical. Last role: {currentRole} at {newCompany}. Open to chat.',
  '{topic} expert. Hosts {event}. Always responds within 24h.',
  'Coffee in {city} last month. Said they could help with {topic}.',
  'Investor in {newCompany}. Knows the {topic} space cold.',
  '',
  '',
];

const EVENTS = [
  'WebSummit',
  'Slush',
  'Sthlm Tech',
  'NDC',
  'Strange Loop',
  'AI Engineer',
  'YC Demo Day',
  'On Deck',
  'Tech.eu',
  'Nordic AI',
];
const TOPICS = [
  'agentic systems',
  'embeddings',
  'distributed training',
  'vector search',
  'product-led growth',
  'design systems',
  'developer tools',
  'hardware/firmware',
  'climate tech',
  'edge AI',
  'realtime infra',
  'graph databases',
];
const COMPANIES = [
  'Klarna',
  'Spotify',
  'Stripe',
  'Linear',
  'Vercel',
  'Notion',
  'Figma',
  'Anthropic',
  'Mistral',
  'Hugging Face',
  'Replicate',
  'Modal',
  'Bolt',
  'Cursor',
];
const ROLES = [
  'Staff Eng',
  'Principal Eng',
  'Eng Manager',
  'Director of Eng',
  'Head of Product',
  'VP Eng',
  'CTO',
  'Founder',
  'Solo founder',
  'Research Lead',
  'Design Lead',
];

const ASSET_NAMES = [
  'Studio space in SoFo',
  'Podcast equipment',
  'Camera kit (A7IV + lenses)',
  'Office desk + monitor',
  'Conference room (booking)',
  'Recording booth',
  'Climbing gym day pass',
  'Co-working credits',
  'Stripe partner credits',
  'AWS credits ($25k)',
  'OpenAI credits',
  'Anthropic API credits',
  'Notion workspace template',
  'Figma component library',
  'Industrial sewing machine',
  'Letterpress',
  '3D printer (Bambu X1)',
  'Sailboat in Stockholm archipelago',
  'Beach house in Skåne',
  'Apartment in Berlin (Aug)',
  'Spare guest room in Göteborg',
];

const ASSET_AVAILABILITY = [
  'Anytime',
  'Weekends only',
  'Aug 1-15',
  'Sep-Dec',
  'Q4 2026',
  'On request',
  'Limited (ask first)',
  null,
  null,
  null,
];

// ─── Random helpers ────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  const out = new Set<T>();
  while (out.size < n) out.add(pick(arr));
  return [...out];
}

/** Pick warmth on a realistic curve: mid-warmth most common, extremes rare. */
function pickWarmth(): number | null {
  const r = Math.random();
  if (r < 0.05) return null; // 5% unknown
  if (r < 0.25) return 1; // 20%
  if (r < 0.55) return 2; // 30%
  if (r < 0.8) return 3; // 25%
  if (r < 0.95) return 4; // 15%
  return 5; // 5%
}

function maybe(p: number): boolean {
  return Math.random() < p;
}

function buildName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function buildTags(): string[] {
  // Always include the seed marker so --wipe can find these later.
  // Add 0-3 real tags from the pool.
  const realCount = Math.floor(Math.random() * 4);
  return [SEED_TAG, ...pickN(TAG_POOL, realCount)];
}

function buildNotes(): string {
  const template = pick(NOTE_TEMPLATES);
  if (!template) return '';
  return template
    .replace('{event}', pick(EVENTS))
    .replace('{topic}', pick(TOPICS))
    .replace('{nextStep}', pick(TOPICS))
    .replace('{referrer}', buildName())
    .replace('{seeking}', pick(TOPICS))
    .replace('{company}', pick(COMPANIES))
    .replace('{currentRole}', pick(ROLES))
    .replace('{newCompany}', pick(COMPANIES))
    .replace('{who}', buildName())
    .replace('{city}', pick(CITIES));
}

/** Spread created_at across the last 18 months so date sorts have variety. */
function pickCreatedAt(): string {
  const now = Date.now();
  const maxAgeMs = 18 * 30 * 24 * 60 * 60 * 1000;
  const ageMs = Math.floor(Math.random() * maxAgeMs);
  return new Date(now - ageMs).toISOString();
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`\n=== seed-test-data ===`);
  console.log(`URL:    ${SUPABASE_URL}`);
  console.log(`Email:  ${args.email}`);
  console.log(`Count:  ${args.count} contacts (assets ~${Math.floor(args.count * 0.4)})`);
  console.log(`Wipe:   ${args.wipe}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Look up the user by email via the admin API. If missing (e.g.
  //    after a `supabase db reset --local`), create them so the script
  //    can keep running autonomously without a manual sign-up step.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error(`auth.admin.listUsers failed: ${listErr.message}`);
  let user = list.users.find((u) => u.email === args.email);
  if (!user) {
    console.log(`No user ${args.email} — creating one (auto-confirmed)...`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: args.email,
      password: 'localdev-password',
      email_confirm: true,
    });
    if (createErr || !created.user) {
      throw new Error(`createUser failed: ${createErr?.message ?? 'no user returned'}`);
    }
    user = created.user;
    console.log(`✓ Created user ${user.id} (password: localdev-password)`);
  } else {
    console.log(`✓ Found user ${user.id}`);
  }

  // 2. Wipe previous seed rows if requested. Soft-delete via deleted_at
  //    so any FK constraints don't fight us. Filter by SEED_TAG so
  //    we never touch the user's real data.
  if (args.wipe) {
    console.log('\nWiping previous seed rows...');
    const nowIso = new Date().toISOString();
    const { error: wipeAssetsErr, count: wipedAssets } = await supabase
      .from('assets')
      .update({ deleted_at: nowIso }, { count: 'exact' })
      .eq('user_id', user.id)
      .contains('tags', [SEED_TAG]);
    if (wipeAssetsErr) throw new Error(`Wipe assets failed: ${wipeAssetsErr.message}`);
    const { error: wipeContactsErr, count: wipedContacts } = await supabase
      .from('contacts')
      .update({ deleted_at: nowIso }, { count: 'exact' })
      .eq('user_id', user.id)
      .contains('tags', [SEED_TAG]);
    if (wipeContactsErr) throw new Error(`Wipe contacts failed: ${wipeContactsErr.message}`);
    console.log(`✓ Soft-deleted ${wipedContacts ?? 0} contacts, ${wipedAssets ?? 0} assets`);
  }

  // 3. Build contact rows.
  console.log(`\nGenerating ${args.count} contacts...`);
  const contactRows = Array.from({ length: args.count }, () => {
    const created = pickCreatedAt();
    // updated_at within +/- a few weeks of created_at, so sorts diverge.
    const updatedOffset = (Math.random() - 0.3) * 60 * 24 * 60 * 60 * 1000;
    const updated = new Date(
      Math.min(Date.now(), new Date(created).getTime() + Math.max(0, updatedOffset)),
    ).toISOString();
    return {
      user_id: user.id,
      name: buildName(),
      warmth: pickWarmth(),
      city: maybe(0.85) ? pick(CITIES) : null,
      tags: buildTags(),
      notes: buildNotes(),
      created_at: created,
      updated_at: updated,
    };
  });

  // 4. Insert in batches. Return ids so we can wire assets to them.
  const insertedContacts: { id: string }[] = [];
  for (let i = 0; i < contactRows.length; i += BATCH_SIZE) {
    const batch = contactRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('contacts').insert(batch).select('id');
    if (error) {
      throw new Error(`Insert contacts batch ${i / BATCH_SIZE + 1} failed: ${error.message}`);
    }
    if (data) insertedContacts.push(...data);
    process.stdout.write(
      `\r  contacts: ${Math.min(i + BATCH_SIZE, contactRows.length)}/${contactRows.length}`,
    );
  }
  process.stdout.write('\n');
  console.log(`✓ Inserted ${insertedContacts.length} contacts`);

  // 5. Build asset rows. ~30% of contacts get 1 asset; ~10% get 2-3.
  //    Plus a handful of unowned assets (owned by the user directly).
  console.log(`\nGenerating assets...`);
  const assetRows: Array<{
    user_id: string;
    contact_id: string | null;
    name: string;
    description: string;
    tags: string[];
    availability: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  for (const c of insertedContacts) {
    const r = Math.random();
    let n = 0;
    if (r < 0.3) n = 1;
    else if (r < 0.4) n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const created = pickCreatedAt();
      assetRows.push({
        user_id: user.id,
        contact_id: c.id,
        name: pick(ASSET_NAMES),
        description: maybe(0.5) ? `Useful for ${pick(TOPICS)}.` : '',
        tags: buildTags(),
        availability: pick(ASSET_AVAILABILITY),
        created_at: created,
        updated_at: created,
      });
    }
  }
  // Add ~20 unowned assets (owned-by-you).
  for (let i = 0; i < 20; i++) {
    const created = pickCreatedAt();
    assetRows.push({
      user_id: user.id,
      contact_id: null,
      name: pick(ASSET_NAMES),
      description: maybe(0.7) ? `Direct ask: ${pick(TOPICS)}.` : '',
      tags: buildTags(),
      availability: pick(ASSET_AVAILABILITY),
      created_at: created,
      updated_at: created,
    });
  }

  for (let i = 0; i < assetRows.length; i += BATCH_SIZE) {
    const batch = assetRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('assets').insert(batch);
    if (error) {
      throw new Error(`Insert assets batch ${i / BATCH_SIZE + 1} failed: ${error.message}`);
    }
    process.stdout.write(
      `\r  assets:   ${Math.min(i + BATCH_SIZE, assetRows.length)}/${assetRows.length}`,
    );
  }
  process.stdout.write('\n');
  console.log(`✓ Inserted ${assetRows.length} assets`);

  console.log('\n=== Done ===');
  console.log(`Total seeded: ${insertedContacts.length} contacts, ${assetRows.length} assets`);
  console.log(`Refresh the app to see them.\n`);
}

main().catch((err) => {
  console.error('\n[seed] FAILED:', err.message);
  process.exit(1);
});
