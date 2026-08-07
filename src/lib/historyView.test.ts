import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHistoryView } from './historyView';

const markerKey = 'nastaFullscreenView';

afterEach(() => {
  history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('createHistoryView', () => {
  it('pushes one marker while preserving existing history state', () => {
    history.replaceState({ existing: 'keep' }, '', '/');
    const before = history.length;
    const view = createHistoryView('rail-map', { onEnter: vi.fn(), onExit: vi.fn() });

    view.enter();
    view.enter();

    expect(history.length).toBe(before + 1);
    expect(history.state).toMatchObject({ existing: 'keep', [markerKey]: 'rail-map' });
    view.destroy();
  });

  it('closes on popstate and reopens from browser Forward', () => {
    const onEnter = vi.fn();
    const onExit = vi.fn();
    const view = createHistoryView('rail-map', { onEnter, onExit });
    view.enter();

    history.replaceState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    expect(onExit).toHaveBeenCalledOnce();

    history.replaceState({ [markerKey]: 'rail-map' }, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    expect(onEnter).toHaveBeenCalledOnce();
    view.destroy();
  });

  it('falls back to local exit when its marker is missing', () => {
    const onExit = vi.fn();
    const view = createHistoryView('rail-map', { onEnter: vi.fn(), onExit });
    view.enter();
    history.replaceState({}, '', '/');

    view.back();

    expect(onExit).toHaveBeenCalledOnce();
    view.destroy();
  });

  it('delegates visual Back to browser history when its marker is current', () => {
    const browserBack = vi.spyOn(history, 'back').mockImplementation(() => {});
    const onExit = vi.fn();
    const view = createHistoryView('rail-map', { onEnter: vi.fn(), onExit });
    view.enter();

    view.back();

    expect(browserBack).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();
    view.destroy();
  });
});
