import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import BottomBar from './BottomBar.svelte';
import { locale } from '../stores/localeStore';

beforeEach(() => locale.set('sv'));
afterEach(cleanup);

describe('BottomBar', () => {
  it('shows arrival time when provided', () => {
    const { getByText } = render(BottomBar, {
      props: {
        arrivalSummary: { time: '08:34', transferSlackMinutes: 2, transferState: 'tight' },
        editing: false,
        onclick: vi.fn(),
        activeRouteDirection: 'toWork'
      }
    });
    expect(getByText('08:34')).toBeTruthy();
    expect(getByText('Ankomst')).toBeTruthy();
    expect(getByText('Tajt byte')).toBeTruthy();
  });

  it('hides arrival row when arrivalTime is null', () => {
    const { queryByText } = render(BottomBar, {
      props: { arrivalSummary: null, editing: false, onclick: vi.fn(), activeRouteDirection: 'toWork' }
    });
    expect(queryByText('Ankomst')).toBeNull();
  });

  it('shows "Spara" when editing', () => {
    const { getByRole } = render(BottomBar, {
      props: { arrivalSummary: null, editing: true, onclick: vi.fn(), activeRouteDirection: 'toWork' }
    });
    expect(getByRole('button').textContent?.trim()).toBe('Spara');
  });

  it('fires onclick when Redigera is clicked', async () => {
    const onclick = vi.fn();
    const { getByRole } = render(BottomBar, {
      props: { arrivalSummary: null, editing: false, onclick, activeRouteDirection: 'toWork' }
    });
    await fireEvent.click(getByRole('button'));
    expect(onclick).toHaveBeenCalledOnce();
  });
});
