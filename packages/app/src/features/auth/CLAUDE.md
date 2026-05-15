# packages/app/features/auth

Auth screens (`SignInScreen`, `SignUpScreen`) shared across web + native. Web shell mounts them at `/sign-in` and `/sign-up`; native shell at `app/(auth)/sign-in.tsx` etc.

Email/password is the primary auth path. Google + Apple buttons render but are wired during Phase 2.5 (require dashboard provider config).

## Public API

- `SignInScreen` — props: `{ onSignedIn: () => void; redirectError?: string }`
- `SignUpScreen` — props: `{ onSignedUp: () => void }`
- `useAuth()` — hook returning `{ user, session, signOut }` (subscribes to Supabase auth state changes)

## Dependencies

- `@network-ai/app/lib/supabase` — the auth client
- `react`, `react-native`
- `zod` — form validation

## What's banned in this module

- Constructing a Supabase client locally — use `getBrowserSupabase()` or accept one as prop
- Storing passwords anywhere; pass straight to `signInWithPassword`
- `console.log` of email / password

## Tests (MANDATORY)

- Component tests: SignInScreen renders email + password + submit. Submit calls `signInWithPassword` with the right args. Error message renders on failure.
- Integration test (in `supabase/tests/`): programmatically sign up + sign in + sign out via the supabase client; assert session refresh works.

## Recent design decisions

- 2026-05-15: created with email/password first. Google/Apple buttons are stubs that throw "not configured yet" so wiring exists for Phase 2.5.
