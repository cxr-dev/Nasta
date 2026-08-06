import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';

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

  it('uses a stable editorial visual when the current provider has no event image', async () => {
    peekMock.mockImplementation((query: { mode: string }) => query.mode === 'events'
      ? [{ id: 'event-1', name: 'Jazz Night', startTime: '2026-05-28T20:30:00+02:00', location: 'Central', categories: [{ slug: 'music', title: 'Music' }] }]
      : undefined);
    const { container, getByText } = render(FeatureDiscoverySheet, {
      props: { ...props, availableModes: ['events'], defaultMode: 'events' },
    });

    await waitFor(() => expect(getByText('Jazz Night')).toBeTruthy());
    const visual = container.querySelector('.event-visual');
    expect(visual).not.toBeNull();
    const image = visual?.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('');
    expect(image?.getAttribute('width')).toBe('320');
    expect(visual?.textContent).toContain('Editorial image');
  });

  it('keeps an ambiguous family event on the neutral category fallback', async () => {
    peekMock.mockImplementation((query: { mode: string }) => query.mode === 'events'
      ? [{ id: 'event-1', name: 'Museum tour', categories: [{ slug: 'family', title: 'Family' }] }]
      : undefined);
    const { container, getByText } = render(FeatureDiscoverySheet, {
      props: { ...props, availableModes: ['events'], defaultMode: 'events' },
    });

    await waitFor(() => expect(getByText('Museum tour')).toBeTruthy());
    const visual = container.querySelector('.event-visual');
    expect(visual?.querySelector('img')).toBeNull();
    expect(visual?.querySelector('.event-category-tile')).not.toBeNull();
  });

  it('restores the event fallback if a licensed image fails', async () => {
    peekMock.mockImplementation((query: { mode: string }) => query.mode === 'events'
      ? [{
        id: 'event-1',
        name: 'Licensed Jazz Night',
        startTime: '2026-05-28T20:30:00+02:00',
        location: 'Central',
        imageUrl: 'https://images.example.test/event.jpg',
        imageCredit: 'Photo Person',
        imageLicense: 'CC BY 4.0',
      }]
      : undefined);
    const { container, getByText } = render(FeatureDiscoverySheet, {
      props: { ...props, availableModes: ['events'], defaultMode: 'events' },
    });

    await waitFor(() => expect(getByText('Licensed Jazz Night')).toBeTruthy());
    const visual = container.querySelector('.event-visual');
    const image = visual?.querySelector('img');
    expect(image).not.toBeNull();
    await fireEvent.error(image!);
    await waitFor(() => expect(visual?.querySelector('img')).toBeNull());
    expect(visual?.querySelector('.event-category-tile')).not.toBeNull();
  });
});
