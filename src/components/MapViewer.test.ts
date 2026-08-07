import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { setLocale } from '../stores/localeStore.svelte';
import MapViewer from './MapViewer.svelte';

beforeEach(() => {
  setLocale('en');
  history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapViewer full-screen navigation', () => {
  it('uses a focused Back control and creates one history entry', async () => {
    const before = history.length;
    const { getByRole, queryByRole } = render(MapViewer, {
      props: {
        isOpen: true,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        mapSrc: '/SL_railway_map.svg',
      },
    });

    const back = getByRole('button', { name: 'Back' });
    expect(queryByRole('button', { name: 'Close map' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(history.length).toBe(before + 1);
  });

  it('routes Escape through browser Back', async () => {
    const browserBack = vi.spyOn(history, 'back').mockImplementation(() => {});
    const { getByRole } = render(MapViewer, {
      props: {
        isOpen: true,
        onOpen: vi.fn(),
        onClose: vi.fn(),
        mapSrc: '/SL_railway_map.svg',
      },
    });

    await fireEvent.keyDown(getByRole('dialog', { name: 'Railway map' }), { key: 'Escape' });
    expect(browserBack).toHaveBeenCalledOnce();
  });
});
