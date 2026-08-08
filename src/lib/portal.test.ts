import { describe, expect, it } from 'vitest';
import { portal } from './portal';

describe('portal action', () => {
  it('moves a node to document.body when enabled', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = document.createElement('section');
    host.appendChild(node);

    const action = portal(node, true);
    expect(node.parentNode).toBe(document.body);

    action?.destroy();
  });

  it('keeps the node in place when disabled', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = document.createElement('section');
    host.appendChild(node);

    portal(node, false);
    expect(node.parentNode).toBe(host);
  });

  it('restores the node when toggled back off', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = document.createElement('section');
    host.appendChild(node);

    const action = portal(node, true);
    expect(node.parentNode).toBe(document.body);

    action?.update(false);
    expect(node.parentNode).toBe(host);

    action?.update(true);
    expect(node.parentNode).toBe(document.body);

    action?.destroy();
  });

  it('does not throw on the server (no document)', () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error simulate SSR
    globalThis.document = undefined;
    try {
      const host = { appendChild: () => {}, remove: () => {} } as unknown as HTMLElement;
      const action = portal(host, true);
      expect(action).toBeUndefined();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});