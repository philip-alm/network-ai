'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, LogOut, Trash2, KeyRound, Mail, AlertTriangle, ChevronRight } from 'lucide-react';
import { Kbd, parseShortcut } from '../ui';

export type SettingsModalProps = {
  open: boolean;
  userEmail: string;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
  onOpenCheatsheet: () => void;
};

type DeleteState = 'idle' | 'confirming' | 'deleting';

/**
 * SettingsModal — settings live in a centered modal, not a page.
 *
 * Layout language: full-width clickable rows with consistent height
 * (h-12) and big hit targets. Each row reads left → right: icon, label,
 * trailing affordance (value, action, or chevron). The whole row is
 * the click target, not a tiny pill at the end.
 *
 * Esc / backdrop click closes.
 */
export function SettingsModal({
  open,
  userEmail,
  onClose,
  onSignOut,
  onDeleteAccount,
  onOpenCheatsheet,
}: SettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset delete state when the modal closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setDeleteState('idle');
      setDeleteError(null);
    }
  }, [open]);

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

  const body = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="settings-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/60 px-4 py-10 backdrop-blur-sm"
          onClick={onClose}
          data-testid="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
        >
          <motion.div
            key="settings-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-xl bg-surface"
            style={{
              boxShadow: '0 0 0 1px var(--color-border), 0 24px 60px -20px oklch(0% 0 0 / 0.55)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4">
              <div>
                <h2 className="text-base font-medium tracking-tight text-fg">Settings</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Account, shortcuts, and the careful corner.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                data-testid="settings-close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-faint transition-all duration-[140ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.92]"
                style={{
                  transitionTimingFunction: 'var(--ease-out)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 pb-5">
              <Section title="Account">
                <InfoRow Icon={Mail} iconClass="text-accent" label="Signed in as">
                  <span className="truncate font-mono text-[12.5px] tracking-tight text-fg">
                    {userEmail}
                  </span>
                </InfoRow>
                <ActionRow
                  Icon={LogOut}
                  iconClass="text-muted"
                  label="Sign out"
                  hint="End this session on this device."
                  onClick={() => void onSignOut()}
                  testId="settings-sign-out"
                />
              </Section>

              <Section title="Keyboard">
                <ActionRow
                  Icon={KeyRound}
                  iconClass="text-muted"
                  label="All shortcuts"
                  hint="Composer, navigation, and more."
                  shortcut="?"
                  onClick={() => {
                    onClose();
                    onOpenCheatsheet();
                  }}
                  testId="settings-cheatsheet-trigger"
                />
              </Section>

              <Section title="Danger zone">
                {deleteState === 'idle' ? (
                  <ActionRow
                    Icon={Trash2}
                    iconClass="text-danger"
                    label="Delete account"
                    hint="Permanently removes everyone and everything."
                    onClick={() => setDeleteState('confirming')}
                    danger
                    testId="settings-delete-account"
                  />
                ) : (
                  <div
                    className="rounded-lg border p-4"
                    style={{
                      borderColor: 'color-mix(in oklch, var(--color-danger) 25%, transparent)',
                      background: 'color-mix(in oklch, var(--color-danger) 5%, transparent)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        size={14}
                        aria-hidden
                        className="mt-0.5 shrink-0 text-danger"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight text-fg">
                          Delete account
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          Permanently removes everyone you've added and everything you've stored.
                          There's no recovery and no export today.
                        </p>
                        <p className="mt-3 text-xs text-fg">
                          Type <span className="font-mono text-danger">delete</span> to confirm.
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
                          <p className="mt-2 text-xs text-danger" role="alert">
                            {deleteError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(body, document.body);
}

/** Section header + content stack. Sections are separated by a gap, not
 *  a divider, so the rows themselves carry the visual weight. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-2">
      <h3 className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

/**
 * InfoRow — a read-only row showing a labeled value. Same shape as
 * ActionRow but doesn't act on click. Used for "Signed in as".
 */
function InfoRow({
  Icon,
  iconClass,
  label,
  children,
}: {
  Icon: typeof Mail;
  iconClass: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-lg bg-surface-soft px-3">
      <Icon size={14} aria-hidden className={`shrink-0 ${iconClass}`} />
      <span className="text-[13px] text-muted">{label}</span>
      <span className="ml-auto inline-flex min-w-0 items-center">{children}</span>
    </div>
  );
}

/**
 * ActionRow — a full-width clickable row. The WHOLE row is the click
 * target. Trailing affordance: optional keyboard shortcut hint + chevron.
 */
function ActionRow({
  Icon,
  iconClass,
  label,
  hint,
  shortcut,
  onClick,
  danger,
  testId,
}: {
  Icon: typeof Mail;
  iconClass: string;
  label: string;
  hint?: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`group flex h-12 items-center gap-3 rounded-lg bg-surface-soft px-3 text-left transition-all duration-[140ms] active:scale-[0.997] ${
        danger ? 'hover:bg-danger/10 focus-visible:bg-danger/10' : 'hover:bg-bg focus-visible:bg-bg'
      }`}
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon size={14} aria-hidden className={`shrink-0 ${iconClass}`} />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] font-medium ${danger ? 'text-danger' : 'text-fg'}`}
        >
          {label}
        </span>
        {hint ? <span className="block truncate text-[11.5px] text-muted">{hint}</span> : null}
      </span>
      {shortcut ? <Kbd keys={parseShortcut(shortcut)} size="sm" /> : null}
      <ChevronRight
        size={13}
        aria-hidden
        className={`shrink-0 transition-transform duration-[160ms] group-hover:translate-x-0.5 ${
          danger ? 'text-danger/60' : 'text-faint'
        }`}
      />
    </button>
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
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
        placeholder="delete"
        data-testid="settings-delete-confirm-input"
        className="h-9 w-32 rounded-md bg-bg px-3 text-[13px] tracking-tight text-fg shadow-hairline placeholder:text-faint transition-shadow duration-[180ms] focus:shadow-focus focus:outline-none disabled:opacity-50"
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
        aria-label="Type delete to confirm"
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm || disabled}
        data-testid="settings-delete-confirm"
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-danger px-3 text-[13px] font-medium text-bg transition-all duration-[140ms] hover:opacity-90 focus-visible:opacity-90 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      >
        {disabled ? (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-bg/30 border-t-bg"
            aria-hidden
          />
        ) : null}
        Delete account
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="inline-flex h-9 items-center rounded-md px-3 text-[13px] text-muted transition-all duration-[140ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.96] disabled:opacity-50"
        style={{ transitionTimingFunction: 'var(--ease-out)' }}
      >
        Cancel
      </button>
    </div>
  );
}
