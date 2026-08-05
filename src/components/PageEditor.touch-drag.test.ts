import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import PageEditor from './PageEditor.svelte';
import { setLocale } from '../stores/localeStore.svelte';
import { reorderPages } from '../stores/pageStore.svelte';
import { getSettings } from '../stores/settingsStore.svelte';
import type { Page } from '../types/page';

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('../stores/pageStore.svelte', () => ({
  addSegment: vi.fn(),
  renamePage: vi.fn(),
  reorderPages: vi.fn(),
  setActivePage: vi.fn(),
  createPage: vi.fn(),
  deletePage: vi.fn(),
  getDefaultName: vi.fn(() => 'New Page'),
}));

vi.mock('../stores/settingsStore.svelte', () => ({
  getSettings: vi.fn(() => ({
    refreshInterval: 30,
    hasSwipedRoutes: true,
    theme: 'system',
    language: 'en',
    disruptionAlertsEnabled: false,
    disruptionSeverityThreshold: 'warning',
    disruptionLanguage: 'auto',
    enabledTransportTypes: ['bus', 'metro', 'train', 'tram', 'boat'],
    transportFilterMode: 'multi',
    activeTransportType: null,
    locationServicesEnabled: false,
    walkingEtaEnabled: false,
    afterworkVenuesEnabled: false,
    afterworkStartHour: 17,
    afterworkTypes: [],
    eventsEnabled: false,
    groupDisruptedSegments: false,
  })),
  setDisruptionAlertsEnabled: vi.fn(),
  setDisruptionSeverityThreshold: vi.fn(),
  setWalkingEtaEnabled: vi.fn(),
  setLocationServicesEnabled: vi.fn(),
  setAfterworkVenuesEnabled: vi.fn(),
  setAfterworkStartHour: vi.fn(),
  setEventsEnabled: vi.fn(),
  setGroupDisruptedSegments: vi.fn(),
  setLanguage: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('gsap', () => ({
  default: { set: vi.fn(), to: vi.fn(), fromTo: vi.fn(), killTweensOf: vi.fn() },
}));

// ── Fixture factory ───────────────────────────────────────────────────

function makePages(n: number): Page[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Page ${i + 1}`,
    segments: [],
  }));
}

// jsdom lacks TouchEvent/Touch constructors; build synthetic events.
function makeTouchEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: [{ clientX, clientY }],
  });
  return event;
}

// jsdom lacks elementFromPoint — polyfill so vi.spyOn works.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('PageEditor page drag', () => {
  beforeEach(() => {
    setLocale('en');
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  describe('render', () => {
    it('shows page list when pages tab is active', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      // Click the Pages tab to show the page list
      await fireEvent.click(getByText('Pages'));
      await tick();
      expect(container.querySelectorAll('[data-page-drag-index]')).toHaveLength(3);
    });
  });

  describe('HTML5 drag reorder', () => {
    it('calls reorderPages when dropped on different index', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();

      const items = container.querySelectorAll('[data-page-drag-index]');

      await fireEvent.dragStart(items[0]);
      await tick();
      expect(items[0].classList.contains('page-dragging')).toBe(true);

      await fireEvent.dragOver(items[2]);
      await tick();
      expect(items[2].classList.contains('page-drag-over')).toBe(true);

      await fireEvent.drop(items[2]);
      await tick();

      expect(reorderPages).toHaveBeenCalledWith(0, 2);
      expect(items[0].classList.contains('page-dragging')).toBe(false);
      expect(items[2].classList.contains('page-drag-over')).toBe(false);
      // drop indicator removed after drop
      expect(container.querySelectorAll('.drop-indicator')).toHaveLength(0);
    });

    it('does not call reorderPages when dropped on same index', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();

      const items = container.querySelectorAll('[data-page-drag-index]');

      await fireEvent.dragStart(items[0]);
      await fireEvent.dragOver(items[0]);
      await fireEvent.drop(items[0]);
      await tick();

      expect(reorderPages).not.toHaveBeenCalled();
    });
  });

  describe('touch drag reorder', () => {
    it('sets pointer-events none on touch start and restores on end', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();

      const items = container.querySelectorAll('[data-page-drag-index]');
      const dragHandle = items[0].querySelector('.page-drag-handle')!;
      const pagesTab = container.querySelector('.pages-tab')!;

      // Before: default style
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('');

      // Touch start on handle of item 0
      await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
      await tick();
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('none');

      // Touch end
      await fireEvent(pagesTab, makeTouchEvent('touchend', 100, 200));
      await tick();
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('');
    });

    it('reorders pages via touch drag', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();

      const items = container.querySelectorAll('[data-page-drag-index]');
      const dragHandle = items[0].querySelector('.page-drag-handle')!;
      const pagesTab = container.querySelector('.pages-tab')!;

      // Spy on elementFromPoint to return the drop target (item 2)
      const eFP = vi.spyOn(document, 'elementFromPoint').mockReturnValue(items[2] as Element);

      // Touch start on handle of item 0
      await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
      await tick();
      expect(items[0].classList.contains('page-dragging')).toBe(true);

      // Touch move with pointer over item 2's area
      await fireEvent(pagesTab, makeTouchEvent('touchmove', 100, 500));
      await tick();
      expect(items[2].classList.contains('page-drag-over')).toBe(true);
      expect(eFP).toHaveBeenCalledWith(100, 500);

      // Touch end
      await fireEvent(pagesTab, makeTouchEvent('touchend', 100, 500));
      await tick();

      expect(reorderPages).toHaveBeenCalledWith(0, 2);

      // State reset after end
      expect(items[0].classList.contains('page-dragging')).toBe(false);
      expect(items[2].classList.contains('page-drag-over')).toBe(false);
      // drop indicator removed after end
      expect(container.querySelectorAll('.drop-indicator')).toHaveLength(0);
    });

    it('touch move is no-op without active drag', async () => {
      const pages = makePages(3);
      const { getByText, container } = render(PageEditor, {
        props: {
          pages,
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();

      const pagesTab = container.querySelector('.pages-tab')!;

      // Fire touchmove without prior touchstart — guard in handler returns
      await fireEvent(pagesTab, makeTouchEvent('touchmove', 100, 500));
      await tick();

      expect(reorderPages).not.toHaveBeenCalled();
    });

    describe('long-press haptic', () => {
      it('sets setTimeout on touch start', async () => {
        const pages = makePages(3);
        const { getByText, container } = render(PageEditor, {
          props: {
            pages,
            activePageId: 'p0',
            isOpen: true,
            onClose: vi.fn(),
            onSwitchPage: vi.fn(),
          },
        });
        await fireEvent.click(getByText('Pages'));
        await tick();

        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
        const items = container.querySelectorAll('[data-page-drag-index]');
        const dragHandle = items[0].querySelector('.page-drag-handle')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        expect(setTimeoutSpy).toHaveBeenCalled();
        expect(setTimeoutSpy.mock.lastCall?.[1]).toBe(300);
        setTimeoutSpy.mockRestore();
      });

      it('calls clearTimeout on touch move', async () => {
        const pages = makePages(3);
        const { getByText, container } = render(PageEditor, {
          props: {
            pages,
            activePageId: 'p0',
            isOpen: true,
            onClose: vi.fn(),
            onSwitchPage: vi.fn(),
          },
        });
        await fireEvent.click(getByText('Pages'));
        await tick();

        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
        const items = container.querySelectorAll('[data-page-drag-index]');
        const dragHandle = items[0].querySelector('.page-drag-handle')!;
        const pagesTab = container.querySelector('.pages-tab')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        await fireEvent(pagesTab, makeTouchEvent('touchmove', 100, 300));
        await tick();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });

      it('calls clearTimeout on touch end', async () => {
        const pages = makePages(3);
        const { getByText, container } = render(PageEditor, {
          props: {
            pages,
            activePageId: 'p0',
            isOpen: true,
            onClose: vi.fn(),
            onSwitchPage: vi.fn(),
          },
        });
        await fireEvent.click(getByText('Pages'));
        await tick();

        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
        const items = container.querySelectorAll('[data-page-drag-index]');
        const dragHandle = items[0].querySelector('.page-drag-handle')!;
        const pagesTab = container.querySelector('.pages-tab')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        await fireEvent(pagesTab, makeTouchEvent('touchend', 100, 200));
        await tick();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });
    });
  });
});
