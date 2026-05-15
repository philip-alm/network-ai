import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const signUpMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({
    auth: { signUp: signUpMock },
  }),
}));

beforeEach(() => {
  signUpMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fillForm(opts: { email: string; password: string; confirm?: string }) {
  const { SignUpScreen } = await import('./SignUpScreen');
  const onSignedUp = vi.fn();
  render(<SignUpScreen onSignedUp={onSignedUp} />);
  fireEvent.change(screen.getByTestId('sign-up-email'), { target: { value: opts.email } });
  fireEvent.change(screen.getByTestId('sign-up-password'), { target: { value: opts.password } });
  fireEvent.change(screen.getByTestId('sign-up-confirm'), {
    target: { value: opts.confirm ?? opts.password },
  });
  return { onSignedUp };
}

describe('SignUpScreen', () => {
  it('rejects mismatching passwords without calling signUp', async () => {
    const { onSignedUp } = await fillForm({
      email: 'a@b.test',
      password: 'pw12345678',
      confirm: 'nope',
    });
    fireEvent.click(screen.getByTestId('sign-up-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sign-up-error').textContent).toMatch(/do not match/i);
      expect(signUpMock).not.toHaveBeenCalled();
      expect(onSignedUp).not.toHaveBeenCalled();
    });
  });

  it('rejects short passwords without calling signUp', async () => {
    const { onSignedUp } = await fillForm({ email: 'a@b.test', password: 'short' });
    fireEvent.click(screen.getByTestId('sign-up-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sign-up-error').textContent).toMatch(/at least 8/i);
      expect(signUpMock).not.toHaveBeenCalled();
      expect(onSignedUp).not.toHaveBeenCalled();
    });
  });

  it('calls onSignedUp when supabase returns a session', async () => {
    signUpMock.mockResolvedValueOnce({ data: { session: { access_token: 't' } }, error: null });
    const { onSignedUp } = await fillForm({ email: 'a@b.test', password: 'pw12345678' });
    fireEvent.click(screen.getByTestId('sign-up-submit'));
    await waitFor(() => expect(onSignedUp).toHaveBeenCalledOnce());
  });

  it('shows an email-confirmation info message when no session is returned', async () => {
    signUpMock.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { onSignedUp } = await fillForm({ email: 'a@b.test', password: 'pw12345678' });
    fireEvent.click(screen.getByTestId('sign-up-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('sign-up-info').textContent).toMatch(/confirmation link/i);
      expect(onSignedUp).not.toHaveBeenCalled();
    });
  });
});
