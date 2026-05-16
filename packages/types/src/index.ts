/**
 * @reknowable/types — shared types across the workspace.
 *
 * `./db.ts` is regenerated from Supabase via `pnpm -F @reknowable/types generate`.
 * Hand-written types live in this file or sibling files.
 */

export type { Database, Json } from './db';

import type { Database } from './db';

/** Convenience: row type for a table in the public schema. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Convenience: insert type for a table in the public schema. */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Convenience: update type for a table in the public schema. */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
