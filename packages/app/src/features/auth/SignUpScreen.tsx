'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

export type SignUpScreenProps = {
  onSignedUp: () => void;
};

export function SignUpScreen({ onSignedUp }: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
        setInfo(`Check ${email} for a confirmation link.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      data-testid="sign-up-screen"
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-12"
    >
      <header className="mb-8 space-y-1">
        <p className="text-xs uppercase tracking-wider text-faint">network-ai</p>
        <h1 className="text-2xl font-semibold tracking-tighter text-fg">Create your account</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
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
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            data-testid="sign-up-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {info ? (
          <p
            className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-fg"
            data-testid="sign-up-info"
            role="status"
          >
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          data-testid="sign-up-submit"
          className="inline-flex w-full items-center justify-center rounded-md bg-fg px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted">
        Already have an account?{' '}
        <a
          href="/sign-in"
          data-testid="sign-up-to-sign-in"
          className="text-fg underline-offset-4 hover:underline"
        >
          Sign in
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
  minLength,
  value,
  onChange,
  testId,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
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
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-md bg-surface-soft px-3 py-2 text-sm text-fg shadow-hairline-soft placeholder:text-faint focus:outline-none focus:shadow-focus"
      />
    </label>
  );
}
