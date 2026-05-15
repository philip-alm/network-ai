# supabase/functions/delete-account

Permanently deletes the caller's account + all their data. Required for
Apple App Store (Guideline 5.1.1(v)) and good practice everywhere.

## Public API

- `POST /` (caller's JWT) → `{ ok, deletedUserId }` on success, `{ error }` on failure
- `GET /health`

## How it works

1. Validate the caller's JWT via `auth.getUser(token)`.
2. Use the service-role to call `auth.admin.deleteUser(userId)`.
3. The `auth.users.id ON DELETE CASCADE` foreign keys on contacts / assets /
   chat_threads / chat_messages purge every owned row in the same transaction.

## What's intentionally NOT here

- Apple `auth/revoke` call — pending iOS deployment. The user's Apple refresh
  token would be stored at sign-up time (Phase 8.5 when shipping iOS) and the
  delete flow would also call `https://appleid.apple.com/auth/revoke` to
  invalidate Apple's session.

## Tests (MANDATORY)

`scripts/verify-account-deletion.ts` programmatically creates a user, seeds
contacts + assets + threads + messages + an embedding job in pgmq, hits this
function, asserts every owned row is gone.

## Recent design decisions

- 2026-05-15: created. Apple-revoke deferred until iOS ships per plan §11
  Phase 8.
