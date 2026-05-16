'use client';

import { useState, type ReactNode } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { Wordmark } from '../brand';

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
      className="relative mx-auto flex w-full max-w-sm flex-col justify-center px-6 py-12"
      style={{ minHeight: '100dvh' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft opacity-40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-[0.08] blur-2xl"
      />
      <header className="relative mb-12 space-y-5 animate-fade-in">
        <Wordmark tone="hero" />
        <div className="space-y-2">
          <h1 className="text-[2rem] font-medium leading-[1.15] tracking-[-0.028em] text-fg">
            Welcome back.
          </h1>
          <p className="text-[15px] leading-relaxed text-muted">
            Open the notebook. Pick up where you left off.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="relative space-y-3">
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
            className="animate-fade-in rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
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
          className="inline-flex w-full items-center justify-center rounded-md bg-fg px-3 py-2.5 text-sm font-medium tracking-tight text-bg transition-all duration-fast ease-out-quart hover:opacity-90 focus-visible:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-bg/30 border-t-bg"
                aria-hidden
              />
              Signing in
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {extraProviders ? (
        <div className="relative mt-6 border-t border-border-soft pt-6">{extraProviders}</div>
      ) : null}

      <p className="relative mt-10 text-sm text-muted">
        Don't have an account?{' '}
        <a
          href="/sign-up"
          data-testid="sign-in-to-sign-up"
          className="text-fg underline decoration-border underline-offset-4 transition-colors duration-fast hover:decoration-accent focus-visible:decoration-accent"
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
      <span className="block text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-md bg-bg px-3 py-2.5 text-sm tracking-tight text-fg shadow-hairline placeholder:text-faint transition-shadow duration-base ease-out-quart focus:shadow-focus focus:outline-none"
      />
    </label>
  );
}
