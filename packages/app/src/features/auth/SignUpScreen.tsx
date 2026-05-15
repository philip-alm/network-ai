'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

export type SignUpScreenProps = {
  /** Called after a successful sign-up. Typical: router.push('/'). */
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
      const supabase = getBrowserSupabase();
      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
      if (signUpErr) {
        setError(signUpErr.message);
        return;
      }
      if (data.session) {
        onSignedUp();
      } else {
        // Email confirmation required.
        setInfo(`Check ${email} for a confirmation link.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={styles.shell} data-testid="sign-up-screen">
      <h1 style={styles.title}>Create your account</h1>
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
            data-testid="sign-up-email"
          />
        </label>
        <label style={styles.label}>
          Password (min 8 chars)
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            data-testid="sign-up-password"
          />
        </label>
        <label style={styles.label}>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={styles.input}
            data-testid="sign-up-confirm"
          />
        </label>
        {error ? (
          <p style={styles.error} data-testid="sign-up-error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p style={styles.info} data-testid="sign-up-info" role="status">
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          style={styles.submit}
          data-testid="sign-up-submit"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={styles.foot}>
        Already have an account?{' '}
        <a href="/sign-in" data-testid="sign-up-to-sign-in">
          Sign in
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
  info: { color: '#080', fontSize: '0.875rem', margin: 0 },
  foot: { marginTop: '2rem', fontSize: '0.875rem', color: '#666' },
};
