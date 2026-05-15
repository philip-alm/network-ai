import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { helloFromAppPackage } from '@network-ai/app';

export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>network-ai</h1>
      <p>Signed in as {user.email}</p>
      <p data-testid="hello-from-app">{helloFromAppPackage()}</p>
      <p style={{ color: '#666', marginTop: '2rem' }}>
        Phase 2 auth shell. UI (chat + accordion) lands in Phase 6.
      </p>
    </main>
  );
}
