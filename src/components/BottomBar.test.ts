import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import BottomBar from './BottomBar.svelte';

afterEach(cleanup);

describe('BottomBar', () => {
  it('shows arrival time when provided', () => {
    const { getByText } = render(BottomBar, {
      props: { arrivalTime: '08:34', editing: false, onclick: vi.fn(), activeRouteDirection: 'toWork' }
    });
    expect(getByText('08:34')).toBeTruthy();
    expect(getByText('Anländer')).toBeTruthy();
  });

  it('hides arrival row when arrivalTime is null', () => {
    const { queryByText } = render(BottomBar, {
      props: { arrivalTime: null, editing: false, onclick: vi.fn(), activeRouteDirection: 'toWork' }
    });
    expect(queryByText('Anländer')).toBeNull();
  });

  it('shows "Klar" when editing', () => {
    const { getByRole } = render(BottomBar, {
      props: { arrivalTime: null, editing: true, onclick: vi.fn(), activeRouteDirection: 'toWork' }
    });
    expect(getByRole('button').textContent).toBe('Klar');
  });

  it('fires onclick when Redigera is clicked', async () => {
    const onclick = vi.fn();
    const { getByRole } = render(BottomBar, {
      props: { arrivalTime: null, editing: false, onclick, activeRouteDirection: 'toWork' }
    });
    await fireEvent.click(getByRole('button'));
    expect(onclick).toHaveBeenCalledOnce();
  });
});
