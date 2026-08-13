import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import ErrorBoundary from './ErrorBoundary.svelte';

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
});
