'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  MessageSquare,
  Search,
  HelpCircle,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAgentLoop, ChatThread } from '../chat';
import { useContacts, ContactsAccordion } from '../contacts';
import { Wordmark } from '../brand';
import { CommandPalette, KeyboardCheatsheet, useGlobalShortcuts } from '../palette';
import { ConversationsSidebar, useConversations } from '../conversations';
import { WithTooltip, Kbd } from '../ui';
import { ThemeToggle } from '../theme';
import { SettingsModal } from '../settings';

export type HomeScreenProps = {
  userId: string;
  userEmail: string;
  onSignOut: () => void;
  /** Optional override for opening settings (lets a shell route somewhere
   *  else). When omitted, the gear opens the SettingsModal in-place. */
  onOpenSettings?: () => void;
  /** Required for the in-place SettingsModal. The shell wires this to the
   *  real account-deletion endpoint. */
  onDeleteAccount?: () => void | Promise<void>;
};

type MobilePane = 'chat' | 'contacts';

const SIDEBAR_STORAGE_KEY = 'reknowable:sidebar-open';

/**
 * HomeScreen — three-pane panel shell:
 *   [ sidebar 180px ] [ chat ~30% ] [ contacts ~70% ]
 *
 * Each pane is its own rounded panel sitting on the page bg with a
 * gap between. No hard divider lines.
 *
 * Sidebar is collapsible; state persists in localStorage. On mobile
 * (< lg), the sidebar hides and the mobile tab toggle swaps between
 * chat and contacts as before.
 */
export function HomeScreen({
  userId,
  userEmail,
  onSignOut,
  onOpenSettings,
  onDeleteAccount,
}: HomeScreenProps) {
  const initialThreadId = useMemo(() => crypto.randomUUID(), []);
  const {
    conversations,
    currentId: threadId,
    newConversation,
    selectConversation,
    removeConversation,
  } = useConversations(initialThreadId);

  const {
    messages,
    send,
    stop,
    isPending,
    error,
    phase,
    retryHint,
    queue,
    popQueueTail,
    pushToQueue,
    removeQueued,
  } = useAgentLoop({
    userId,
    threadId,
  });
  const { contacts, assets } = useContacts({ userId });
  const [mobilePane, setMobilePane] = useState<MobilePane>('chat');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Hydrate sidebar state from localStorage on mount. Default is CLOSED;
  // the sidebar only opens if the user explicitly opened it last time.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (v === 'true') setSidebarOpen(true);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    } catch {
      // ignore
    }
  }, [sidebarOpen]);

  const handlers = useMemo(
    () => ({
      onOpenPalette: () => setPaletteOpen(true),
      onOpenCheatsheet: () => setCheatsheetOpen(true),
    }),
    [],
  );
  useGlobalShortcuts(handlers);

  // ⌘⇧O → new conversation. Matches ChatGPT / Claude's "New chat"
  // shortcut. Browser-safe: ⌘O is "Open file" (rarely used in webapps),
  // and the ⇧ modifier disambiguates so we can preventDefault cleanly.
  // Fires globally, including from inside input fields — Cmd+Shift+O
  // never conflicts with a keystroke a user would intend for an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.shiftKey) return;
      if (e.key.toLowerCase() !== 'o') return;
      e.preventDefault();
      newConversation();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newConversation]);

  // ⌘B → toggle sidebar. Matches VSCode / Cursor / Slack — the modern
  // convention for "show/hide left panel". Skipped when focus is in a
  // text field so ⌘B still works as "bold" inside editors. Also skipped
  // on narrow widths where the sidebar isn't shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      const inField = !!(
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target instanceof HTMLElement && target.isContentEditable))
      );
      if (inField) return;
      e.preventDefault();
      setSidebarOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.classList.add('app-shell-locked');
    return () => {
      document.body.classList.remove('app-shell-locked');
    };
  }, []);

  const handleSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    setSettingsOpen(true);
  }, [onOpenSettings]);

  // ⌘, → open Settings. The standard macOS convention for "app
  // preferences" — works everywhere on the system, advertised here in
  // the gear button's tooltip. Was a lie before: the tooltip claimed
  // the shortcut existed but nothing was listening for it. Fires
  // globally (including inside text fields) since ⌘, is never a
  // keystroke a user would intend for any input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key !== ',') return;
      e.preventDefault();
      handleSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSettings]);

  // Both states keep the same 3-column grid; only the sidebar column
  // width animates between 220px and 0. This lets us CSS-transition
  // grid-template-columns smoothly and avoids the conditional-mount jump
  // that used to make the sidebar appear/disappear in one frame.
  const lgCols = sidebarOpen
    ? 'lg:grid-cols-[220px_minmax(0,3fr)_minmax(0,7fr)]'
    : 'lg:grid-cols-[0px_minmax(0,3fr)_minmax(0,7fr)]';

  return (
    <div className="flex w-screen flex-col overflow-hidden bg-bg" style={{ height: '100dvh' }}>
      <header
        className="relative z-30 flex items-center gap-3 px-4 py-2 sm:px-5"
        style={{ isolation: 'isolate' }}
      >
        <WithTooltip label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut="cmd+B">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            data-testid="sidebar-toggle"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted transition-all duration-[160ms] hover:bg-surface hover:text-fg focus-visible:bg-surface focus-visible:text-fg active:scale-[0.95] lg:inline-flex"
            style={{
              transitionTimingFunction: 'var(--ease-out)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={14} aria-hidden />
            ) : (
              <PanelLeftOpen size={14} aria-hidden />
            )}
          </button>
        </WithTooltip>

        <div className="flex items-baseline gap-2.5">
          <Wordmark tone="header" />
        </div>

        <nav
          className="ml-3 flex items-center gap-0.5 rounded-md bg-surface p-0.5 text-xs lg:hidden"
          role="tablist"
          aria-label="Pane"
        >
          <PaneTab
            label="Chat"
            Icon={MessageSquare}
            selected={mobilePane === 'chat'}
            onClick={() => setMobilePane('chat')}
            testId="mobile-pane-chat"
          />
          <PaneTab
            label="Contacts"
            Icon={Users}
            selected={mobilePane === 'contacts'}
            onClick={() => setMobilePane('contacts')}
            badge={contacts.length > 0 ? contacts.length : undefined}
            testId="mobile-pane-contacts"
          />
        </nav>

        <div
          className="ml-auto flex items-center gap-1.5"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-testid="palette-trigger"
            aria-label="Search your network"
            className="group hidden h-9 min-w-[180px] items-center gap-2.5 rounded-lg bg-surface px-3 text-[13px] text-muted transition-all duration-[160ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.98] sm:inline-flex md:min-w-[240px] lg:min-w-[280px]"
            style={{
              transitionTimingFunction: 'var(--ease-out)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Search size={14} className="text-faint group-hover:text-accent" aria-hidden />
            <span className="flex-1 text-left">
              <span className="hidden md:inline">Search anyone or anything…</span>
              <span className="md:hidden">Search…</span>
            </span>
            <Kbd keys={['cmd', 'K']} size="sm" />
          </button>
          <WithTooltip label="Search" shortcut="cmd+K">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search your network"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted transition-all duration-[160ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.95] sm:hidden"
              style={{
                transitionTimingFunction: 'var(--ease-out)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Search size={15} aria-hidden />
            </button>
          </WithTooltip>
          <span
            className="hidden max-w-[180px] truncate text-[11px] text-faint xl:inline"
            title={userEmail}
          >
            {userEmail}
          </span>
          <WithTooltip label="Keyboard shortcuts" shortcut="?">
            <HeaderIconButton
              onClick={() => setCheatsheetOpen(true)}
              label="Keyboard shortcuts"
              Icon={HelpCircle}
              testId="cheatsheet-trigger"
            />
          </WithTooltip>
          <ThemeToggle />
          <WithTooltip label="Settings" shortcut="cmd+,">
            <HeaderIconButton
              onClick={handleSettings}
              label="Settings"
              Icon={Settings}
              testId="settings-trigger"
            />
          </WithTooltip>
        </div>
      </header>

      <main
        className={`grid min-h-0 flex-1 grid-cols-1 gap-2 px-3 pb-3 sm:gap-2 sm:px-4 sm:pb-4 ${lgCols}`}
        style={{ transition: 'grid-template-columns 260ms var(--ease-out)' }}
      >
        <Pane hideOnMobile>
          <div
            aria-hidden={!sidebarOpen}
            className="flex h-full min-h-0 flex-col"
            style={{
              opacity: sidebarOpen ? 1 : 0,
              pointerEvents: sidebarOpen ? 'auto' : 'none',
              transition: 'opacity 200ms var(--ease-out) ' + (sidebarOpen ? '60ms' : '0ms'),
            }}
          >
            <ConversationsSidebar
              conversations={conversations}
              currentId={threadId}
              onNew={newConversation}
              onSelect={selectConversation}
              onRemove={removeConversation}
            />
          </div>
        </Pane>

        <Pane
          id="pane-chat"
          mobileLabelledBy="mobile-pane-chat"
          visibleOnMobile={mobilePane === 'chat'}
          transparent
        >
          <ChatThread
            messages={messages}
            isPending={isPending}
            error={error}
            onSubmit={send}
            onStop={stop}
            phase={phase}
            retryHint={retryHint}
            queue={queue}
            onRemoveQueued={removeQueued}
            onPopQueueTail={popQueueTail}
            onPushToQueue={pushToQueue}
          />
        </Pane>
        <Pane
          id="pane-contacts"
          mobileLabelledBy="mobile-pane-contacts"
          visibleOnMobile={mobilePane === 'contacts'}
        >
          <ContactsAccordion contacts={contacts} assets={assets} />
        </Pane>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <KeyboardCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
      <SettingsModal
        open={settingsOpen}
        userEmail={userEmail}
        onClose={() => setSettingsOpen(false)}
        onSignOut={onSignOut}
        onDeleteAccount={
          onDeleteAccount ??
          (() => {
            throw new Error('Account deletion is not enabled in this build. Contact support.');
          })
        }
        onOpenCheatsheet={() => setCheatsheetOpen(true)}
      />
    </div>
  );
}

function Pane({
  id,
  mobileLabelledBy,
  visibleOnMobile,
  hideOnMobile,
  transparent,
  children,
}: {
  id?: string;
  mobileLabelledBy?: string;
  /** If set, show on mobile only when true; always show on lg+. */
  visibleOnMobile?: boolean;
  /** If true, never show on mobile; show on lg+. (sidebar). */
  hideOnMobile?: boolean;
  /** If true, no surface bg + no shadow ring — pane blends with page bg. */
  transparent?: boolean;
  children: React.ReactNode;
}) {
  // Compute display classes explicitly to avoid Tailwind `flex`/`hidden`
  // ordering ambiguity that was causing layout weirdness.
  let display: string;
  if (hideOnMobile) {
    display = 'hidden lg:flex';
  } else if (visibleOnMobile === undefined) {
    display = 'flex';
  } else if (visibleOnMobile) {
    display = 'flex';
  } else {
    display = 'hidden lg:flex';
  }
  const surface = transparent ? '' : 'rounded-xl bg-surface shadow-hairline-soft';
  return (
    <div
      id={id}
      role={mobileLabelledBy ? 'tabpanel' : undefined}
      aria-labelledby={mobileLabelledBy}
      className={`${display} min-h-0 flex-col overflow-hidden ${surface}`}
    >
      {children}
    </div>
  );
}

function PaneTab({
  label,
  Icon,
  selected,
  onClick,
  badge,
  testId,
}: {
  label: string;
  Icon: typeof MessageSquare;
  selected: boolean;
  onClick: () => void;
  badge?: number;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-testid={testId}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs tracking-tight transition-all duration-[160ms] active:scale-[0.96] ${
        selected ? 'bg-bg text-fg shadow-hairline-soft' : 'text-muted hover:text-fg'
      }`}
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon size={12} aria-hidden />
      {label}
      {badge != null ? <span className="font-mono text-[10px] text-faint">{badge}</span> : null}
    </button>
  );
}

function HeaderIconButton({
  onClick,
  label,
  Icon,
  testId,
}: {
  onClick: () => void;
  label: string;
  Icon: typeof Settings;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-all duration-[160ms] hover:bg-surface hover:text-fg focus-visible:bg-surface focus-visible:text-fg active:scale-[0.95]"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Icon size={14} aria-hidden />
    </button>
  );
}
