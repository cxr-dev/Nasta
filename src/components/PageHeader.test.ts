import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import PageHeader from './PageHeader.svelte';
import type { Page } from '../types/page';
import { getLocale, setLocale } from '../stores/localeStore.svelte';

beforeEach(() => setLocale('sv'));
afterEach(() => cleanup());

const toWork: Page = {
  id: 'r1', name: 'Till jobbet', segments: []
};
const fromWork: Page = {
  id: 'r2', name: 'Hem', segments: []
};

describe('PageHeader', () => {
  it('shows active page name', () => {
    const { getByText } = render(PageHeader, {
      props: { activePageId: 'r1', pages: [toWork, fromWork], onSwitch: vi.fn() }
    });
    expect(getByText('Till jobbet')).toBeTruthy();
  });

  it('switches to next page on click', async () => {
    const onSwitch = vi.fn();
    const { getByRole } = render(PageHeader, {
      props: { activePageId: 'r1', pages: [toWork, fromWork], onSwitch }
    });
    const switchBtn = getByRole('button', { name: /nästa sida/i });
    await fireEvent.click(switchBtn);
    expect(onSwitch).toHaveBeenCalledWith('r2');
  });

  it('does not show NÄSTA wordmark or clock', () => {
    const { queryByText } = render(PageHeader, {
      props: { activePageId: 'r1', pages: [toWork, fromWork], onSwitch: vi.fn() }
    });
    expect(queryByText('NÄSTA')).toBeNull();
  });
});
