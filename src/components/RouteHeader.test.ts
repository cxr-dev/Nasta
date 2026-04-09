import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import RouteHeader from './RouteHeader.svelte';
import type { Route } from '../types/route';
import { locale } from '../stores/localeStore';

beforeEach(() => locale.set('sv'));
afterEach(() => cleanup());

const toWork: Route = {
  id: 'r1', name: 'Till jobbet', direction: 'toWork', segments: []
};
const fromWork: Route = {
  id: 'r2', name: 'Hem', direction: 'fromWork', segments: []
};

describe('RouteHeader', () => {
  it('shows active route label', () => {
    const { getByText } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch: vi.fn() }
    });
    // Component uppercases direction labels via getLabel()
    expect(getByText('TILL JOBBET')).toBeTruthy();
  });

  it('shows inactive route and fires onSwitch on click', async () => {
    const onSwitch = vi.fn();
    const { getByRole } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch }
    });
    // Switch button renders as <span>HEM</span> + <svg chevron>, find by accessible name
    const switchBtn = getByRole('button', { name: /hem/i });
    await fireEvent.click(switchBtn);
    expect(onSwitch).toHaveBeenCalledWith('r2');
  });

  it('shows NÄSTA wordmark', () => {
    const { getByText } = render(RouteHeader, {
      props: { activeRouteId: 'r1', routes: [toWork, fromWork], onSwitch: vi.fn() }
    });
    expect(getByText('NÄSTA')).toBeTruthy();
  });
});
