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
import { toolWrap, toolError, PG_HINTS } from './toolWrap';
import type { DebugRecorder } from './debugRecorder';

export type EmbedQueryFn = (text: string) => Promise<number[]>;

export type MakeToolsOptions = {
  supabase: SupabaseClient;
  embedQuery: EmbedQueryFn;
  recorder?: DebugRecorder;
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
      'A single INSERT / UPDATE / DELETE with a RETURNING clause. Plain INSERT only — no ON CONFLICT.',
    ),
});

/**
 * The unified search tool's schema. Designed for the AI to pass EVERYTHING
 * it knows in one call — multiple candidate keywords (Swedish + English,
 * synonyms, brand names), structural filters, AND a grep-style substring
 * or regex. Postgres does the heavy lifting (see find_anything in 0010).
 *
 * All fields are optional. A useful minimum is one of:
 *   - queries: ['podd', 'podcast', 'inspelning']
 *   - contains: 'podcast'
 *   - regex: 'pod.*'
 *   - required_tags / any_tags / city / etc. (filter-only listing)
 */
const FindSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Multiple candidate keywords/phrases. OR-tokenized + prefix-matched ' +
        'against FTS, mean-pooled for vector search, and trigram-matched. ' +
        "Pass EVERY candidate term you can think of — including the user's " +
        'exact word AND its translation (e.g. ["podd", "podcast", "inspelning"]). ' +
        'Results are ranked; you filter from there.',
    ),
  contains: z
    .string()
    .optional()
    .describe(
      'Grep-style substring (case-insensitive ILIKE) anywhere in name + ' +
        'notes/description/city. Adds a strong score bonus when it matches.',
    ),
  regex: z
    .string()
    .optional()
    .describe(
      'POSIX regex (case-insensitive). Power-use only — `pod.*utrust` style. ' +
        'Operates over name + notes/description.',
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

export function makeTools({ supabase, embedQuery, recorder }: MakeToolsOptions) {
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
      'Unified search across contacts AND assets. Designed for one rich call ' +
        'instead of N narrow ones — pass every candidate keyword you can ' +
        'think of (Swedish + English, synonyms), every filter you know ' +
        '(tags, city, warmth band, recency), and optionally a substring or ' +
        'regex. The server runs 5 strategies in parallel (FTS, vector, ' +
        'trigram, ILIKE, regex), composite-scores, returns up to 50 of each ' +
        'table sorted by score. You filter from the result.',
      FindSchema,
      async (params) => {
        const queries = params.queries?.filter((s) => s.trim().length > 0) ?? [];
        let queryEmbedding: number[] | null = null;
        if (queries.length > 0) {
          try {
            queryEmbedding = await embedQuery(queries.join(' '));
          } catch {
            // Embedding service down → continue with FTS/trigram/ILIKE only.
            queryEmbedding = null;
          }
        }
        const table = params.table ?? 'both';
        const inContacts = table === 'contacts' || table === 'both';
        const inAssets = table === 'assets' || table === 'both';

        const { data, error } = await supabase.rpc('find_anything', {
          query_terms: queries.length > 0 ? queries : null,
          query_embedding: queryEmbedding ? vectorLiteral(queryEmbedding) : null,
          regex_pattern: params.regex ?? null,
          in_contacts: inContacts,
          in_assets: inAssets,
          required_tags: params.required_tags ?? null,
          any_tags: params.any_tags ?? null,
          min_warmth: params.min_warmth ?? null,
          max_warmth: params.max_warmth ?? null,
          city_filter: params.city ?? null,
          contains_filter: params.contains ?? null,
          has_assets: params.has_assets ?? null,
          recent_days: params.recent_days ?? null,
          match_count: params.limit ?? 50,
        });
        if (error) {
          return toolError({
            error: error.message,
            pgCode: (error as { code?: string }).code,
            retriable: false,
          });
        }
        return data as { contacts: unknown; assets: unknown; debug: unknown };
      },
      { recorder },
    ),
  };
}

export type AgentTools = ReturnType<typeof makeTools>;
