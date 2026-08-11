import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import StationNoticeBar from './StationNoticeBar.svelte';

const props = {
  alerts: [{
    id: 'station-alert-1',
    stations: ['Centralen'],
    message: 'Centralen: Hiss avstängd',
    severity: 'warning' as const,
    segmentIds: ['segment-1'],
  }],
  t: {
    sectionStationNotices: 'Stationsinfo',
    stationNoticesToggle: 'Stationsinfo',
    dismissNotice: 'Avfärda',
  },
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('StationNoticeBar layout', () => {
  it('keeps the expanded panel inside the notice surface', async () => {
    const { container, getByRole } = render(StationNoticeBar, { props });
    const notice = container.querySelector('.notice-bar') as HTMLElement;

    await fireEvent.click(getByRole('button', { name: 'Stationsinfo' }));

    const panel = container.querySelector('.notice-panel') as HTMLElement;
    expect(panel.parentElement).toBe(notice);
  });
});
