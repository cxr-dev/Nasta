import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import AddExperience from './AddExperience.svelte';
import { mapPinIcon, routeIcon } from '../icons/departureIcons';
import { setLocale } from '../stores/localeStore.svelte';

afterEach(cleanup);
beforeEach(() => setLocale('sv'));

const props = () => ({
  idPrefix: 'test-add',
  onClose: vi.fn(),
  onStopSelect: vi.fn(),
  onJourneySelect: vi.fn(),
});

describe('AddExperience', () => {
  it('renders the shared title row, close button, and exact Lucide icons', () => {
    const { container, getByRole } = render(AddExperience, { props: props() });

    expect(container.querySelector('[data-testid="add-experience"]')).toBeTruthy();
    expect(container.querySelector('.add-experience-title')?.textContent?.trim()).toBe('+ Lägg till');
    expect(getByRole('button', { name: 'Stäng panel' })).toBeTruthy();
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.querySelector('.add-experience-tab:nth-child(1) svg')?.innerHTML).toContain('M20 10c0 4.993-5.539 10.193-7.399 11.799');
    expect(container.querySelector('.add-experience-tab:nth-child(1) svg circle')?.outerHTML).toContain('cx="12" cy="10" r="3"');
    expect(container.querySelector('.add-experience-tab:nth-child(2) svg')?.innerHTML).toContain('M9 19h8.5a3.5 3.5 0 0 0 0-7');
    expect(container.querySelector('.add-experience-tab:nth-child(2) svg circle')?.outerHTML).toContain('cx="6" cy="19" r="3"');
    expect(mapPinIcon).toContain('M20 10c0 4.993-5.539 10.193-7.399 11.799');
    expect(routeIcon).toContain('M9 19h8.5a3.5 3.5 0 0 0 0-7');
  });

  it('selects Hållplats by default and switches accessible panels without destroying them', async () => {
    const { container, getByRole } = render(AddExperience, { props: props() });
    const stopTab = getByRole('tab', { name: 'Hållplats' });
    const routeTab = getByRole('tab', { name: 'Resa' });

    expect(stopTab.getAttribute('aria-selected')).toBe('true');
    expect(routeTab.getAttribute('aria-selected')).toBe('false');
    expect(container.querySelector('#test-add-stop-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('#test-add-route-panel')?.hasAttribute('hidden')).toBe(true);

    await fireEvent.click(routeTab);
    expect(routeTab.getAttribute('aria-selected')).toBe('true');
    expect(stopTab.getAttribute('aria-selected')).toBe('false');
    expect(container.querySelector('#test-add-stop-panel')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#test-add-route-panel')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelectorAll('.add-experience-panel')).toHaveLength(2);
  });

  it('uses the same selector structure for embedded mode and calls close', async () => {
    const componentProps = props();
    const { container, getByRole } = render(AddExperience, {
      props: { ...componentProps, idPrefix: 'embedded-add', variant: 'embedded', closeAriaLabel: 'Avbryt' },
    });

    expect(container.querySelector('.add-experience.embedded')).toBeTruthy();
    expect(container.querySelectorAll('.add-experience-tab')).toHaveLength(2);
    await fireEvent.click(getByRole('button', { name: 'Avbryt' }));
    expect(componentProps.onClose).toHaveBeenCalledOnce();
  });
});
