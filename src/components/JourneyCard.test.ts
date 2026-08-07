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
  });

  it('shows supplied walking and interchange time in the expanded route', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: { ...meta(), connections: [{ beforeLegIndex: 0, kind: 'walk', durationMin: 4 }, { beforeLegIndex: 1, kind: 'transfer', durationMin: 3 }] }, isExpanded: true, now: 1_700_000_000_000 },
    });
    expect(container.querySelectorAll('.connection-row')).toHaveLength(2);
    expect(container.querySelector('.connection-row.walk svg circle')?.getAttribute('cx')).toBe('13');
    expect(container.textContent).toContain('4 min');
  });

  it('folds a facility transfer into the final walking interval', () => {
    const { container } = render(JourneyCard, {
      props: { journeyMeta: { ...meta(), connections: [{ beforeLegIndex: 1, kind: 'transfer', durationMin: 3 }, { beforeLegIndex: 1, kind: 'walk', durationMin: 8, walkDistanceMeters: 727 }] }, isExpanded: true, now: 1_700_000_000_000 },
    });
    expect(container.querySelectorAll('.connection-row')).toHaveLength(1);
    expect(container.textContent).toContain('11 min');
    expect(container.textContent).toContain('727 m');
    expect(container.textContent).not.toContain('byte · 3 min');
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
