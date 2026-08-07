import { afterEach, describe, expect, it } from 'vitest';
import { focusBoundary } from './focusBoundary';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusBoundary', () => {
  it('contains focus, skips hidden descendants, and restores the opener', async () => {
    document.body.innerHTML = `
      <button id="opener">Open</button>
      <div id="boundary">
        <button id="first">First</button>
        <div hidden><button id="hidden">Hidden</button></div>
        <button id="last">Last</button>
      </div>
      <button id="outside">Outside</button>
    `;
    const opener = document.querySelector<HTMLButtonElement>('#opener')!;
    const boundary = document.querySelector<HTMLElement>('#boundary')!;
    const first = document.querySelector<HTMLButtonElement>('#first')!;
    const last = document.querySelector<HTMLButtonElement>('#last')!;
    const outside = document.querySelector<HTMLButtonElement>('#outside')!;
    opener.focus();

    const action = focusBoundary(boundary, { active: true, initialFocus: '#first' });
    await Promise.resolve();
    expect(document.activeElement).toBe(first);

    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);

    outside.focus();
    expect(document.activeElement).toBe(first);

    action.destroy();
    await Promise.resolve();
    expect(document.activeElement).toBe(opener);
  });

  it('focuses the page heading when the opener no longer exists', async () => {
    document.body.innerHTML = '<button id="opener">Open</button><h1>Departures</h1><div id="boundary"><button>Close</button></div>';
    const opener = document.querySelector<HTMLButtonElement>('#opener')!;
    const heading = document.querySelector<HTMLHeadingElement>('h1')!;
    const boundary = document.querySelector<HTMLElement>('#boundary')!;
    opener.focus();

    const action = focusBoundary(boundary, { active: true });
    await Promise.resolve();
    opener.remove();
    action.destroy();
    await Promise.resolve();

    expect(document.activeElement).toBe(heading);
    expect(heading.hasAttribute('tabindex')).toBe(false);
  });

  it('does not restore focus to the opener when restore is false', async () => {
    document.body.innerHTML = `
      <button id="opener">Open</button>
      <div id="boundary">
        <button id="first">First</button>
      </div>
    `;
    const opener = document.querySelector<HTMLButtonElement>('#opener')!;
    const boundary = document.querySelector<HTMLElement>('#boundary')!;
    const first = document.querySelector<HTMLButtonElement>('#first')!;
    opener.focus();

    const action = focusBoundary(boundary, { active: true, initialFocus: '#first', restore: false });
    await Promise.resolve();
    expect(document.activeElement).toBe(first);

    action.destroy();
    await Promise.resolve();
    // focus stays wherever it was inside the boundary, not the opener
    expect(document.activeElement).toBe(first);
  });
});
