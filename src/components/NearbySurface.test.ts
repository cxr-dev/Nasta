import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { getSettings, setLocationServicesEnabled } from '../stores/settingsStore.svelte';

const maplibre = vi.hoisted(() => {
  const mapInstance = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    fitBounds: vi.fn(),
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    getContainer: vi.fn(() => document.createElement('div')),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'load') callback();
    }),
    remove: vi.fn(),
  };
  return {
    AttributionControl: vi.fn(),
    Map: vi.fn(function () { return mapInstance; }),
    Marker: vi.fn(function () {
      return {
        getElement: vi.fn(() => document.createElement('button')),
        remove: vi.fn(),
        setLngLat: vi.fn().mockReturnThis(),
        setPopup: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      };
    }),
    Popup: vi.fn(function () { return { setText: vi.fn().mockReturnThis() }; }),
    setWorkerUrl: vi.fn(),
  };
});

const nearbyStops = vi.hoisted(() => vi.fn());
const searchStops = vi.hoisted(() => vi.fn());
const getDepartures = vi.hoisted(() => vi.fn());
const loadGrantedLocation = vi.hoisted(() => vi.fn(async (): Promise<[number, number] | null> => null));
const requestLocation = vi.hoisted(() => vi.fn(async (): Promise<[number, number] | null> => [59.33, 18.06]));
const subscribeToLocation = vi.hoisted(() => vi.fn((listener: (snapshot: unknown) => void) => {
  listener({ position: [59.33, 18.06], accuracy: null, isLoading: false, access: 'granted' });
  return vi.fn();
}));

vi.mock('maplibre-gl', () => maplibre);
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('../providers/init', () => ({ transitService: { getNearbyStops: nearbyStops, searchStops, getDepartures } }));
vi.mock('../services/geo', () => ({
  clearLocationSession: vi.fn(),
  formatDistance: (km: number) => `${Math.round(km * 1000)}m`,
  getWalkingTime: () => 2,
  isDistanceReliable: () => true,
  loadGrantedLocation,
  requestLocation,
  subscribeToLocation,
}));

import NearbySurface from './NearbySurface.svelte';

beforeEach(() => {
  history.replaceState({}, '', '/');
  setLocationServicesEnabled(false);
  nearbyStops.mockResolvedValue([{ id: 'sl:1', name: 'Centralen', coord: [59.33, 18.06], modes: ['metro'], distance: 240, locationType: 'station' }]);
  searchStops.mockResolvedValue([]);
  getDepartures.mockResolvedValue({ departures: [{ id: 'd1', line: 'B', lineName: 'Buss', destination: 'Hässelby', transportMode: 'bus', minutes: 4, scheduledTime: '12:04' }], stopDeviations: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NearbySurface', () => {
  it('keeps the standard page header actions available', () => {
    const onEditToggle = vi.fn();
    const onOpenSettings = vi.fn();
    const { getByRole } = render(NearbySurface, {
      props: { onBack: vi.fn(), onEditToggle, onOpenSettings },
    });

    expect(getByRole('button', { name: /SL map|Railway map/i })).toBeTruthy();
    getByRole('button', { name: /Manage pages/i }).click();
    getByRole('button', { name: /Settings/i }).click();
    expect(onEditToggle).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('explains disabled location services on the map instead of the page header', () => {
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });

    expect(getByRole('status', { name: /Location off|Plats av/i })).toBeTruthy();
    expect(container.querySelector('.live-dot')).toBeNull();
  });

  it('uses a silently loaded location even if the subscription has no initial replay', async () => {
    loadGrantedLocation.mockResolvedValueOnce([59.33, 18.06]);
    subscribeToLocation.mockImplementationOnce(() => vi.fn());
    setLocationServicesEnabled(true);

    const { getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });

    await waitFor(() => expect(getByRole('button', { name: /Centralen/i })).toBeTruthy());
    expect(loadGrantedLocation).toHaveBeenCalledOnce();
  });

  it('renders a location-safe station surface and keeps compact attribution', async () => {
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    await waitFor(() => expect(getByRole('button', { name: /Centralen/i })).toBeTruthy());
    await waitFor(() => expect(maplibre.AttributionControl).toHaveBeenCalledWith({ compact: true }));
    expect(getByRole('application', { name: /map/i })).toBeTruthy();
    expect(getByRole('status', { name: /Your location|Din plats/i })).toBeTruthy();
    expect(container.querySelector('.station-mode svg')).toBeTruthy();
  });

  it('shows that the map is waiting for a location fix', () => {
    subscribeToLocation.mockImplementationOnce((listener: (snapshot: unknown) => void) => {
      listener({ position: null, isLoading: true, access: 'prompt' });
      return vi.fn();
    });
    setLocationServicesEnabled(true);

    const { getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });

    expect(getByRole('status', { name: /Finding your location|Hämtar position/i })).toBeTruthy();
  });

  it('renders a bus icon for nearby stations instead of a text badge', async () => {
    nearbyStops.mockResolvedValueOnce([{ id: 'sl:bus', name: 'Busshållplats', coord: [59.33, 18.06], modes: ['bus'], distance: 240, locationType: 'station' }]);
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });

    await waitFor(() => expect(getByRole('button', { name: /Busshållplats/i })).toBeTruthy());
    expect(container.querySelector('.station-mode')?.textContent?.trim()).toBe('');
    expect(container.querySelector('.station-mode svg path')).toBeTruthy();
  });

  it('renders a boat icon when a nearby stop reports ferry mode', async () => {
    nearbyStops.mockResolvedValueOnce([{ id: 'sl:ferry', name: 'Färjeläget', coord: [59.33, 18.06], modes: ['ferry'], distance: 240, locationType: 'station' }]);
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });

    await waitFor(() => expect(getByRole('button', { name: /Färjeläget/i })).toBeTruthy());
    expect(container.querySelector('.station-mode svg')?.innerHTML).toContain('M20 21c-1.39');
  });

  it('opens a station detail without throwing and shows its map context', async () => {
    setLocationServicesEnabled(true);
    const { container, getByRole, getByText } = render(NearbySurface, { props: { onBack: vi.fn() } });
    const station = await waitFor(() => getByRole('button', { name: /Centralen/i }));
    await fireEvent.click(station);
    await waitFor(() => expect(getByRole('heading', { name: 'Centralen' })).toBeTruthy());
    expect(getByRole('application', { name: /map/i })).toBeTruthy();
    expect(getByText('Hässelby')).toBeTruthy();
    expect(container.querySelector('.mode-badge svg')).toBeTruthy();
    expect(container.querySelector('.departure-line')?.textContent).toBe('B');
  });

  it('normalizes walking-map bounds when the stop is southwest of the user', async () => {
    nearbyStops.mockResolvedValueOnce([{
      id: 'sl:southwest',
      name: 'Södermalm',
      coord: [59.329, 18.059],
      modes: ['metro'],
      distance: 130,
      locationType: 'station',
    }]);
    setLocationServicesEnabled(true);
    const { getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    const station = await waitFor(() => getByRole('button', { name: /Södermalm/i }));
    await fireEvent.click(station);

    await waitFor(() => expect(maplibre.Map.mock.results[0]?.value.fitBounds).toHaveBeenCalled());
    expect(maplibre.Map.mock.results[0].value.fitBounds).toHaveBeenCalledWith(
      [[18.059, 59.329], [18.06, 59.33]],
      { padding: 42, maxZoom: 15.5 },
    );
  });

  it('loads departure previews for searched stations', async () => {
    searchStops.mockResolvedValue([{ id: 'sl:search', name: 'Sök Centralen', coord: [59.33, 18.06], modes: ['metro'], distance: 180, locationType: 'station' }]);
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    const input = getByRole('textbox', { name: /Search stops/i });
    await fireEvent.input(input, { target: { value: 'Central' } });
    await waitFor(() => expect(getByRole('button', { name: /Sök Centralen/i })).toBeTruthy());
    await waitFor(() => expect(container.querySelector('.station-preview:not(.muted)')?.textContent).toContain('Hässelby'));
  });

  it('persists Platstjänster when the utility action is used', async () => {
    const { getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    const action = getByRole('button', { name: /Aktivera plats|Enable location/i });
    await fireEvent.click(action);
    expect(getSettings().locationServicesEnabled).toBe(true);
    expect(requestLocation).toHaveBeenCalledOnce();
  });

  it('keeps the shared setting enabled while explaining missing browser access', () => {
    subscribeToLocation.mockImplementationOnce((listener: (snapshot: unknown) => void) => {
      listener({ position: null, isLoading: false, access: 'denied' });
      return vi.fn();
    });
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    expect(getSettings().locationServicesEnabled).toBe(true);
    expect(getByRole('status', { name: /Location blocked|Platsåtkomst blockerad/i })).toBeTruthy();
    expect(container.querySelector('.location-prompt')?.textContent).toMatch(/Allow location in the browser|Tillåt platsåtkomst/i);
    expect(getByRole('button', { name: /Retry|Try again|Försök igen/i })).toBeTruthy();
  });

  it('explains a blocked browser permission after retry', async () => {
    requestLocation.mockResolvedValueOnce(null);
    subscribeToLocation.mockImplementationOnce((listener: (snapshot: unknown) => void) => {
      listener({ position: null, isLoading: false, access: 'denied' });
      return vi.fn();
    });
    setLocationServicesEnabled(true);
    const { container, getByRole } = render(NearbySurface, { props: { onBack: vi.fn() } });
    await fireEvent.click(getByRole('button', { name: /Retry|Try again|Försök igen/i }));
    expect(container.querySelector('.location-prompt')?.textContent).toMatch(/Allow site in browser settings|Platsåtkomst blockerad/i);
  });

  it('reports a horizontal back gesture without stealing vertical list scrolling', async () => {
    const onSwipeMove = vi.fn();
    const onSwipeEnd = vi.fn();
    const { container } = render(NearbySurface, { props: { onBack: vi.fn(), onSwipeMove, onSwipeEnd } });
    const surface = container.querySelector('.nearby-surface') as HTMLElement;
    await fireEvent.touchStart(surface, { touches: [{ clientX: 180, clientY: 220 }] });
    await fireEvent.touchMove(surface, { touches: [{ clientX: 280, clientY: 224 }] });
    await fireEvent.touchEnd(surface, { changedTouches: [{ clientX: 330, clientY: 224 }] });
    expect(onSwipeMove).toHaveBeenCalled();
    expect(onSwipeEnd).toHaveBeenCalledWith(150, expect.any(Number));
  });
});
