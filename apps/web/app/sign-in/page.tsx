'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignInScreen } from '@network-ai/app';

function SignInBody() {
  const router = useRouter();
  const params = useSearchParams();
  const errorParam = params.get('error') ?? undefined;
  const next = params.get('next') ?? '/';

  return <SignInScreen onSignedIn={() => router.push(next as never)} redirectError={errorParam} />;
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInBody />
    </Suspense>
  );
}
