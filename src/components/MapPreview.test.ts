import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Segment } from '../types/page';

const maplibre = vi.hoisted(() => {
  const mapInstance = {
    addControl: vi.fn(),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'load') callback();
    }),
    touchZoomRotate: { disableRotation: vi.fn() },
    remove: vi.fn(),
    resize: vi.fn(),
  };

  return {
    AttributionControl: vi.fn(),
    Map: vi.fn(function () { return mapInstance; }),
    Marker: vi.fn(function () {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      };
    }),
    setWorkerUrl: vi.fn(),
  };
});

vi.mock('maplibre-gl', () => maplibre);
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import MapPreview from './MapPreview.svelte';

afterEach(() => cleanup());

const segment: Segment = {
  id: 'segment-1',
  line: '6',
  lineName: '6',
  direction: {
    code: 1,
    destination: 'Karolinska institutet',
    stopPointId: 'stop-point-1',
  },
  fromStop: { id: 'from-1', name: 'Jaktgatan', siteId: 'site-1', coord: [59.31, 18.12] },
  toStop: { id: 'to-1', name: 'Karolinska institutet', siteId: 'site-2' },
  transportType: 'bus',
};

describe('MapPreview MapLibre module loading', () => {
  it('initializes a map from a namespace-only MapLibre module', async () => {
    const { container } = render(MapPreview, {
      props: {
        segment,
        userLocation: null,
        locationRequestInFlight: false,
        walkingEtaEnabled: false,
        t: {},
      },
    });

    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));

    expect(container.querySelector('.mini-map')).not.toBeNull();
    expect(maplibre.Map).toHaveBeenCalledWith(expect.objectContaining({
      center: [18.12, 59.31],
      container: container.querySelector('.mini-map'),
    }));
    expect(maplibre.AttributionControl).toHaveBeenCalledWith({ compact: true });
  });

  it('presents fullscreen as a named history-backed view with Back', async () => {
    history.replaceState({}, '', '/');
    const before = history.length;
    const { getByRole, queryByRole } = render(MapPreview, {
      props: {
        segment,
        userLocation: null,
        locationRequestInFlight: false,
        walkingEtaEnabled: false,
        t: {
          expandMap: 'Expand map fullscreen',
          minimizeMap: 'Minimize map',
          back: 'Back',
          stopLocation: 'Stop location',
          navigateToStop: 'Navigate to stop',
        },
      },
    });

    await fireEvent.click(getByRole('button', { name: 'Expand map fullscreen' }));

    expect(getByRole('dialog', { name: 'Stop location' })).toBeTruthy();
    expect(getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Minimize map' })).toBeNull();
    expect(history.length).toBe(before + 1);
  });
});
