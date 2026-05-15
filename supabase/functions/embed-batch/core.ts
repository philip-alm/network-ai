/**
 * embed-batch core logic — runtime-agnostic.
 *
 * Imported by both:
 *   - `index.ts` (Deno entrypoint, wires `fetch` against OpenRouter)
 *   - `supabase/tests/embed_batch.test.ts` (Node, injects a stub embedFn)
 *
 * `processOneBatch` reads up to N jobs from pgmq via the public wrapper RPCs,
 * fetches each row's embeddable text, batches them into one embed() call, and
 * writes the resulting vectors back. Failed jobs are not deleted from pgmq;
 * the visibility timeout returns them to the queue for retry.
 */

// supabase-js's heavily-overloaded types differ across versions (Node vs Deno
// vs subtle workspace hoisting). We accept the broad `any` here — the function
// is exercised by integration tests against a real Supabase, which is a much
// stronger contract than a structural TypeScript shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

type Job = { msg_id: number; message: { table: string; id: string; user_id: string } };

type ProcessOptions = {
  batchSize?: number;
  visibilityTimeoutSec?: number;
};

export type ProcessResult = {
  processed: number;
  failed: number;
  empty: boolean;
};

/**
 * Drains one batch from the embedding_jobs queue.
 *
 * @param supabase  Service-role Supabase client (bypasses RLS; required to
 *                  call the SECURITY DEFINER pgmq wrappers and to UPDATE
 *                  arbitrary user rows).
 * @param embed     Function that turns an array of strings into an array of
 *                  embedding vectors. Same length, same order.
 * @param opts      `batchSize` (default 50), `visibilityTimeoutSec` (default 60).
 */
export async function processOneBatch(
  supabase: SupabaseLike,
  embed: EmbedFn,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const qty = opts.batchSize ?? 50;
  const vt = opts.visibilityTimeoutSec ?? 60;

  const { data: jobsData, error: readErr } = await supabase.rpc('read_embedding_jobs', {
    p_qty: qty,
    p_vt: vt,
  });
  if (readErr) throw new Error(`read_embedding_jobs failed: ${readErr.message}`);

  const jobs = (jobsData ?? []) as Job[];
  if (jobs.length === 0) return { processed: 0, failed: 0, empty: true };

  // Fetch each row's embeddable text. Group by table to minimize round trips.
  type Hydrated = { job: Job; text: string | null };
  const hydrated: Hydrated[] = [];

  const contactIds = jobs.filter((j) => j.message.table === 'contacts').map((j) => j.message.id);
  const assetIds = jobs.filter((j) => j.message.table === 'assets').map((j) => j.message.id);

  const textByContactId = new Map<string, string>();
  if (contactIds.length) {
    const { data: rows, error } = await supabase
      .from('contacts')
      .select('id, name, notes, city, tags')
      .in('id', contactIds);
    if (error) throw new Error(`hydrate contacts failed: ${error.message}`);
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const tags = (r.tags as string[] | null) ?? [];
      textByContactId.set(
        r.id as string,
        [
          r.name as string,
          (r.notes as string | null) ?? '',
          (r.city as string | null) ?? '',
          tags.join(' '),
        ]
          .join(' ')
          .trim(),
      );
    }
  }

  const textByAssetId = new Map<string, string>();
  if (assetIds.length) {
    const { data: rows, error } = await supabase
      .from('assets')
      .select('id, name, description, availability, tags')
      .in('id', assetIds);
    if (error) throw new Error(`hydrate assets failed: ${error.message}`);
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const tags = (r.tags as string[] | null) ?? [];
      textByAssetId.set(
        r.id as string,
        [
          r.name as string,
          (r.description as string | null) ?? '',
          (r.availability as string | null) ?? '',
          tags.join(' '),
        ]
          .join(' ')
          .trim(),
      );
    }
  }

  for (const job of jobs) {
    const text =
      job.message.table === 'contacts'
        ? (textByContactId.get(job.message.id) ?? null)
        : job.message.table === 'assets'
          ? (textByAssetId.get(job.message.id) ?? null)
          : null;
    hydrated.push({ job, text });
  }

  // Some jobs may reference rows that no longer exist (deleted before processing).
  // We delete those jobs immediately so they don't keep retrying.
  const stale = hydrated.filter((h) => h.text === null);
  for (const h of stale) {
    await supabase.rpc('delete_embedding_job', { p_msg_id: h.job.msg_id });
  }

  const live = hydrated.filter(
    (h): h is { job: Job; text: string } => h.text !== null && h.text.length > 0,
  );
  if (live.length === 0) {
    return { processed: 0, failed: 0, empty: false };
  }

  // One embed() call per batch — providers price per-token, not per-call.
  let vectors: number[][];
  try {
    vectors = await embed(live.map((h) => h.text));
  } catch (err) {
    // Leave jobs in queue (visibility timeout will return them for retry).
    return { processed: 0, failed: live.length, empty: false };
  }
  if (vectors.length !== live.length) {
    throw new Error(
      `embed() returned ${vectors.length} vectors for ${live.length} inputs — provider contract violated`,
    );
  }

  // Write embeddings back + delete each job from the queue.
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < live.length; i++) {
    const { job, text: _ } = live[i];
    const vec = vectors[i];
    if (vec.length !== EMBEDDING_DIM) {
      failed++;
      continue;
    }
    const vectorLiteral = `[${vec.join(',')}]`;
    const { error: updErr } = await supabase
      .from(job.message.table)
      .update({
        embedding: vectorLiteral,
        embedding_model: EMBEDDING_MODEL,
        embedding_generated_at: new Date().toISOString(),
      })
      .eq('id', job.message.id);
    if (updErr) {
      failed++;
      continue;
    }
    await supabase.rpc('delete_embedding_job', { p_msg_id: job.msg_id });
    processed++;
  }

  return { processed, failed, empty: false };
}
