/**
 * env — zod-validated environment access.
 *
 * Web reads from `process.env.NEXT_PUBLIC_*`.
 * Native reads from `process.env.EXPO_PUBLIC_*` (Expo Router injects these
 * from app config at build time).
 *
 * Server-side scripts (Edge Functions, verify scripts) ALSO populate
 * `OPENROUTER_API_KEY` and `SUPABASE_SECRET_KEY`. Client bundles never see
 * these because they don't carry the `NEXT_PUBLIC_` / `EXPO_PUBLIC_` prefix.
 */

import { z } from 'zod';

const publicSchema = z.object({
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(1),
});

const serverSchema = z.object({
  openrouterApiKey: z.string().nullable(),
  supabaseSecretKey: z.string().nullable(),
});

function pickFirst(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) if (v && v.length > 0) return v;
  return undefined;
}

function readRaw(): { public: unknown; server: unknown } {
  // Both prefixes are checked so this module works whether bundled by
  // Next.js (`NEXT_PUBLIC_*`) or Expo (`EXPO_PUBLIC_*`).
  const url = pickFirst(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  );
  const publishableKey = pickFirst(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  );

  return {
    public: { supabaseUrl: url, supabasePublishableKey: publishableKey },
    server: {
      openrouterApiKey: process.env.OPENROUTER_API_KEY ?? null,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? null,
    },
  };
}

type ResolvedEnv = z.infer<typeof publicSchema> & z.infer<typeof serverSchema>;

let cache: ResolvedEnv | null = null;

function resolve(): ResolvedEnv {
  if (cache) return cache;
  const raw = readRaw();
  const parsedPublic = publicSchema.safeParse(raw.public);
  if (!parsedPublic.success) {
    const issues = parsedPublic.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(
      `[env] Required public env vars missing or invalid. ${issues}. ` +
        'Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (web) or ' +
        'EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY (native).',
    );
  }
  cache = { ...parsedPublic.data, ...serverSchema.parse(raw.server) };
  return cache;
}

/**
 * Lazy proxy: env vars are validated on first access, not at module load.
 * This lets Next.js bundle the module during build (where env may be empty)
 * without throwing; the check fires at runtime when a value is actually read.
 */
export const env: Readonly<ResolvedEnv> = new Proxy({} as ResolvedEnv, {
  get(_, key) {
    return resolve()[key as keyof ResolvedEnv];
  },
  has(_, key) {
    return key in resolve();
  },
});

export type Env = ResolvedEnv;

/** TEST-ONLY: clears the parse cache so tests can re-stub env vars. */
export function __resetEnvCacheForTests(): void {
  cache = null;
}
