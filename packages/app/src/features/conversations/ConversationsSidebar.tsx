'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X } from 'lucide-react';
import { WithTooltip, Kbd } from '../ui';
import type { Conversation } from './useConversations';

export type ConversationsSidebarProps = {
  conversations: Conversation[];
  currentId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

type Group = { label: string; items: Conversation[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function groupByRecency(now: number, items: Conversation[]): Group[] {
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const earlier: Conversation[] = [];
  for (const c of items) {
    const age = now - c.lastMessageAt;
    if (age < DAY_MS) today.push(c);
    else if (age < DAY_MS * 2) yesterday.push(c);
    else earlier.push(c);
  }
  const groups: Group[] = [];
  if (today.length) groups.push({ label: 'Today', items: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', items: yesterday });
  if (earlier.length) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

/**
 * ConversationsSidebar — left rail showing previous chat sessions.
 * Refined for tight 180px width: no per-row icons, sentence-case group
 * labels, clean hover/selected states.
 */
export function ConversationsSidebar({
  conversations,
  currentId,
  onNew,
  onSelect,
  onRemove,
}: ConversationsSidebarProps) {
  const groups = useMemo(() => groupByRecency(Date.now(), conversations), [conversations]);

  return (
    <aside data-testid="conversations-sidebar" className="flex h-full min-h-0 flex-col p-2">
      <button
        type="button"
        onClick={onNew}
        data-testid="new-conversation"
        className="group inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium text-fg transition-all duration-[160ms] hover:bg-bg focus-visible:bg-bg active:scale-[0.98]"
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Plus size={13} aria-hidden className="text-muted group-hover:text-accent" />
        <span className="flex-1 text-left">New chat</span>
        <Kbd keys={['cmd', 'shift', 'O']} size="sm" />
      </button>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-2">
        {groups.length === 0 ? (
          <EmptySidebar />
        ) : (
          groups.map((group, i) => (
            <ConversationGroup
              key={group.label}
              label={group.label}
              items={group.items}
              currentId={currentId}
              onSelect={onSelect}
              onRemove={onRemove}
              first={i === 0}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function ConversationGroup({
  label,
  items,
  currentId,
  onSelect,
  onRemove,
  first,
}: {
  label: string;
  items: Conversation[];
  currentId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  first?: boolean;
}) {
  return (
    <section className={first ? '' : 'mt-4'}>
      <h3 className="px-2 pb-1 text-[11px] font-medium text-faint">{label}</h3>
      <ul className="space-y-px">
        <AnimatePresence initial={false}>
          {items.map((c) => (
            <motion.li
              key={c.id}
              layout="position"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              <ConversationRow
                conversation={c}
                selected={c.id === currentId}
                onSelect={() => onSelect(c.id)}
                onRemove={() => onRemove(c.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  onRemove,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group relative flex items-center rounded-md transition-colors duration-[140ms] ${
        selected ? 'bg-bg' : 'hover:bg-bg/60 focus-within:bg-bg/60'
      }`}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        data-testid={`conversation-${conversation.id}`}
        className="flex min-w-0 flex-1 items-center rounded-md px-2 py-1.5 text-left text-[12.5px] active:scale-[0.995]"
        style={{
          transition: 'transform 160ms var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span className={`truncate ${selected ? 'font-medium text-fg' : 'text-muted'}`}>
          {conversation.title}
        </span>
      </button>
      <WithTooltip label="Delete chat">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Delete chat"
          className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-faint opacity-0 transition-all duration-[140ms] hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 active:scale-[0.9]"
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <X size={11} aria-hidden />
        </button>
      </WithTooltip>
    </div>
  );
}

function EmptySidebar() {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-10 text-center">
      <p className="text-xs text-faint">No conversations yet.</p>
    </div>
  );
}
