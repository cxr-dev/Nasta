import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

vi.mock('gsap', () => ({
  default: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

const children = createRawSnippet(() => ({
  render: () => '<button>Action</button>',
}));

afterEach(() => cleanup());

function renderSheet(props: Record<string, unknown> = {}) {
  return render(Sheet, {
    props: {
      isOpen: true,
      onClose: vi.fn(),
      title: 'Test',
      closeAriaLabel: 'Close',
      children,
      ...props,
    },
  });
}

describe('Sheet portal', () => {
  it('keeps a sheet-mode overlay within its original parent (not portaled)', () => {
    const { container } = renderSheet({ mode: 'sheet' });
    const overlay = container.querySelector('.sheet-overlay') as HTMLElement;
    // The overlay is not portaled — it stays inside the testing-library container.
    expect(overlay.parentNode).toBe(container);
    expect(document.body.contains(overlay)).toBe(true);
  });

  it('portals a popover-mode overlay to document.body, escaping a transformed ancestor', async () => {
    const { container } = renderSheet({ mode: 'popover', anchor: document.createElement('button') });
    // The move is deferred until the node connects; flush the microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const overlay = document.body.querySelector('.sheet-overlay') as HTMLElement;
    // The popover overlay is moved to document.body.
    expect(overlay).not.toBeNull();
    expect(overlay.parentNode).toBe(document.body);
    expect(container.querySelector('.sheet-overlay')).toBeNull();
  });

  it('restores the overlay to its original parent when mode switches away from popover', async () => {
    const { container, rerender } = renderSheet({ mode: 'popover' });
    // The move is deferred until the node connects; flush the microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const overlay = document.body.querySelector('.sheet-overlay') as HTMLElement;
    expect(overlay.parentNode).toBe(document.body);

    // Switch to sheet mode; the overlay should return to the container.
    await rerender({ mode: 'sheet' });

    const restored = container.querySelector('.sheet-overlay') as HTMLElement;
    expect(restored.parentNode).toBe(container);
    expect(document.body.contains(restored)).toBe(true);
  });

  it('removes the portaled overlay from the DOM on unmount', async () => {
    const { unmount } = renderSheet({ mode: 'popover' });
    // The move is deferred until the node connects; flush the microtask.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.querySelector('.sheet-overlay')).not.toBeNull();

    unmount();
    expect(document.body.querySelector('.sheet-overlay')).toBeNull();
  });
});