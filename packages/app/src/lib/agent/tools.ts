/**
 * The four agent tools. RLS-scoped via the caller's JWT; the agent gets
 * maximum SQL capability over the user's own rows and nothing else.
 *
 * `embedQuery` is injected so the same tools work in browser (calls an
 * embed-query Edge Function) and Node scripts (calls OpenRouter directly).
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '../supabase';

export type EmbedQueryFn = (text: string) => Promise<number[]>;

export type MakeToolsOptions = {
  supabase: SupabaseClient;
  embedQuery: EmbedQueryFn;
};

function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

export function makeTools({ supabase, embedQuery }: MakeToolsOptions) {
  // Errors are returned as data (not thrown) so the model can read the failure
  // and self-correct on the next step instead of the whole tool call surfacing
  // as a generic provider error.
  return {
    query_sql: tool({
      description:
        "Run a SELECT or WITH query against the user's data. RLS auto-scopes to the user. No mutations allowed — use mutate_sql for those.",
      inputSchema: z.object({
        sql: z.string().describe('A SELECT or WITH statement. No mutations.'),
      }),
      execute: async ({ sql }) => {
        const { data, error } = await supabase.rpc('query_sql', { query: sql });
        if (error) return { error: error.message };
        return { rows: data };
      },
    }),

    mutate_sql: tool({
      description:
        'Run ONE INSERT / UPDATE / DELETE statement with a RETURNING clause. RLS auto-scopes. NEVER include user_id (DB defaults to auth.uid()). NEVER use ON CONFLICT — there are no UNIQUE constraints; just plain INSERT.',
      inputSchema: z.object({
        sql: z
          .string()
          .describe(
            'A single INSERT, UPDATE, or DELETE with RETURNING. Plain INSERT only — no ON CONFLICT.',
          ),
      }),
      execute: async ({ sql }) => {
        const { data, error } = await supabase.rpc('mutate_sql', { query: sql });
        if (error) return { error: error.message };
        return { rows: data };
      },
    }),

    search_contacts: tool({
      description:
        "Hybrid (semantic + keyword) search over the user's contacts. Use for natural-language queries like 'who could help with hardware in göteborg'. Optional structured filters.",
      inputSchema: z.object({
        query: z.string().describe('Natural-language search text.'),
        min_warmth: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe('Maximum warmth value (lower = warmer); e.g. 2 means "warmth 1 or 2".'),
        required_tags: z.array(z.string()).optional().describe('All tags must be present.'),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
      execute: async ({ query, min_warmth, required_tags, limit }) => {
        try {
          const embedding = await embedQuery(query);
          const { data, error } = await supabase.rpc('hybrid_search_contacts', {
            query_text: query,
            query_embedding: vectorLiteral(embedding),
            match_count: limit ?? 10,
            ...(min_warmth !== undefined ? { min_warmth } : {}),
            ...(required_tags !== undefined ? { required_tags } : {}),
          });
          if (error) return { error: error.message };
          return { rows: data };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    search_assets: tool({
      description:
        "Hybrid (semantic + keyword) search over the user's assets. Use for 'what do we have for X' questions. Filters by required tags.",
      inputSchema: z.object({
        query: z.string(),
        required_tags: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(50).optional().default(10),
      }),
      execute: async ({ query, required_tags, limit }) => {
        try {
          const embedding = await embedQuery(query);
          const { data, error } = await supabase.rpc('hybrid_search_assets', {
            query_text: query,
            query_embedding: vectorLiteral(embedding),
            match_count: limit ?? 10,
            ...(required_tags !== undefined ? { required_tags } : {}),
          });
          if (error) return { error: error.message };
          return { rows: data };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof makeTools>;
