'use client';

import { useRouter } from 'next/navigation';
import { LabScreen } from '@reknowable/app';

export function LabClient() {
  const router = useRouter();
  return <LabScreen onBack={() => router.push('/' as never)} />;
}
