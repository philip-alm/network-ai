import { helloFromAppPackage } from '@network-ai/app';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>network-ai</h1>
      <p data-testid="hello-from-app">{helloFromAppPackage()}</p>
      <p style={{ color: '#666', marginTop: '2rem' }}>
        Phase 0 scaffold. UI + auth land in subsequent phases.
      </p>
    </main>
  );
}
