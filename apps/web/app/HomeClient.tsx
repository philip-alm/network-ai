'use client';

import { useRouter } from 'next/navigation';
import { HomeScreen, getBrowserSupabase } from '@network-ai/app';

export function HomeClient({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  return (
    <HomeScreen
      userId={userId}
      userEmail={userEmail}
      onSignOut={async () => {
        await getBrowserSupabase().auth.signOut();
        router.push('/sign-in' as never);
      }}
    />
  );
}
