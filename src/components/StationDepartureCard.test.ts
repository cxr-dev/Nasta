import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import StationDepartureCard from './StationDepartureCard.svelte';

afterEach(() => cleanup());

describe('StationDepartureCard', () => {
  const props = {
    destination: 'Norra Hammarbyhamnen kajplats 形に長い destinations',
    line: '4',
    transportType: 'bus' as const,
    scheduledTime: '12:04',
    countdown: '4 min',
  };

  it('renders the destination-led station card with a split countdown', () => {
    const { container } = render(StationDepartureCard, { props });

    expect(container.querySelector('.station-destination')?.textContent).toContain('Norra Hammarbyhamnen');
    expect(container.querySelector('.station-service-identity .stacked-pill')?.textContent).toBe('4');
    expect(container.querySelector('.station-time-rail .countdown-value')?.textContent).toBe('4');
    expect(container.querySelector('.station-time-rail .countdown-unit')?.textContent).toBe('min');
    expect(container.querySelector('.station-clock-times')?.textContent).toBe('12:04');
  });

  it('renders an arriving-now state and transport icon', () => {
    const { container } = render(StationDepartureCard, { props: { ...props, countdown: 'Nu', isArrivingNow: true } });

    expect(container.querySelector('.icon-badge svg')).toBeTruthy();
    expect(container.querySelector('.countdown.arriving-now')?.textContent).toBe('Nu');
  });

  it('uses a compact departure preview without adding a nested card frame', () => {
    const { container } = render(StationDepartureCard, { props: { ...props, variant: 'preview' } });

    expect(container.querySelector('.departure-preview .preview-line')?.textContent).toBe('4');
    expect(container.querySelector('.departure-preview .preview-destination')?.textContent).toContain('Norra Hammarbyhamnen');
    expect(container.querySelector('.departure-preview .preview-countdown')?.textContent).toBe('4 min');
  });
});
