-- 0011_notify_pgrst.sql
-- Force PostgREST to reload its schema cache after find_anything was added
-- in 0010. Supabase normally auto-reloads on DDL via an event trigger, but
-- it occasionally misses functions with halfvec params — the live deploy
-- saw `Could not find the function public.find_anything(...) in the
-- schema cache` immediately after 0010 applied.
--
-- NOTIFY fires synchronously during the migration's transaction commit;
-- PostgREST picks it up within ~100ms and re-reads pg_proc.

notify pgrst, 'reload schema';
