import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet, mount, tick, unmount } from 'svelte';
import ErrorBoundary from './ErrorBoundary.svelte';
import ErrorBoundaryEffectFixture from './ErrorBoundaryEffectFixture.svelte';

const children = createRawSnippet(() => ({
  render: () => '<button>Commuter content</button>',
}));

const originalAnimate = Element.prototype.animate;

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ cancel: () => {}, finished: Promise.resolve() }),
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: originalAnimate });
});

describe('ErrorBoundary', () => {
  it('keeps its content after a resource-style window error', async () => {
    const { getByRole } = render(ErrorBoundary, { props: { children } });

    window.dispatchEvent(new Event('error'));
    await tick();

    expect(getByRole('button', { name: 'Commuter content' })).toBeTruthy();
  });

  it('keeps its content after an optional worker error event', async () => {
    const { getByRole } = render(ErrorBoundary, { props: { children } });
    const preventDefault = (event: Event) => event.preventDefault();
    window.addEventListener('error', preventDefault, { once: true });

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('map worker failed') }));
    await tick();

    expect(getByRole('button', { name: 'Commuter content' })).toBeTruthy();
  });

  it('shows the reload fallback for a render error', () => {
    const failingChildren = createRawSnippet(() => ({
      render: () => { throw new Error('render failed'); },
    }));

    const { getByRole } = render(ErrorBoundary, { props: { children: failingChildren } });

    expect(getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(getByRole('button', { name: 'Reload app' })).toBeTruthy();
  });

  it('shows the reload fallback for an effect error', async () => {
    const effectChildren = createRawSnippet(() => ({
      render: () => '<div id="effect-fixture"></div>',
      setup: (anchor) => {
        const fixture = mount(ErrorBoundaryEffectFixture, { target: anchor as HTMLElement });
        return () => unmount(fixture);
      },
    }));

    const { getByRole } = render(ErrorBoundary, { props: { children: effectChildren } });

    await tick();
    expect(getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  });
});
