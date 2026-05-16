'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsScreen, KeyboardCheatsheet, getBrowserSupabase } from '@reknowable/app';

export function SettingsClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  return (
    <>
      <SettingsScreen
        userEmail={userEmail}
        onBack={() => router.push('/' as never)}
        onSignOut={async () => {
          await getBrowserSupabase().auth.signOut();
          router.push('/sign-in' as never);
        }}
        onDeleteAccount={async () => {
          // TODO: wire to the production deletion endpoint when it lands.
          // For now: sign-out as the safest no-op, with a thrown error so
          // the user sees the affordance is wired but not yet live.
          throw new Error('Account deletion is not enabled in this build. Contact support.');
        }}
        onOpenCheatsheet={() => setCheatsheetOpen(true)}
      />
      <KeyboardCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
    </>
  );
}
