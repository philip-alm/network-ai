/**
 * @network-ai/app — shared screens, hooks, and business logic.
 *
 * The single source of truth for app behavior. Both `apps/web/` and `apps/native/`
 * consume this package; the shells contribute only routing + auth callbacks + deep linking.
 */

export const helloFromAppPackage = (): string => 'Hello from packages/app';

// Feature exports will land here as they are built in subsequent phases:
// export * from './features/chat';
// export * from './features/contacts';
// export * from './features/assets';
// export * from './features/auth';
// export * from './features/home';
// export * from './lib/supabase';
// export * from './lib/agent';
// export * from './lib/env';
