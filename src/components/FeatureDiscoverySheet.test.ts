import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

const { loadMock, peekMock, prefetchMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  peekMock: vi.fn(),
  prefetchMock: vi.fn(async () => {}),
}));

vi.mock('../services/featureDiscoverySession', () => ({
  loadFeatureDiscovery: loadMock,
  peekFeatureDiscovery: peekMock,
  prefetchFeatureDiscovery: prefetchMock,
}));

import FeatureDiscoverySheet from './FeatureDiscoverySheet.svelte';

afterEach(() => cleanup());

const props = {
  lat: 59.33,
  lon: 18.06,
  availableModes: ['beer'] as Array<'beer' | 'wineCocktail' | 'events'>,
  defaultMode: 'beer' as const,
};

describe('FeatureDiscoverySheet shared session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    peekMock.mockReturnValue(undefined);
    loadMock.mockResolvedValue([]);
  });

  it('renders prefetched data immediately without a loading skeleton', () => {
    peekMock.mockImplementation((query: { mode: string }) => query.mode === 'beer'
      ? [{ id: 'venue-1', name: 'Cached Pub', lat: 59.33, lon: 18.06 }]
      : undefined);
    const { getByText, container } = render(FeatureDiscoverySheet, { props });

    expect(getByText('Cached Pub')).toBeTruthy();
    expect(container.querySelector('.skeleton-list')).toBeNull();
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('loads without a component abort signal and ignores completion after unmount', async () => {
    let resolve: ((value: unknown[]) => void) | undefined;
    loadMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(FeatureDiscoverySheet, { props });
    await Promise.resolve();

    cleanup();
    resolve?.([]);
    await Promise.resolve();

    expect(loadMock).toHaveBeenCalledWith({ lat: 59.33, lon: 18.06, mode: 'beer' });
    expect(prefetchMock).not.toHaveBeenCalled();
  });
});
