/**
 * Smoke tests for the Markdown component's URL handling:
 *   - contact: / asset: protocols route to MentionPill
 *   - http/mailto/tel/#hash/relative — pass through as regular links
 *   - javascript: / data: / file: — stripped (sanitizer)
 *
 * MentionPill now uses `useNavigateToRow` (which handles fetch-on-miss
 * for unloaded ids, view-toggle if needed, and the virtualizer scroll
 * for off-screen rows). We mock that hook directly — the underlying
 * store + Supabase paths don't need to be exercised here.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Markdown } from './Markdown';

const navigateSpy = vi.fn();

vi.mock('../contacts/useNavigateToRow', () => ({
  useNavigateToRow: () => navigateSpy,
}));

beforeEach(() => {
  navigateSpy.mockReset();
});

describe('Markdown · mention links', () => {
  it('renders [Name](contact:uuid) as a clickable mention that calls jumpTo', () => {
    render(
      <Markdown text="Talk to [Viktor Nord](contact:6b0f4f80-aaaa-bbbb-cccc-dddddddddddd) today." />,
    );
    const pill = screen.getByTestId('mention-contact-6b0f4f80-aaaa-bbbb-cccc-dddddddddddd');
    expect(pill.textContent).toContain('Viktor Nord');
    fireEvent.click(pill);
    expect(navigateSpy).toHaveBeenCalledWith('contact', '6b0f4f80-aaaa-bbbb-cccc-dddddddddddd');
  });

  it('renders [Name](asset:uuid) as an asset mention', () => {
    render(
      <Markdown text="The [Podcast setup](asset:9c7a1e22-1111-2222-3333-444444444444) is free." />,
    );
    const pill = screen.getByTestId('mention-asset-9c7a1e22-1111-2222-3333-444444444444');
    expect(pill.textContent).toContain('Podcast setup');
  });

  it('leaves regular external links alone', () => {
    render(<Markdown text="Check [the site](https://example.com) for details." />);
    const link = screen.getByText('the site') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.href).toBe('https://example.com/');
    expect(link.target).toBe('_blank');
  });

  it('strips javascript: and data: schemes (security)', () => {
    render(<Markdown text="bad [link1](javascript:alert(1)) bad [link2](data:text/html,xss)" />);
    const link1 = screen.getByText('link1') as HTMLAnchorElement;
    const link2 = screen.getByText('link2') as HTMLAnchorElement;
    expect(link1.getAttribute('href')).toBe('');
    expect(link2.getAttribute('href')).toBe('');
  });
});
