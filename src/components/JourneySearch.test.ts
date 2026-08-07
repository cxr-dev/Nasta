import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup, waitFor } from '@testing-library/svelte';
import JourneySearch from './JourneySearch.svelte';
import { setLocale } from '../stores/localeStore.svelte';

const mockSearchJourneys = vi.fn();
const mockSearchLocations = vi.fn();

vi.mock('../services/journeyService', () => ({
  DEFAULT_JOURNEY_ROUTE_TYPE: 'leasttime',
  searchJourneys: (...args: unknown[]) => mockSearchJourneys(...args),
  searchLocations: (...args: unknown[]) => mockSearchLocations(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  setLocale('sv');
  mockSearchJourneys.mockResolvedValue([]);
  mockSearchLocations.mockResolvedValue([]);
});

describe('JourneySearch', () => {
  it('uses the exact Lucide arrow-down-up swap icon', () => {
    const { container, getByRole } = render(JourneySearch);
    const swapButton = getByRole('button', { name: 'Byt riktning' });
    const icon = swapButton.querySelector('svg');

    expect(container.querySelector('.location-fields')).toBeTruthy();
    expect(container.querySelector('.swap-connector')).toBeTruthy();
    expect(container.querySelector('.connector-line')).toBeNull();
    expect(icon?.getAttribute('width')).toBe('24');
    expect(icon?.getAttribute('height')).toBe('24');
    expect(icon?.innerHTML).toContain('m3 16 4 4 4-4');
    expect(icon?.innerHTML).toContain('M7 20V4');
    expect(icon?.innerHTML).toContain('m21 8-4-4-4 4');
    expect(icon?.innerHTML).toContain('M17 4v16');
  });

  it('swaps the origin and destination fields', async () => {
    const { getByLabelText, getByRole } = render(JourneySearch);
    const origin = getByLabelText('från') as HTMLInputElement;
    const destination = getByLabelText('Till') as HTMLInputElement;

    await fireEvent.input(origin, { target: { value: 'Odenplan' } });
    await fireEvent.input(destination, { target: { value: 'Slussen' } });
    await fireEvent.click(getByRole('button', { name: 'Byt riktning' }));

    expect(origin.value).toBe('Slussen');
    expect(destination.value).toBe('Odenplan');
  });

  it('swaps selected location metadata before submitting the journey', async () => {
    mockSearchLocations.mockImplementation((query: string) => Promise.resolve([{
      id: query,
      name: query,
      detail: 'Stop',
      type: 'stop',
      coord: query === 'Odenplan' ? [59.342, 18.049] : [59.319, 18.071],
    }]));

    const { getByLabelText, getByRole, findByRole } = render(JourneySearch);
    const origin = getByLabelText('från') as HTMLInputElement;
    const destination = getByLabelText('Till') as HTMLInputElement;

    await fireEvent.focus(origin);
    await fireEvent.input(origin, { target: { value: 'Odenplan' } });
    await waitFor(() => expect(mockSearchLocations).toHaveBeenCalled());
    await fireEvent.pointerDown(await findByRole('button', { name: /Odenplan Stop/ }));

    await fireEvent.focus(destination);
    await fireEvent.input(destination, { target: { value: 'Slussen' } });
    await waitFor(() => expect(mockSearchLocations).toHaveBeenCalledWith('Slussen', expect.anything()));
    await fireEvent.pointerDown(await findByRole('button', { name: /Slussen Stop/ }));

    await fireEvent.click(getByRole('button', { name: 'Byt riktning' }));
    expect(origin.value).toBe('Slussen');
    expect(destination.value).toBe('Odenplan');

    await fireEvent.click(getByRole('button', { name: 'Hitta resa' }));
    expect(mockSearchJourneys).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'Slussen',
      dest: 'Odenplan',
      originCoord: [59.319, 18.071],
      destCoord: [59.342, 18.049],
    }));
  });

  it('keeps autocomplete content attached to suggestion identity when results reorder', async () => {
    mockSearchLocations.mockImplementation((query: string) => Promise.resolve(
      query === 'Ab'
        ? [
            { id: 'alpha', name: 'Alpha', detail: 'Stop', type: 'stop' },
            { id: 'beta', name: 'Beta', detail: 'Stop', type: 'stop' },
          ]
        : [
            { id: 'beta', name: 'Beta', detail: 'Stop', type: 'stop' },
            { id: 'alpha', name: 'Alpha', detail: 'Stop', type: 'stop' },
          ],
    ));

    const { container, getByLabelText } = render(JourneySearch);
    const origin = getByLabelText('från') as HTMLInputElement;
    await fireEvent.focus(origin);
    await fireEvent.input(origin, { target: { value: 'Ab' } });
    await waitFor(() => expect(container.querySelectorAll('.suggestion-item')).toHaveLength(2));
    await fireEvent.input(origin, { target: { value: 'Bc' } });
    await waitFor(() => expect(Array.from(container.querySelectorAll('.suggestion-item')).map((item) => item.textContent?.trim())).toEqual(['Beta Stop', 'Alpha Stop']));
  });

  it('sends the selected departure time and advanced options', async () => {
    const { getByLabelText, getByRole, getByText } = render(JourneySearch);
    const origin = getByLabelText('från') as HTMLInputElement;
    const destination = getByLabelText('Till') as HTMLInputElement;

    await fireEvent.input(origin, { target: { value: 'Odenplan' } });
    await fireEvent.input(destination, { target: { value: 'Slussen' } });
    await fireEvent.click(getByRole('radio', { name: 'Avgångstid' }));

    const date = getByLabelText('Datum') as HTMLInputElement;
    const time = getByLabelText('Tid') as HTMLInputElement;
    await fireEvent.input(date, { target: { value: '2026-08-05' } });
    await fireEvent.input(time, { target: { value: '21:00' } });
    await fireEvent.click(getByText('Avancerat'));
    await fireEvent.click(getByRole('button', { name: 'Hitta resa' }));

    expect(mockSearchJourneys).toHaveBeenCalledWith(expect.objectContaining({
      timeMode: 'departure',
      date: '2026-08-05',
      time: '21:00',
      maxChanges: 3,
      routeType: 'leasttime',
    }));
  });

  it('shows refined advanced controls and sends their selected values', async () => {
    const { container, getByLabelText, getByRole, getByText } = render(JourneySearch);
    const origin = getByLabelText('från') as HTMLInputElement;
    const destination = getByLabelText('Till') as HTMLInputElement;

    expect(container.querySelector('#journey-advanced-options')).toBeNull();
    await fireEvent.click(getByRole('button', { name: /Avancerat/ }));
    expect(container.querySelector('#journey-advanced-options')).not.toBeNull();
    expect(getByText(/Alla färdsätt/)).toBeTruthy();

    const modeCheckboxes = container.querySelectorAll('.mode-options input[type="checkbox"]');
    expect(modeCheckboxes).toHaveLength(5);
    await fireEvent.click(modeCheckboxes[0]);
    await fireEvent.click(getByRole('radio', { name: '0' }));
    await fireEvent.click(getByRole('radio', { name: 'Minst gång' }));

    await fireEvent.input(origin, { target: { value: 'Odenplan' } });
    await fireEvent.input(destination, { target: { value: 'Slussen' } });
    await fireEvent.click(getByRole('button', { name: 'Hitta resa' }));

    expect(mockSearchJourneys).toHaveBeenCalledWith(expect.objectContaining({
      transportModes: ['metro', 'train', 'tram', 'boat'],
      maxChanges: 0,
      routeType: 'leastwalking',
    }));
  });
});
