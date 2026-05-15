'use client';

import { useState, type ReactNode } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

export type SignInScreenProps = {
  /** Called after a successful sign-in. Typical: router.push('/'). */
  onSignedIn: () => void;
  /** Optional error banner copy (e.g. surfaced from the auth callback route). */
  redirectError?: string;
  /** Render hooks for additional providers — defaults to nothing. */
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
      const supabase = getBrowserSupabase();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
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
    <main style={styles.shell} data-testid="sign-in-screen">
      <h1 style={styles.title}>Sign in</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            data-testid="sign-in-email"
          />
        </label>
        <label style={styles.label}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            data-testid="sign-in-password"
          />
        </label>
        {error ? (
          <p style={styles.error} data-testid="sign-in-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          style={styles.submit}
          data-testid="sign-in-submit"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {extraProviders ? <div style={styles.providers}>{extraProviders}</div> : null}
      <p style={styles.foot}>
        Don't have an account?{' '}
        <a href="/sign-up" data-testid="sign-in-to-sign-up">
          Sign up
        </a>
      </p>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 420,
    margin: '4rem auto',
    padding: '2rem',
    fontFamily: 'system-ui, sans-serif',
  },
  title: { fontSize: '1.5rem', marginBottom: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' },
  input: { padding: '0.5rem 0.75rem', fontSize: '1rem', border: '1px solid #ccc', borderRadius: 6 },
  submit: {
    padding: '0.625rem 0.75rem',
    fontSize: '1rem',
    background: '#111',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  error: { color: '#b00', fontSize: '0.875rem', margin: 0 },
  providers: { marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem' },
  foot: { marginTop: '2rem', fontSize: '0.875rem', color: '#666' },
};
