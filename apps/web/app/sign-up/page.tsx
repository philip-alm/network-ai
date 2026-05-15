'use client';

import { useRouter } from 'next/navigation';
import { SignUpScreen } from '@network-ai/app';

export default function SignUpPage() {
  const router = useRouter();
  return <SignUpScreen onSignedUp={() => router.push('/' as never)} />;
}
