import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import DepartureRow from './DepartureRow.svelte';
import type { Departure } from '../types/departure';
import type { Segment } from '../types/page';
import { getT, setLocale } from '../stores/localeStore.svelte';

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

const now = 1_700_000_000_000;

const segment: Segment = {
  id: 'segment-1',
  line: '6',
  lineName: '6',
  direction: {
    code: 1,
    destination: 'Karolinska institutet',
    stopPointId: 'stop-point-1',
  },
  fromStop: { id: 'from-1', name: 'Jaktgatan', siteId: 'site-1' },
  toStop: { id: 'to-1', name: 'Karolinska institutet', siteId: 'site-2' },
  transportType: 'bus',
};

const departure: Departure = {
  line: '6',
  lineName: '6',
  destination: 'Karolinska institutet',
  direction_code: 1,
  minutes: 16,
  time: '18:53',
  expectedAt: now + 16 * 60_000,
  transportType: 'bus',
};

function renderRow(overrides: Record<string, unknown> = {}) {
  return render(DepartureRow, {
    props: {
      segment,
      departure,
      subsequent: '18:53 · 19:03 · 19:15',
      hasDeparture: true,
      primaryDepartureText: '16 min',
      siteDevs: [],
      isExpanded: false,
      isExpandable: true,
      topDevMessage: '',
      topDevType: 'general',
      userLocation: null,
      locationRequestInFlight: false,
      walkingEtaEnabled: false,
      t: getT(),
      now,
      groupingMode: 'station',
      ...overrides,
    },
  });
}

beforeEach(() => setLocale('sv'));
afterEach(() => cleanup());

describe('DepartureRow station grouping C2 layout', () => {
  it('uses destination-first structure and keeps the station name out of the card', () => {
    const { container } = renderRow();
    const card = container.querySelector('.station-card-main');

    expect(card).not.toBeNull();
    expect(card?.querySelector('.station-destination')?.textContent).toContain('Karolinska institutet');
    expect(card?.querySelector('.station-service-identity .stacked-pill')?.textContent).toContain('6');
    expect(card?.querySelector('.station-clock-times')?.textContent).toContain('18:53');
    expect(card?.querySelector('.station-time-rail .countdown-value')?.textContent).toBe('16');
    expect(card?.querySelector('.station-time-rail .countdown-unit')?.textContent).toBe('min');
    expect(card?.querySelector('.station-service-identity')?.parentElement).toBe(card);
    expect(card?.querySelector('.station-clock-times')?.parentElement).toBe(card);
    expect(card?.querySelector('.station-time-rail')?.parentElement).toBe(card);
    expect(card?.textContent).not.toContain('Jaktgatan');
  });

  it('keeps long destinations inside the left content area', () => {
    const longSegment = {
      ...segment,
      direction: {
        ...segment.direction,
        destination: 'Norra Hammarbyhamnen kajplats 形に長い destinations',
      },
    };
    const { container } = renderRow({ segment: longSegment });

    expect(container.querySelector('.station-destination')?.classList.contains('station-destination')).toBe(true);
    expect(container.querySelector('.station-destination')?.textContent).toContain('Norra Hammarbyhamnen');
    expect(container.querySelector('.station-time-rail')).not.toBeNull();
  });

  it.each([
    ['later', '16 min', now + 16 * 60_000, ''],
    ['soon', '3 min', now + 3 * 60_000, 'Snart'],
    ['now', 'Nu', now + 30_000, ''],
  ])('renders the %s countdown state in the rail', (_state, text, expectedAt, label) => {
    const { container } = renderRow({
      departure: { ...departure, expectedAt },
      primaryDepartureText: text,
    });
    const rail = container.querySelector('.station-time-rail');

    expect(rail?.querySelector('[data-testid="countdown-minutes"]')?.textContent).toContain(text);
    expect(rail?.querySelector('.urgency-label')?.textContent ?? '').toContain(label);
    expect(rail?.querySelector('.countdown-unit')?.textContent ?? '').toBe(text.includes('min') ? 'min' : '');
    if (label) {
      expect(rail?.firstElementChild?.classList.contains('urgency-label')).toBe(true);
    }
  });

  it('keeps disruption summaries and the no-departure state in the station structure', () => {
    const { container: disrupted } = renderRow({
      siteDevs: [{ message: 'Påverkad trafik' }],
      severity: 'affected',
      disruptionScope: 'service',
    });
    expect(disrupted.querySelector('.station-disruption-summary')).not.toBeNull();
    expect(disrupted.querySelector('.disrupt-strip')).not.toBeNull();
    expect(disrupted.querySelector('.station-time-rail')?.parentElement).toBe(disrupted.querySelector('.station-card-main'));

    cleanup();

    const { container: empty } = renderRow({
      departure: undefined,
      subsequent: null,
      hasDeparture: false,
      primaryDepartureText: '',
      isExpandable: false,
    });
    expect(empty.querySelector('.station-time-rail .em-dash')?.textContent).toContain('—');
  });
});

describe('DepartureRow non-station layout', () => {
  it('keeps the existing route metadata structure outside station grouping', () => {
    const { container } = renderRow({ groupingMode: 'none' });
    const card = container.querySelector('.card-main');

    expect(card?.classList.contains('station-card-main')).toBe(false);
    expect(card?.querySelector('.route-number')?.textContent).toContain('6');
    expect(card?.querySelector('.from-stop')?.textContent).toContain('Jaktgatan');
    expect(card?.querySelector('.to-dest')?.textContent).toContain('Karolinska institutet');
    expect(card?.querySelector('.station-time-rail')).toBeNull();
  });
});
