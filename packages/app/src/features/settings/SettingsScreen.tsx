'use client';

import { useState } from 'react';
import { ArrowLeft, LogOut, Trash2, KeyRound, Mail } from 'lucide-react';
import { Wordmark } from '../brand';
import { Kbd } from '../ui';

export type SettingsScreenProps = {
  userEmail: string;
  onBack: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void> | void;
  onOpenCheatsheet: () => void;
};

type DeleteState = 'idle' | 'confirming' | 'deleting';

export function SettingsScreen({
  userEmail,
  onBack,
  onSignOut,
  onDeleteAccount,
  onOpenCheatsheet,
}: SettingsScreenProps) {
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    setDeleteError(null);
    setDeleteState('deleting');
    try {
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the account.');
      setDeleteState('confirming');
    }
  };

  return (
    <main
      data-testid="settings-screen"
      className="mx-auto w-full max-w-xl px-6 py-10"
      style={{ minHeight: '100dvh' }}
    >
      <div className="mb-10 flex items-center justify-between">
        <Wordmark tone="header" />
        <button
          type="button"
          onClick={onBack}
          data-testid="settings-back"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors duration-fast hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.98]"
        >
          <ArrowLeft size={12} aria-hidden />
          Back
        </button>
      </div>

      <header className="mb-10 space-y-1.5">
        <h1 className="text-[2rem] font-medium leading-[1.15] tracking-[-0.028em] text-fg">
          Settings.
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Account, shortcuts, and the careful corner.
        </p>
      </header>

      <Section title="Account" icon={Mail}>
        <Row label="Signed in as">
          <span className="font-mono text-sm tracking-tight text-fg">{userEmail}</span>
        </Row>
        <Row label="Session">
          <button
            type="button"
            onClick={onSignOut}
            data-testid="settings-sign-out"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-soft px-2.5 py-1 text-xs font-medium text-fg transition-all duration-fast ease-out-quart hover:bg-surface focus-visible:bg-surface active:scale-[0.98]"
          >
            <LogOut size={12} aria-hidden />
            Sign out
          </button>
        </Row>
      </Section>

      <Section title="Keyboard" icon={KeyRound}>
        <Row label="Shortcuts">
          <button
            type="button"
            onClick={onOpenCheatsheet}
            data-testid="settings-cheatsheet-trigger"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-soft px-2.5 py-1 text-xs font-medium text-fg transition-all duration-fast ease-out-quart hover:bg-surface focus-visible:bg-surface active:scale-[0.98]"
          >
            View all
            <span className="font-mono text-[10px] text-faint">?</span>
          </button>
        </Row>
        <Row label="Quick">
          <span className="inline-flex flex-wrap items-center justify-end gap-2 text-xs text-muted">
            <KbdRow keys={['cmd', 'K']} label="palette" />
            <KbdRow keys={['/']} label="composer" />
            <KbdRow keys={['Esc']} label="close" />
          </span>
        </Row>
      </Section>

      <Section title="Danger zone" icon={Trash2} dangerous>
        <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
          <h3 className="text-sm font-medium tracking-tight text-fg">Delete account</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Permanently removes everyone you've added and everything you've stored. There's no
            recovery and no export today.
          </p>

          {deleteState === 'idle' ? (
            <button
              type="button"
              onClick={() => setDeleteState('confirming')}
              data-testid="settings-delete-account"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-surface-soft px-2.5 py-1 text-xs font-medium text-danger transition-all duration-fast ease-out-quart hover:bg-danger/10 focus-visible:bg-danger/10 active:scale-[0.98]"
            >
              <Trash2 size={12} aria-hidden />
              Delete my account
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-fg">
                Are you sure? Type <span className="font-mono text-danger">delete</span> below to
                confirm.
              </p>
              <DeleteConfirm
                disabled={deleteState === 'deleting'}
                onConfirm={() => void handleDelete()}
                onCancel={() => {
                  setDeleteState('idle');
                  setDeleteError(null);
                }}
              />
              {deleteError ? (
                <p className="text-xs text-danger" role="alert">
                  {deleteError}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Section>

      <footer className="mt-12 border-t border-border-soft pt-6">
        <p className="text-xs text-faint">Reknowable. A second brain for everyone you know.</p>
      </footer>
    </main>
  );
}

function Section({
  title,
  icon: Icon,
  dangerous,
  children,
}: {
  title: string;
  icon: typeof Mail;
  dangerous?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <header className="mb-3 flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
            dangerous ? 'bg-danger/10 text-danger' : 'bg-surface-soft text-muted'
          }`}
          aria-hidden
        >
          <Icon size={12} />
        </span>
        <h2 className="text-sm font-medium tracking-tight text-fg">{title}</h2>
      </header>
      <div className="rounded-lg bg-surface shadow-hairline-soft">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

function KbdRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Kbd keys={keys} size="sm" />
      <span className="text-faint">{label}</span>
    </span>
  );
}

function DeleteConfirm({
  disabled,
  onConfirm,
  onCancel,
}: {
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const canConfirm = value.toLowerCase() === 'delete';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
        placeholder="delete"
        data-testid="settings-delete-confirm-input"
        className="w-32 rounded-md bg-bg px-2.5 py-1 text-xs tracking-tight text-fg shadow-hairline placeholder:text-faint transition-shadow duration-base ease-out-quart focus:shadow-focus focus:outline-none disabled:opacity-50"
        aria-label="Type delete to confirm"
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm || disabled}
        data-testid="settings-delete-confirm"
        className="inline-flex items-center gap-1.5 rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-bg transition-all duration-fast ease-out-quart hover:opacity-90 focus-visible:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
      >
        {disabled ? (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-bg/30 border-t-bg"
            aria-hidden
          />
        ) : null}
        Delete
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted transition-colors duration-fast hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
