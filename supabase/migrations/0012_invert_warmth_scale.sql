-- 0012_invert_warmth_scale.sql
--
-- Flips the warmth scale so that 5 = warmest (closest) and 1 = most distant.
-- Was previously 1 = warmest. The UI, system prompt, color tokens, and labels
-- have been updated in lockstep; this migration flips existing row values so
-- a contact recorded as "warmth 1, would drop everything" under the OLD scale
-- becomes "warmth 5, would drop everything" under the NEW scale — preserving
-- the user's semantic intent.
--
-- Idempotency: there is no in-row flag for "already migrated" because the
-- transform is value-symmetric (1↔5, 2↔4, 3↔3). Running this twice would
-- restore the original values. Apply exactly once per environment.

update public.contacts
set warmth = 6 - warmth
where warmth is not null;
