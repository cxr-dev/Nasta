import { describe, expect, it, vi } from 'vitest';
import { createPageActivation } from './pageActivation';
import type { Page } from '../types/page';

const page = (id: string): Page => ({ id, name: id, segments: [] });
const destination = (pageId: string) => ({ kind: 'page' as const, pageId });

describe('page activation', () => {
  it('invalidates the previous page before starting the next one', async () => {
    const start = vi.fn(async () => undefined);
    const stop = vi.fn();
    const activation = createPageActivation({ start, stop, refresh: start, onError: vi.fn() });
    activation.setDestination(destination('a'), page('a'));
    activation.setDestination(destination('b'), page('b'));
    await Promise.resolve();

    expect(start).toHaveBeenNthCalledWith(1, page('a'), 1);
    expect(start).toHaveBeenNthCalledWith(2, page('b'), 2);
    expect(activation.isCurrent(1)).toBe(false);
    expect(activation.isCurrent(2)).toBe(true);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('records destinations while paused and starts only on resume', async () => {
    const start = vi.fn(async () => undefined);
    const activation = createPageActivation({ start, stop: vi.fn(), refresh: start, onError: vi.fn() });
    activation.setPaused(true);
    activation.setDestination(destination('a'), page('a'));
    expect(start).not.toHaveBeenCalled();
    activation.setPaused(false);
    await Promise.resolve();
    expect(start).toHaveBeenCalledWith(page('a'), 3);
  });

  it('coalesces refreshes within a generation', async () => {
    let resolve!: () => void;
    const refresh = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const activation = createPageActivation({ start: vi.fn(async () => undefined), stop: vi.fn(), refresh, onError: vi.fn() });
    activation.setDestination(destination('a'), page('a'));
    const first = activation.refresh();
    const second = activation.refresh();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve();
    await Promise.all([first, second]);
  });
});
