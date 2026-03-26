import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

afterEach(() => cleanup());
import RouteHeader from './RouteHeader.svelte';
import type { Route } from '../types/route';

const toWork: Route = {
  id: 'r1', name: 'Till jobbet', direction: 'toWork', segments: []
};
const fromWork: Route = {
  id: 'r2', name: 'Hem', direction: 'fromWork', segments: []
};

describe('RouteHeader', () => {
  it('shows active route name large', () => {
    const { getByText } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch: vi.fn() }
    });
    const active = getByText('Till jobbet');
    expect(active.classList.contains('active-name')).toBe(true);
  });

  it('shows inactive route name and fires onSwitch on click', async () => {
    const onSwitch = vi.fn();
    const { getByText } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch }
    });
    const inactive = getByText('Hem →');
    await fireEvent.click(inactive);
    expect(onSwitch).toHaveBeenCalledWith('r2');
  });

  it('shows NÄSTA wordmark', () => {
    const { getByText } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch: vi.fn() }
    });
    expect(getByText('NÄSTA')).toBeTruthy();
  });
});
