'use client';

import { useState, type ReactNode } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

export type SignInScreenProps = {
  onSignedIn: () => void;
  redirectError?: string;
  extraProviders?: ReactNode;
};

export function SignInScreen({ onSignedIn, redirectError, extraProviders }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(redirectError ?? null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInErr } = await getBrowserSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        setError(signInErr.message);
        return;
      }
      onSignedIn();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      data-testid="sign-in-screen"
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-12"
    >
      <header className="mb-8 space-y-1">
        <p className="text-xs uppercase tracking-wider text-faint">network-ai</p>
        <h1 className="text-2xl font-semibold tracking-tighter text-fg">Welcome back</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          testId="sign-in-email"
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          testId="sign-in-password"
        />
        {error ? (
          <p
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            data-testid="sign-in-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          data-testid="sign-in-submit"
          className="inline-flex w-full items-center justify-center rounded-md bg-fg px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {extraProviders ? (
        <div className="mt-6 border-t border-border-soft pt-6">{extraProviders}</div>
      ) : null}

      <p className="mt-8 text-sm text-muted">
        Don't have an account?{' '}
        <a
          href="/sign-up"
          data-testid="sign-in-to-sign-up"
          className="text-fg underline-offset-4 hover:underline"
        >
          Sign up
        </a>
      </p>
    </main>
  );
}

function Field({
  label,
  type,
  autoComplete,
  required,
  value,
  onChange,
  testId,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  value: string;
  onChange: (s: string) => void;
  testId?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs uppercase tracking-wider text-faint">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-md bg-surface-soft px-3 py-2 text-sm text-fg shadow-hairline-soft placeholder:text-faint focus:outline-none focus:shadow-focus"
      />
    </label>
  );
}
