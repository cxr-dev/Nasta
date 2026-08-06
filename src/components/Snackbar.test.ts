import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Snackbar from './Snackbar.svelte';

afterEach(() => cleanup());

describe('Snackbar', () => {
  it('exposes the closing state for the exit transition', () => {
    const { container } = render(Snackbar, {
      props: { message: 'Departure removed', closing: true },
    });

    expect(container.querySelector('.snackbar')?.classList.contains('closing')).toBe(true);
  });

  it('calls the action handler', async () => {
    const onAction = vi.fn();
    const { getByRole } = render(Snackbar, {
      props: { message: 'Departure removed', actionLabel: 'Undo', onAction },
    });

    await getByRole('button', { name: 'Undo' }).click();
    expect(onAction).toHaveBeenCalledOnce();
  });
});
