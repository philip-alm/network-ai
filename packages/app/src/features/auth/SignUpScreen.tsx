'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { getBrowserSupabase } from '../../lib/supabase';
import { Wordmark } from '../brand';

export type SignUpScreenProps = {
  onSignedUp: () => void;
};

type Phase = 'form' | 'success';

export function SignUpScreen({ onSignedUp }: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password needs at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signUpErr } = await getBrowserSupabase().auth.signUp({
        email,
        password,
      });
      if (signUpErr) {
        setError(signUpErr.message);
        return;
      }
      if (data.session) {
        onSignedUp();
      } else {
        setPhase('success');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      data-testid="sign-up-screen"
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

      {phase === 'success' ? (
        <SuccessState email={email} />
      ) : (
        <>
          <header className="relative mb-12 space-y-5 animate-fade-in">
            <Wordmark tone="hero" />
            <div className="space-y-2">
              <h1 className="text-[2rem] font-medium leading-[1.15] tracking-[-0.028em] text-fg">
                Recall, on demand.
              </h1>
              <p className="text-[15px] leading-relaxed text-muted">
                A second brain for everyone you know and everything they can offer. Your private
                notebook to start.
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
              testId="sign-up-email"
            />
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={setPassword}
              testId="sign-up-password"
              hint="At least 8 characters."
            />
            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={setConfirmPassword}
              testId="sign-up-confirm"
            />
            {error ? (
              <p
                className="animate-fade-in rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                data-testid="sign-up-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              data-testid="sign-up-submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-fg px-3 py-2.5 text-sm font-medium tracking-tight text-bg transition-all duration-fast ease-out-quart hover:opacity-90 focus-visible:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-bg/30 border-t-bg"
                    aria-hidden
                  />
                  Creating account
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="relative mt-10 text-sm text-muted">
            Already have an account?{' '}
            <a
              href="/sign-in"
              data-testid="sign-up-to-sign-in"
              className="text-fg underline decoration-border underline-offset-4 transition-colors duration-fast hover:decoration-accent focus-visible:decoration-accent"
            >
              Sign in
            </a>
          </p>
        </>
      )}
    </main>
  );
}

function SuccessState({ email }: { email: string }) {
  return (
    <div
      className="relative animate-fade-in space-y-6 text-center"
      data-testid="sign-up-info"
      role="status"
    >
      <Wordmark tone="hero" className="justify-center" />
      <div
        aria-hidden
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent shadow-[0_0_0_1px_var(--color-accent-soft)]"
      >
        <Mail size={18} />
      </div>
      <div className="space-y-2">
        <h1 className="text-[1.75rem] font-medium leading-[1.15] tracking-[-0.028em] text-fg">
          Check your email.
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          We sent a confirmation link to <span className="font-medium text-fg">{email}</span>. Open
          it and you're in.
        </p>
      </div>
      <p className="text-xs text-faint">
        Didn't arrive? Check spam, or{' '}
        <a
          href="/sign-up"
          className="text-fg underline decoration-border underline-offset-4 transition-colors duration-fast hover:decoration-accent"
        >
          try again
        </a>
        .
      </p>
    </div>
  );
}

function Field({
  label,
  type,
  autoComplete,
  required,
  minLength,
  value,
  onChange,
  testId,
  hint,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  value: string;
  onChange: (s: string) => void;
  testId?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="block text-xs font-medium text-muted">{label}</span>
        {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-md bg-bg px-3 py-2.5 text-sm tracking-tight text-fg shadow-hairline placeholder:text-faint transition-shadow duration-base ease-out-quart focus:shadow-focus focus:outline-none"
      />
    </label>
  );
}
