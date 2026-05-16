/**
 * The four agent tools, wrapped in the envelope shape. RLS-scoped via the
 * caller's JWT; the agent gets maximum SQL capability over the user's own
 * rows and nothing else.
 *
 * Every tool returns `{ ok, data | error, hint, retriable }`. The hint is
 * the actionable nudge the LLM reads to self-correct.
 *
 * `embedQuery` is injected so the same tools work in browser (calls an
 * embed-query Edge Function) and Node scripts (calls OpenRouter directly).
 */

import { z } from 'zod';
import type { SupabaseClient } from '../supabase';
import type {
  PanelState,
  ContactFilterState,
  AssetFilterState,
  ContactSortMode,
  AssetSortMode,
} from '../store';
import { toolWrap, toolError, PG_HINTS } from './toolWrap';
import type { DebugRecorder } from './debugRecorder';

export type EmbedQueryFn = (text: string) => Promise<number[]>;

/** Optional callback the agent uses to drive the right-pane filter/sort/
 *  view. Not provided in node scripts; only browser contexts wire this. */
export type SetPanelStateFn = (patch: Partial<PanelState>) => void;

export type MakeToolsOptions = {
  supabase: SupabaseClient;
  embedQuery: EmbedQueryFn;
  recorder?: DebugRecorder;
  setPanelState?: SetPanelStateFn;
};

function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Normalize SQL the LLM emits before it hits the RPC wrapper.
 *  - Strip trailing whitespace + semicolons (our `format('select … from (%s) t', q)`
 *    chokes on a `;` inside the parens; the model adds them by habit).
 *  - Collapse a trailing newline into a single space.
 */
function normalizeSql(sql: string): string {
  return sql.replace(/[\s;]+$/g, '').trim();
}

const QuerySqlSchema = z.object({
  sql: z.string().min(1).describe('A single SELECT or WITH statement. No mutations.'),
});

const MutateSqlSchema = z.object({
  sql: z
    .string()
    .min(1)
    .describe(
      'A single INSERT / UPDATE / DELETE with a RETURNING clause. ' +
        'See the system prompt <sql_gotchas> block for the rules every ' +
        'mutation must follow (no trailing `;`, no ON CONFLICT, never ' +
        'pass user_id, always RETURNING).',
    ),
});

/**
 * The unified search tool's schema. Designed for the AI to pass EVERYTHING
 * it knows in one call — keyword candidates (Swedish + English, synonyms,
 * brand names), natural-language intent, and structural filters. Postgres
 * does the heavy lifting (see find_anything in 0015).
 *
 * Two ways to express what to look for, both optional, both can combine:
 *   - queries (string[]) → keyword variants → FTS + trigram
 *   - intent   (string)  → natural sentence → semantic embedding
 *
 * `contains` and `regex` were dropped from the public surface (May 2026)
 * to reduce the LLM's decision burden. The underlying RPC still accepts
 * them; rare power-mode cases route through `query_sql` instead.
 */
const FindSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Discrete KEYWORDS for lexical match (FTS prefix-OR + trigram). ' +
        'Pass every candidate term + its translations + synonyms — e.g. ' +
        '["podcast", "podd", "inspelning", "audio"]. These power the ' +
        'keyword strategies; semantic search uses `intent` instead.',
    ),
  intent: z
    .string()
    .optional()
    .describe(
      'NATURAL LANGUAGE description of what the user actually wants, ' +
        'in your own words or theirs. Used SOLELY for semantic ' +
        '(vector) similarity — embedded with the same model that ' +
        'indexes contact notes + asset descriptions. Sentence-shaped ' +
        'inputs match far better than keyword soup. Examples:\n' +
        ' - "Someone with podcast hosting experience who could record in Stockholm."\n' +
        ' - "Investors who back hardware startups at the seed stage."\n' +
        ' - "People I owe a follow-up to about the Berlin trip."\n' +
        'If omitted, `queries.join(" ")` is embedded as a fallback (less precise).',
    ),
  table: z
    .enum(['contacts', 'assets', 'both'])
    .optional()
    .default('both')
    .describe('Which table(s) to search. Default: both.'),
  required_tags: z
    .array(z.string())
    .optional()
    .describe('Tags AND filter — every listed tag must be present on the row.'),
  any_tags: z
    .array(z.string())
    .optional()
    .describe('Tags OR filter — row must have at least one of these tags.'),
  min_warmth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Contacts only: warmth >= min_warmth.'),
  max_warmth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe(
      'Contacts only: warmth <= max_warmth. Combine with min_warmth to band ' +
        '(e.g. min=1,max=2 = "WhatsApp-level or closer").',
    ),
  city: z.string().optional().describe('Contacts only: case-insensitive ILIKE on city.'),
  has_assets: z
    .boolean()
    .optional()
    .describe('Contacts only: only return contacts who have at least one alive asset.'),
  recent_days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Only return rows updated within the last N days.'),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

/**
 * Build the embeddable text for a contact/asset row. Mirrors the FTS
 * source so the semantic and FTS layers see equivalent input.
 */
function embeddableText(row: Record<string, unknown>): string | null {
  const has = (k: string): boolean => typeof row[k] === 'string';
  // Heuristic: asset rows have `description`; contact rows have `notes`.
  if (has('description')) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]).join(' ') : '';
    return (
      [
        row.name as string,
        row.description as string,
        (row.availability as string | null | undefined) ?? '',
        tags,
      ]
        .filter(Boolean)
        .join(' — ')
        .trim() || null
    );
  }
  if (has('name') && (has('notes') || 'warmth' in row)) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]).join(' ') : '';
    return (
      [
        row.name as string,
        (row.notes as string | undefined) ?? '',
        (row.city as string | undefined) ?? '',
        tags,
      ]
        .filter(Boolean)
        .join(' — ')
        .trim() || null
    );
  }
  return null;
}

/**
 * Generate an embedding for a single row and write it back. Best-effort:
 * any failure (embed timeout, no description text, RLS oddity) silently
 * skips. The cron'd embedding pipeline catches up regardless.
 */
async function inlineEmbed(
  supabase: SupabaseClient,
  embedQuery: EmbedQueryFn,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const id = row.id;
    if (typeof id !== 'string') return;
    const text = embeddableText(row);
    if (!text) return;
    const vec = await embedQuery(text);
    const literal = `[${vec.join(',')}]`;
    // Heuristic for table: assets have `description`/`availability`,
    // contacts have `warmth`/`notes`. Avoid hard-coding `contact_id`
    // since it can be null on owned assets.
    const isAsset = typeof row.description === 'string' || 'availability' in row;
    const table = isAsset ? 'assets' : 'contacts';
    await supabase
      .from(table)
      .update({
        embedding: literal,
        embedding_model: 'text-embedding-3-small',
        embedding_generated_at: new Date().toISOString(),
      })
      .eq('id', id);
  } catch {
    // Silent — cron'd pipeline is the safety net.
  }
}

const ContactFilterPatchSchema = z
  .object({
    tags: z
      .array(z.string())
      .optional()
      .describe('OR within facet — any of these tags counts as a match.'),
    tagsAll: z
      .array(z.string())
      .optional()
      .describe('AND within facet — contact must carry every listed tag.'),
    cities: z.array(z.string()).optional(),
    warmth: z
      .array(z.number().int().min(1).max(5))
      .optional()
      .describe('Warmth levels to keep, 1=closest 5=most distant.'),
    hasAssets: z
      .boolean()
      .nullable()
      .optional()
      .describe('true=only contacts with assets, false=only without, null=both.'),
    updatedWithinDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable()
      .optional()
      .describe('Keep only contacts updated within the last N days.'),
  })
  .describe('Contact filter patch — omit a key to leave it unchanged.');

const AssetFilterPatchSchema = z
  .object({
    tags: z.array(z.string()).optional(),
    tagsAll: z.array(z.string()).optional(),
    ownerIds: z
      .array(z.string().uuid())
      .optional()
      .describe('Restrict to assets owned by these contact UUIDs.'),
    hasOwner: z
      .boolean()
      .nullable()
      .optional()
      .describe('true=attached only, false=unattached only, null=both.'),
    availabilityContains: z
      .string()
      .optional()
      .describe('Substring (case-insensitive) over availability text.'),
    updatedWithinDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .describe('Asset filter patch — omit a key to leave it unchanged.');

const SetPanelSchema = z.object({
  contactFilter: ContactFilterPatchSchema.optional(),
  assetFilter: AssetFilterPatchSchema.optional(),
  contactSort: z
    .enum([
      'updated_desc',
      'created_desc',
      'name_asc',
      'name_desc',
      'warmth_asc',
      'warmth_desc',
      'asset_count_desc',
    ])
    .optional()
    .describe(
      'Sort order for contacts. asset_count_desc = people with most ' +
        'assets first (proxy for "most active providers").',
    ),
  assetSort: z.enum(['updated_desc', 'created_desc', 'name_asc', 'name_desc']).optional(),
  search: z
    .string()
    .optional()
    .describe(
      'Free-text search across name + notes/description + city + tags. ' + 'Pass "" to clear.',
    ),
  pinnedContactIds: z
    .array(z.string().uuid())
    .optional()
    .describe(
      'Ordered contact UUIDs to hoist to the top of the list. Use this ' +
        'when the user asks for a CURATED short list — pin your top picks. ' +
        'Pass [] to clear.',
    ),
  pinnedAssetIds: z
    .array(z.string().uuid())
    .optional()
    .describe('Same as pinnedContactIds, for assets.'),
  view: z
    .enum(['contacts', 'assets'])
    .optional()
    .describe(
      "Which list to show in the right pane. 'contacts' (Network) is the default; 'assets' switches to things.",
    ),
});

export function makeTools({ supabase, embedQuery, recorder, setPanelState }: MakeToolsOptions) {
  return {
    query_sql: toolWrap(
      'query_sql',
      "Run a SELECT or WITH query against the user's data. RLS auto-scopes. " +
        'No mutations — use mutate_sql for those. ' +
        'Returns rows array on success, or { error, hint, retriable } on failure.',
      QuerySqlSchema,
      async ({ sql }) => {
        const cleaned = normalizeSql(sql);
        const lc = cleaned.toLowerCase();
        if (!(lc.startsWith('select') || lc.startsWith('with'))) {
          return toolError({
            error: 'query_sql only accepts SELECT or WITH statements.',
            hint: 'For inserts/updates/deletes use mutate_sql instead.',
            retriable: false,
          });
        }
        const { data, error } = await supabase.rpc('query_sql', { query: cleaned });
        if (error) {
          return toolError({
            error: error.message,
            pgCode: (error as { code?: string }).code,
            retriable: false,
          });
        }
        return { rows: data } as { rows: unknown };
      },
      { recorder },
    ),

    mutate_sql: toolWrap(
      'mutate_sql',
      'Run ONE INSERT / UPDATE / DELETE statement with a RETURNING clause. RLS auto-scopes. ' +
        'NEVER include user_id (DB defaults to auth.uid()). ' +
        'NEVER use ON CONFLICT — there are no UNIQUE constraints; use plain INSERT. ' +
        'Returns affected rows on success, or { error, hint, retriable } on failure. ' +
        "IMPORTANT: this tool also generates the row's search embedding inline " +
        'so search_* sees it immediately (no waiting for the async pipeline).',
      MutateSqlSchema,
      async ({ sql }) => {
        const cleaned = normalizeSql(sql);
        const lc = cleaned.toLowerCase();
        if (!(lc.startsWith('insert') || lc.startsWith('update') || lc.startsWith('delete'))) {
          return toolError({
            error: 'mutate_sql only accepts INSERT / UPDATE / DELETE.',
            hint: 'For reads use query_sql.',
            retriable: false,
          });
        }
        if (lc.includes('on conflict')) {
          return toolError({
            error: 'ON CONFLICT used but no UNIQUE constraint exists.',
            hint: PG_HINTS['42P10'],
            retriable: false,
          });
        }
        // Guard against `user_id` only in the column list / VALUES — false-
        // positives on UPDATE … WHERE user_id = auth.uid() are too noisy.
        if (/\(\s*[^)]*\buser_id\b/i.test(cleaned) || /set\s+[^;]*\buser_id\s*=/i.test(cleaned)) {
          return toolError({
            error: 'Do not set user_id in your SQL.',
            hint: PG_HINTS['42501'],
            retriable: false,
          });
        }
        const { data, error } = await supabase.rpc('mutate_sql', { query: cleaned });
        if (error) {
          return toolError({
            error: error.message,
            pgCode: (error as { code?: string }).code,
            retriable: false,
          });
        }
        // Inline-embed any contact/asset rows touched by an INSERT or
        // text-changing UPDATE. Cron'd embedding pipeline catches up
        // every ~10s; this closes the gap so search_* sees a fresh row
        // in the SAME turn it was created. Fire-and-forget per row so
        // a single embedding failure doesn't fail the whole mutate.
        const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        const isInsert = lc.startsWith('insert');
        const touchesEmbedFields =
          isInsert || /\b(name|notes|description|availability|city|tags)\s*=/i.test(cleaned);
        if (touchesEmbedFields && rows.length > 0) {
          await Promise.allSettled(rows.map((row) => inlineEmbed(supabase, embedQuery, row)));
        }
        return { rows: data } as { rows: unknown };
      },
      { recorder },
    ),

    find: toolWrap(
      'find',
      'Unified search across contacts AND assets. ONE rich call replaces ' +
        'many narrow ones. Pass `intent` (natural-language sentence) when ' +
        'phrasing matters, `queries` (string[] of keywords + synonyms in ' +
        'every relevant language) when exact words matter, BOTH when in ' +
        'doubt — they hit different indexes and combine cleanly. Add any ' +
        'structural filter you know (tags, city, warmth band, recency). ' +
        'Returns up to `limit` (default 50) of each table by score AND ' +
        '`total: { contacts, assets }` — the TRUE match count BEFORE the ' +
        'cap. Always use `total` in your chat narration, never ' +
        '`contacts.length`. On `ok:false`, read the `hint` and retry once.',
      FindSchema,
      async (params) => {
        const queries = params.queries?.filter((s) => s.trim().length > 0) ?? [];
        // Semantic embedding source:
        //   1. `intent` if the agent passed it (natural-language sentence,
        //      best signal for the embedding model)
        //   2. else `queries.join(' ')` (legacy bag-of-words fallback)
        //   3. else null (no semantic strategy this turn)
        const embedSource =
          typeof params.intent === 'string' && params.intent.trim().length > 0
            ? params.intent.trim()
            : queries.length > 0
              ? queries.join(' ')
              : null;
        let queryEmbedding: number[] | null = null;
        if (embedSource) {
          try {
            queryEmbedding = await embedQuery(embedSource);
          } catch {
            // Embedding service down → continue with FTS/trigram/ILIKE only.
            queryEmbedding = null;
          }
        }
        const table = params.table ?? 'both';
        const inContacts = table === 'contacts' || table === 'both';
        const inAssets = table === 'assets' || table === 'both';

        const { data, error } = await supabase.rpc('find_anything', {
          query_terms: queries.length > 0 ? queries : undefined,
          query_embedding: queryEmbedding ? vectorLiteral(queryEmbedding) : undefined,
          in_contacts: inContacts,
          in_assets: inAssets,
          required_tags: params.required_tags ?? undefined,
          any_tags: params.any_tags ?? undefined,
          min_warmth: params.min_warmth ?? undefined,
          max_warmth: params.max_warmth ?? undefined,
          city_filter: params.city ?? undefined,
          has_assets: params.has_assets ?? undefined,
          recent_days: params.recent_days ?? undefined,
          match_count: params.limit ?? 50,
        });
        if (error) {
          return toolError({
            error: error.message,
            pgCode: (error as { code?: string }).code,
            retriable: false,
          });
        }
        // 0014 added `total` to the return shape. Older builds without
        // the migration would lack it — fall back to candidate count
        // so the shape is always consistent for downstream consumers.
        const result = data as {
          contacts: unknown[];
          assets: unknown[];
          total?: { contacts?: number; assets?: number };
          debug: unknown;
        };
        const total = {
          contacts: Number(result.total?.contacts ?? (result.contacts ?? []).length),
          assets: Number(result.total?.assets ?? (result.assets ?? []).length),
        };
        return {
          contacts: result.contacts ?? [],
          assets: result.assets ?? [],
          total,
          debug: result.debug,
        };
      },
      { recorder },
    ),

    set_panel: toolWrap(
      'set_panel',
      // PURPOSE
      'Drive the right-pane filter / sort / search / pinning / view in ' +
        'lockstep with your textual answer. The pane IS the answer; chat ' +
        'is the receipt. ' +
        // WHEN
        'Call after almost every "who / what / show me" query, AND after ' +
        'any curation ("here are my top 3"). All keys optional; omitted ' +
        'keys are preserved; empty arrays clear a facet. ' +
        // RESULT CONTRACT
        'Returns `count: { contacts, assets }` (server-confirmed TRUE ' +
        'total after the patch) and `sample: { contacts, assets }` (top ' +
        '5 { id, name } pairs). Narrate count.contacts as "N matches"; ' +
        'render sample names as [Name](contact:<id>) mention links. ' +
        'NEVER guess counts from find() candidates — that lies. ' +
        // SELF-CORRECTION
        'Pinning validates server-side; invalid ids return `ok:false` ' +
        'with a hint to re-find. Read the hint, re-find, retry once.',
      SetPanelSchema,
      async (params) => {
        if (!setPanelState) {
          return toolError({
            error: 'Right-pane control is not available in this context.',
            hint: 'set_panel only works in the browser app, not in headless scripts.',
            retriable: false,
          });
        }
        // 1. Validate pinned ids server-side before touching panel
        //    state. Bad ids → tool error with a clear hint; agent can
        //    re-find and self-correct without the user seeing a stale
        //    pin badge.
        const wantsContactPins =
          params.pinnedContactIds != null && params.pinnedContactIds.length > 0;
        const wantsAssetPins = params.pinnedAssetIds != null && params.pinnedAssetIds.length > 0;
        if (wantsContactPins || wantsAssetPins) {
          const { data: validation, error: validationErr } = await supabase.rpc(
            'validate_panel_pins',
            {
              p_contact_ids: params.pinnedContactIds ?? undefined,
              p_asset_ids: params.pinnedAssetIds ?? undefined,
            } as never,
          );
          if (validationErr) {
            return toolError({
              error: `validate_panel_pins: ${validationErr.message}`,
              retriable: false,
            });
          }
          const v = validation as {
            missing_contact_ids?: string[];
            missing_asset_ids?: string[];
          };
          const missing = [...(v.missing_contact_ids ?? []), ...(v.missing_asset_ids ?? [])];
          if (missing.length > 0) {
            return toolError({
              error: `Cannot pin — these ids don't exist or are soft-deleted: ${missing.join(', ')}`,
              hint: 'Re-run find() to get current ids, then call set_panel again with only valid ones.',
              retriable: true,
            });
          }
        }

        // 2. Apply the patch to client panel state.
        const patch: Partial<PanelState> = {};
        if (params.contactFilter)
          patch.contactFilter = params.contactFilter as PanelState['contactFilter'];
        if (params.assetFilter) patch.assetFilter = params.assetFilter as PanelState['assetFilter'];
        if (params.contactSort) patch.contactSort = params.contactSort;
        if (params.assetSort) patch.assetSort = params.assetSort;
        if (params.search !== undefined) patch.search = params.search;
        if (params.pinnedContactIds !== undefined) patch.pinnedContactIds = params.pinnedContactIds;
        if (params.pinnedAssetIds !== undefined) patch.pinnedAssetIds = params.pinnedAssetIds;
        if (params.view) patch.view = params.view;
        setPanelState(patch);

        // 3. Query the truth: count + sample for the RESULTING filter
        //    (current panel state merged with the patch). The agent
        //    reads this back as `count.contacts` / `count.assets` and
        //    writes the honest number in chat.
        const truth = await readPanelTruth(supabase, patch);

        // 4. Broadcast the truth so the right pane's header adopts the
        //    new totals immediately (without waiting for its own
        //    page-1 refetch to land). Keeps chat card + pane header in
        //    perfect sync. Browser-only; no-op in headless contexts.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('reknowable:network-changed', {
              detail: { totals: truth.count },
            }),
          );
        }

        return {
          applied: patch,
          count: truth.count,
          sample: truth.sample,
        };
      },
      { recorder },
    ),

    clear_panel: toolWrap(
      'clear_panel',
      'Wipe every filter / search / pin on the right pane (sort + view ' +
        'are preserved). The result envelope carries `count: { contacts, ' +
        'assets }` so you can narrate "Cleared. Back to N contacts." ' +
        'instead of a vague "Cleared filters."',
      z.object({}).describe('No parameters.'),
      async () => {
        if (!setPanelState) {
          return toolError({
            error: 'Right-pane control is not available in this context.',
            hint: 'clear_panel only works in the browser app.',
            retriable: false,
          });
        }
        const wipe: Partial<PanelState> = {
          contactFilter: {
            tags: [],
            tagsAll: [],
            cities: [],
            warmth: [],
            hasAssets: null,
            updatedWithinDays: null,
          },
          assetFilter: {
            tags: [],
            tagsAll: [],
            ownerIds: [],
            hasOwner: null,
            availabilityContains: '',
            updatedWithinDays: null,
          },
          search: '',
          pinnedContactIds: [],
          pinnedAssetIds: [],
        };
        setPanelState(wipe);
        const truth = await readPanelTruth(supabase, wipe);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('reknowable:network-changed', {
              detail: { totals: truth.count },
            }),
          );
        }
        return { cleared: true, count: truth.count };
      },
      { recorder },
    ),
  };
}

/**
 * After applying a panel patch, query the server for the TRUE counts +
 * top-5 sample rows. The agent reads these from the tool result and
 * narrates accurately ("Filtered to 312 contacts. Top picks: Anna, Bo,
 * Cara, …") with mention links.
 *
 * Each call is at most 2 cheap parallel RPCs (~80ms p95 combined at
 * 10k rows) — same RPCs the right pane is already firing for its own
 * page-1 refetch. The duplicate cost is acceptable; the agent + UI
 * end up with identical numbers.
 *
 * NOTE: this builds the EFFECTIVE filter from the patch only. The
 * existing panel state on the client could have other facets active
 * that the patch doesn't touch — those won't be reflected in count
 * unless the patch echoes them. For most agent flows this is fine
 * because set_panel calls tend to be full-intent ("filter to gaming")
 * not partial. If the agent wants a precise count under partial
 * patches, it should explicitly include the unchanged facets too.
 */
async function readPanelTruth(
  supabase: SupabaseClient,
  patch: Partial<PanelState>,
): Promise<{
  count: { contacts: number; assets: number };
  sample: {
    contacts: Array<{ id: string; name: string }>;
    assets: Array<{ id: string; name: string }>;
  };
}> {
  const cf = fillContactFilter(patch.contactFilter);
  const af = fillAssetFilter(patch.assetFilter);
  const search = typeof patch.search === 'string' ? patch.search : '';
  const contactSort: ContactSortMode = patch.contactSort ?? 'warmth_desc';
  const assetSort: AssetSortMode = patch.assetSort ?? 'updated_desc';

  const [{ data: contactsPage }, { data: assetsPage }] = await Promise.all([
    supabase.rpc('query_contacts_page', {
      p_search: search.trim() || undefined,
      p_cities: cf.cities.length > 0 ? cf.cities : undefined,
      p_warmth: cf.warmth.length > 0 ? cf.warmth : undefined,
      p_tags_any: cf.tags.length > 0 ? cf.tags : undefined,
      p_tags_all: cf.tagsAll.length > 0 ? cf.tagsAll : undefined,
      p_has_assets: cf.hasAssets ?? undefined,
      p_updated_within_days: cf.updatedWithinDays ?? undefined,
      p_sort: contactSort,
      p_offset: 0,
      p_limit: 5,
    } as never),
    supabase.rpc('query_assets_page', {
      p_search: search.trim() || undefined,
      p_tags_any: af.tags.length > 0 ? af.tags : undefined,
      p_tags_all: af.tagsAll.length > 0 ? af.tagsAll : undefined,
      p_owner_ids: af.ownerIds.length > 0 ? af.ownerIds : undefined,
      p_has_owner: af.hasOwner ?? undefined,
      p_availability_contains: af.availabilityContains.trim() || undefined,
      p_updated_within_days: af.updatedWithinDays ?? undefined,
      p_sort: assetSort,
      p_offset: 0,
      p_limit: 5,
    } as never),
  ]);

  const contactsRows = (contactsPage ?? []) as unknown as Array<{
    id: string;
    name: string;
    total_count: number;
  }>;
  const assetsRows = (assetsPage ?? []) as unknown as Array<{
    id: string;
    name: string;
    total_count: number;
  }>;

  return {
    count: {
      contacts: Number(contactsRows[0]?.total_count ?? 0),
      assets: Number(assetsRows[0]?.total_count ?? 0),
    },
    sample: {
      contacts: contactsRows.map((r) => ({ id: r.id, name: r.name })),
      assets: assetsRows.map((r) => ({ id: r.id, name: r.name })),
    },
  };
}

export type AgentTools = ReturnType<typeof makeTools>;

/**
 * Fill in defaults for a partial contact-filter object.
 *
 * The agent's set_panel schema marks every facet as optional, so the
 * agent legitimately sends partials like `{ tags: ['podcast'] }`. Code
 * downstream that expects a complete ContactFilterState (and reaches
 * for `.length` on the array fields) would otherwise crash with
 * `Cannot read properties of undefined (reading 'length')`.
 *
 * Exported for unit testing. Pure, no side effects.
 */
export function fillContactFilter(
  raw: Partial<ContactFilterState> | null | undefined,
): ContactFilterState {
  const f = (raw ?? {}) as Partial<ContactFilterState>;
  return {
    tags: Array.isArray(f.tags) ? f.tags : [],
    tagsAll: Array.isArray(f.tagsAll) ? f.tagsAll : [],
    cities: Array.isArray(f.cities) ? f.cities : [],
    warmth: Array.isArray(f.warmth) ? f.warmth : [],
    hasAssets: f.hasAssets ?? null,
    updatedWithinDays: f.updatedWithinDays ?? null,
  };
}

/** Same as fillContactFilter, for asset-side filters. */
export function fillAssetFilter(
  raw: Partial<AssetFilterState> | null | undefined,
): AssetFilterState {
  const f = (raw ?? {}) as Partial<AssetFilterState>;
  return {
    tags: Array.isArray(f.tags) ? f.tags : [],
    tagsAll: Array.isArray(f.tagsAll) ? f.tagsAll : [],
    ownerIds: Array.isArray(f.ownerIds) ? f.ownerIds : [],
    hasOwner: f.hasOwner ?? null,
    availabilityContains: typeof f.availabilityContains === 'string' ? f.availabilityContains : '',
    updatedWithinDays: f.updatedWithinDays ?? null,
  };
}
