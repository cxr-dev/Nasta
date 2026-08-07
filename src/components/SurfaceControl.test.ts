import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import SurfaceControl from './SurfaceControl.svelte';

afterEach(() => cleanup());

describe('SurfaceControl', () => {
  it('renders a canonical 44px close control with an accessible label', async () => {
    const onclick = vi.fn();
    const { getByRole } = render(SurfaceControl, {
      props: { kind: 'close', label: 'Close settings', onclick },
    });

    const button = getByRole('button', { name: 'Close settings' });
    expect(button.classList.contains('surface-control')).toBe(true);
    expect(button.hasAttribute('data-surface-control')).toBe(true);
    expect(button.querySelector('path')?.getAttribute('d')).toBe('M6 6l12 12M18 6 6 18');

    await button.click();
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('renders the canonical back chevron with the overlay tone', () => {
    const { getByRole } = render(SurfaceControl, {
      props: { kind: 'back', label: 'Back', tone: 'overlay', onclick: vi.fn() },
    });

    const button = getByRole('button', { name: 'Back' });
    expect(button.classList.contains('overlay')).toBe(true);
    expect(button.querySelector('path')?.getAttribute('d')).toBe('m15 18-6-6 6-6');
  });
});
