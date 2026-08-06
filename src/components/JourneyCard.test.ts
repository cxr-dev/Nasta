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
    totalDurationMin: 7,
    transfers: 0,
    query: { origin: 'Home', destination: 'Work' },
    status,
    updatedAt: 1_700_000_000_000,
  };
}

describe('JourneyCard unified action seam', () => {
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
