import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const signInMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({
    auth: { signInWithPassword: signInMock },
  }),
}));

beforeEach(() => {
  signInMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SignInScreen', () => {
  it('renders email + password inputs and a submit button', async () => {
    const { SignInScreen } = await import('./SignInScreen');
    render(<SignInScreen onSignedIn={() => {}} />);
    expect(screen.getByTestId('sign-in-email')).toBeDefined();
    expect(screen.getByTestId('sign-in-password')).toBeDefined();
    expect(screen.getByTestId('sign-in-submit')).toBeDefined();
  });

  it('calls supabase.auth.signInWithPassword with form values on submit', async () => {
    signInMock.mockResolvedValueOnce({ error: null });
    const onSignedIn = vi.fn();
    const { SignInScreen } = await import('./SignInScreen');
    render(<SignInScreen onSignedIn={onSignedIn} />);

    fireEvent.change(screen.getByTestId('sign-in-email'), { target: { value: 'a@b.test' } });
    fireEvent.change(screen.getByTestId('sign-in-password'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByTestId('sign-in-submit'));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({ email: 'a@b.test', password: 'pw12345678' });
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
  });

  it('surfaces auth errors in the UI without calling onSignedIn', async () => {
    signInMock.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
    const onSignedIn = vi.fn();
    const { SignInScreen } = await import('./SignInScreen');
    render(<SignInScreen onSignedIn={onSignedIn} />);

    fireEvent.change(screen.getByTestId('sign-in-email'), { target: { value: 'a@b.test' } });
    fireEvent.change(screen.getByTestId('sign-in-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('sign-in-submit'));

    await waitFor(() => {
      const errorEl = screen.getByTestId('sign-in-error');
      expect(errorEl.textContent).toBe('Invalid credentials');
      expect(onSignedIn).not.toHaveBeenCalled();
    });
  });

  it('renders a redirectError prop as a banner', async () => {
    const { SignInScreen } = await import('./SignInScreen');
    render(<SignInScreen onSignedIn={() => {}} redirectError="Session expired" />);
    expect(screen.getByTestId('sign-in-error').textContent).toBe('Session expired');
  });
});
