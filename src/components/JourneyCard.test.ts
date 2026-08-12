import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import JourneyCard from './JourneyCard.svelte';
import type { JourneyMeta } from '../types/journey';

afterEach(() => cleanup());

const leg = {
  originName: 'Home',
  destName: 'Work',
  transportType: 'metro' as const,
  line: '17',
  lineName: '17',
  directionCode: 1,
  directionName: 'Hagsätra',
  departureTime: 1_700_000_600_000,
  arrivalTime: 1_700_001_000_000,
  durationMin: 7,
  platformPosition: 'middle' as const,
};

function meta(status: JourneyMeta['status'] = 'planned'): JourneyMeta {
  return {
    journeyId: 'journey-1',
    originLabel: 'Home',
    destLabel: 'Work',
    legs: [leg],
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    totalDurationMin: 7,
    transfers: 0,
    query: { origin: 'Home', destination: 'Work' },
    status,
    updatedAt: 1_700_000_000_000,
  };
}

describe('JourneyCard unified action seam', () => {
  it('keeps the journey summary scannable and semantically expandable', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: meta(), now: 1_700_000_000_000 },
    });
    const summary = container.querySelector<HTMLButtonElement>('.card-main');

    expect(summary?.getAttribute('aria-expanded')).toBe('false');
    expect(summary?.getAttribute('aria-controls')).toMatch(/^journey-details-/);
    expect(container.querySelector('.countdown')).toBeTruthy();
    expect(container.querySelectorAll('.journey-stat')).toHaveLength(2);
    expect(container.querySelector('.journey-summary-top')).toBeTruthy();
    expect(container.querySelector('.journey-summary-bottom')).toBeTruthy();
    expect(container.querySelector('.summary-chevron')).toBeTruthy();
    expect(container.querySelector('.timeline')).toBeNull();
    expect(container.querySelector('.primary-leg')).toBeNull();
    expect(container.textContent).not.toContain('Nästa resa');
  });

  it('renders the expanded journey as an ordered timeline with a Lucide menu icon', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: meta(), isExpanded: true, now: 1_700_000_000_000 },
    });

    expect(container.querySelector('ol.timeline')).toBeTruthy();
    expect(container.querySelector('.detail-title')).toBeNull();
    expect(container.querySelector('.leg-times')).toBeTruthy();
    expect(container.querySelector('.more-actions-button svg')).toBeTruthy();
    expect(container.querySelector('.more-actions-button')?.textContent).not.toContain('•••');
    expect(container.querySelector('[data-testid="journey-route-overview"]')).toBeTruthy();
    expect(container.querySelector('.journey-detail-summary')).toBeTruthy();
  });

  it('focuses a leg and reveals its stops without turning the collapsed card into a timeline', async () => {
    const secondLeg = {
      ...leg,
      originName: 'Work',
      destName: 'Home',
      line: '4',
      lineName: '4',
      departureTime: 1_700_001_060_000,
      arrivalTime: 1_700_001_420_000,
      stops: ['Station A', 'Station B', 'Station C', 'Station D'],
    };
    const journey = {
      ...meta(),
      legs: [leg, secondLeg],
      arrivalTime: secondLeg.arrivalTime,
      totalDurationMin: 14,
      transfers: 1,
    };
    const { container } = render(JourneyCard, {
      props: { journeyMeta: journey, isExpanded: true, now: 1_700_000_000_000 },
    });

    expect(container.querySelectorAll('.leg-select')).toHaveLength(2);
    await fireEvent.click(container.querySelectorAll('.leg-select')[1] as HTMLElement);

    expect(container.querySelectorAll('.leg-row.selected')).toHaveLength(1);
    expect(container.querySelector('.stop-sequence')).toBeTruthy();
    expect(container.textContent).toContain('Station A');
    expect(container.textContent).toContain('Show stops');
  });

  it('shows supplied walking and interchange time in the expanded route', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: { ...meta(), connections: [{ beforeLegIndex: 0, kind: 'walk', durationMin: 4 }, { beforeLegIndex: 1, kind: 'transfer', durationMin: 3 }] }, isExpanded: true, now: 1_700_000_000_000 },
    });
    expect(container.querySelectorAll('.connection-row')).toHaveLength(2);
    expect(container.querySelector('.connection-row.walk svg circle')?.getAttribute('cx')).toBe('13');
    expect(container.textContent).toContain('4 min');
  });

  it('keeps a facility transfer separate from the walk that follows it', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: { ...meta(), connections: [{ beforeLegIndex: 1, kind: 'transfer', durationMin: 3 }, { beforeLegIndex: 1, kind: 'walk', durationMin: 8, walkDistanceMeters: 727 }] }, isExpanded: true, now: 1_700_000_000_000 },
    });
    expect(container.querySelectorAll('.connection-row')).toHaveLength(2);
    expect(container.textContent).toContain('8 min');
    expect(container.textContent).toContain('727 m');
    expect(container.textContent).toContain('3 min');
  });

  it('keeps searched addresses out of vehicle stop instructions', () => {
    const journey = {
      ...meta(),
      originLabel: 'Bobergsgatan',
      destLabel: 'Tegnerlunden 6',
      legs: [{ ...leg, originName: 'Drevergatan', destName: 'Odenplan' }],
      connections: [
        { beforeLegIndex: 0, kind: 'walk' as const, durationMin: 1, walkDistanceMeters: 80, originName: 'Bobergsgatan', destName: 'Drevergatan' },
        { beforeLegIndex: 1, kind: 'walk' as const, durationMin: 7, walkDistanceMeters: 500, originName: 'Odenplan', destName: 'Tegnerlunden 6' },
      ],
    };
    const { container } = render(JourneyCard, {
      props: { journeyMeta: journey, isExpanded: true, now: 1_700_000_000_000 },
    });

    expect(container.querySelectorAll('.connection-row')).toHaveLength(2);
    expect(container.querySelector('.leg-route')?.textContent).toContain('Drevergatan');
    expect(container.querySelector('.leg-route')?.textContent).toContain('Odenplan');
    expect(container.querySelector('.leg-route')?.textContent).not.toContain('Bobergsgatan');
    expect(container.textContent).toContain('80 m');
  });

  it('emits start for a planned journey', async () => {
    const onAction = vi.fn();
    const { container } = render(JourneyCard, {
      props: { journeyMeta: meta(), isExpanded: true, now: 1_700_000_000_000, onAction },
    });

    await fireEvent.click(container.querySelector('.journey-action.primary') as HTMLElement);

    expect(onAction).toHaveBeenCalledWith('start');
  });

  it('emits complete and cancel for an active journey', async () => {
    const onAction = vi.fn();
    const { container } = render(JourneyCard, {
      props: { journeyMeta: meta('active'), isExpanded: true, now: 1_700_000_000_000, onAction },
    });
    const actions = container.querySelectorAll('.journey-action');

    await fireEvent.click(actions[0] as HTMLElement);
    await fireEvent.click(actions[1] as HTMLElement);

    expect(onAction.mock.calls).toEqual([['complete'], ['cancel']]);
  });
});
