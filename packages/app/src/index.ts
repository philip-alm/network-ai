/**
 * @network-ai/app — shared screens, hooks, and business logic.
 *
 * The single source of truth for app behavior. Both `apps/web/` and `apps/native/`
 * consume this package; the shells contribute only routing + auth callbacks + deep linking.
 */

export const helloFromAppPackage = (): string => 'Hello from packages/app';

// Auth (Phase 2)
export * from './features/auth';

// Lib (Phase 2 + 5)
export * from './lib/supabase';
export * from './lib/env';
export * from './lib/agent';

// Phase 6 features
export * from './features/chat';
export * from './features/contacts';
export * from './features/home';
