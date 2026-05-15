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

const SearchContactsSchema = z.object({
  query: z.string().min(1).describe('Natural-language search text.'),
  min_warmth: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max warmth value (lower = warmer). e.g. 2 means "warmth 1 or 2".'),
  required_tags: z.array(z.string()).optional().describe('All listed tags must be present.'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

const SearchAssetsSchema = z.object({
  query: z.string().min(1),
  required_tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

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
        'Returns affected rows on success, or { error, hint, retriable } on failure.',
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
        return { rows: data } as { rows: unknown };
      },
      { recorder },
    ),

    search_contacts: toolWrap(
      'search_contacts',
      "Hybrid (semantic + keyword) search over the user's contacts. Use for " +
        'natural-language queries like "who could help with hardware in göteborg". ' +
        'Optional structured filters. Returns rows on success.',
      SearchContactsSchema,
      async ({ query, min_warmth, required_tags, limit }) => {
        const embedding = await embedQuery(query);
        const { data, error } = await supabase.rpc('hybrid_search_contacts', {
          query_text: query,
          query_embedding: vectorLiteral(embedding),
          match_count: limit ?? 10,
          ...(min_warmth !== undefined ? { min_warmth } : {}),
          ...(required_tags !== undefined ? { required_tags } : {}),
        });
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

    search_assets: toolWrap(
      'search_assets',
      "Hybrid (semantic + keyword) search over the user's assets. Use for " +
        '"what do we have for X" questions. Returns rows on success.',
      SearchAssetsSchema,
      async ({ query, required_tags, limit }) => {
        const embedding = await embedQuery(query);
        const { data, error } = await supabase.rpc('hybrid_search_assets', {
          query_text: query,
          query_embedding: vectorLiteral(embedding),
          match_count: limit ?? 10,
          ...(required_tags !== undefined ? { required_tags } : {}),
        });
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
  };
}

export type AgentTools = ReturnType<typeof makeTools>;
