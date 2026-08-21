import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Segment } from '../types/page';

const maplibre = vi.hoisted(() => {
  const mapInstance = {
    addControl: vi.fn(),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    scrollZoom: { enable: vi.fn(), disable: vi.fn() },
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'load') callback();
    }),
    touchZoomRotate: { enable: vi.fn(), disable: vi.fn(), disableRotation: vi.fn() },
    jumpTo: vi.fn(),
    remove: vi.fn(),
    resize: vi.fn(),
  };

  return {
    AttributionControl: vi.fn(),
    Map: vi.fn(function () { return mapInstance; }),
    Marker: vi.fn(function () {
      return {
        remove: vi.fn(),
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      };
    }),
    setWorkerUrl: vi.fn(),
    mapInstance,
  };
});

vi.mock('maplibre-gl', () => maplibre);
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import MapPreview from './MapPreview.svelte';

beforeEach(() => {
  vi.clearAllMocks();
  maplibre.Map.mockImplementation(function () { return maplibre.mapInstance; });
});
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
      container: expect.any(HTMLDivElement),
      dragPan: false,
      scrollZoom: false,
      touchZoomRotate: false,
      doubleClickZoom: false,
      keyboard: false,
    }));
    expect(maplibre.AttributionControl).toHaveBeenCalledWith({ compact: true });
  });

  it('renders labeled stop and user markers at MapLibre longitude-latitude coordinates', async () => {
    render(MapPreview, {
      props: {
        segment,
        userLocation: [59.33, 18.06],
        locationRequestInFlight: false,
        walkingEtaEnabled: false,
        t: { youAreHere: 'You are here' },
      },
    });

    await waitFor(() => expect(maplibre.Marker).toHaveBeenCalledTimes(2));

    const markerOptions = maplibre.Marker.mock.calls as unknown as Array<
      [{ element: HTMLElement }]
    >;
    const markerInstances = maplibre.Marker.mock.results.map((result) => result.value) as Array<{
      setLngLat: ReturnType<typeof vi.fn>;
    }>;

    expect(markerOptions[0][0].element.getAttribute('aria-label')).toBe('You are here');
    expect(markerOptions[0][0].element.querySelector('.nearby-user-marker-dot')).toBeTruthy();
    expect(markerInstances[0].setLngLat).toHaveBeenCalledWith([18.06, 59.33]);
    expect(markerOptions[1][0].element.getAttribute('aria-label')).toBe('Jaktgatan');
    expect(markerOptions[1][0].element.tagName).toBe('DIV');
    expect(markerOptions[1][0].element.getAttribute('role')).toBe('img');
    expect(markerOptions[1][0].element.querySelector('.nearby-stop-marker-dot')).toBeTruthy();
    expect(markerInstances[1].setLngLat).toHaveBeenCalledWith([18.12, 59.31]);
  });

  it('keeps directions available and offers a retry when the map cannot initialize', async () => {
    maplibre.Map.mockImplementationOnce(function () {
      throw new Error('Map unavailable');
    });
    const { getByRole } = render(MapPreview, {
      props: {
        segment,
        userLocation: null,
        locationRequestInFlight: false,
        walkingEtaEnabled: false,
        t: { mapUnavailable: 'Map unavailable.', retry: 'Retry', navigateToStop: 'Navigate to stop' },
      },
    });

    await waitFor(() => expect(getByRole('status').textContent).toContain('Map unavailable.'));
    expect(getByRole('button', { name: 'Navigate to stop' })).toBeTruthy();

    await fireEvent.click(getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(2));
  });

  it('adds the current-location marker when a location arrives after the preview map', async () => {
    const { rerender } = render(MapPreview, {
      props: {
        segment,
        userLocation: null,
        locationRequestInFlight: true,
        walkingEtaEnabled: false,
        t: { youAreHere: 'You are here' },
      },
    });

    await waitFor(() => expect(maplibre.Marker).toHaveBeenCalledTimes(1));
    await rerender({
      segment,
      userLocation: [59.33, 18.06],
      locationRequestInFlight: false,
      walkingEtaEnabled: false,
      t: { youAreHere: 'You are here' },
    });

    await waitFor(() => expect(maplibre.Marker).toHaveBeenCalledTimes(3));
    const markerInstances = maplibre.Marker.mock.results.map((result) => result.value) as Array<{
      setLngLat: ReturnType<typeof vi.fn>;
    }>;
    expect(markerInstances[1].setLngLat).toHaveBeenCalledWith([18.06, 59.33]);
  });

  it('enables pan and zoom only in fullscreen, then restores the stop preview', async () => {
    history.replaceState({}, '', '/');
    const { getByRole } = render(MapPreview, {
      props: {
        segment,
        userLocation: null,
        locationRequestInFlight: false,
        walkingEtaEnabled: false,
        t: {
          expandMap: 'Expand map fullscreen',
          back: 'Back',
          stopLocation: 'Stop location',
        },
      },
    });

    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    await fireEvent.click(getByRole('button', { name: 'Expand map fullscreen' }));

    expect(maplibre.mapInstance.dragPan.enable).toHaveBeenCalledTimes(1);
    expect(maplibre.mapInstance.scrollZoom.enable).toHaveBeenCalledTimes(1);
    expect(maplibre.mapInstance.touchZoomRotate.enable).toHaveBeenCalledTimes(1);
    expect(maplibre.mapInstance.touchZoomRotate.disableRotation).toHaveBeenCalled();

    await fireEvent.click(getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(maplibre.mapInstance.dragPan.disable).toHaveBeenCalled());

    expect(maplibre.mapInstance.scrollZoom.disable).toHaveBeenCalled();
    expect(maplibre.mapInstance.touchZoomRotate.disable).toHaveBeenCalled();
    await waitFor(() => expect(maplibre.mapInstance.jumpTo).toHaveBeenCalledWith({
      center: [18.12, 59.31],
      zoom: 15.5,
    }));
  });

  it('presents fullscreen as a named history-backed view with Back', async () => {
    history.replaceState({}, '', '/');
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

    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    await fireEvent.click(getByRole('button', { name: 'Expand map fullscreen' }));

    expect(getByRole('dialog', { name: 'Stop location' })).toBeTruthy();
    expect(getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Minimize map' })).toBeNull();
    expect(history.state).toMatchObject({ nastaFullscreenView: 'stop-map:segment-1' });
  });
});
