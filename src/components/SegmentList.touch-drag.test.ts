import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import SegmentList from './SegmentList.svelte';
import { setLocale } from '../stores/localeStore.svelte';
import { reorderSegments } from '../stores/pageStore.svelte';
import type { Page } from '../types/page';

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('../stores/pageStore.svelte', () => ({
  reorderSegments: vi.fn(),
  removeSegment: vi.fn(),
}));

vi.mock('gsap', () => ({
  default: { to: vi.fn() },
}));

// ── Fixture factory ───────────────────────────────────────────────────

function makePage(n: number): Page {
  return {
    id: 'p1',
    name: 'Test Page',
    segments: Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      line: `${i + 1}`,
      lineName: `Line ${i + 1}`,
      direction: {
        code: 1,
        destination: i === 0 ? 'Centralen' : `Dest ${i}`,
        stopPointId: `sp${i}`,
      },
      fromStop: { id: `f${i}`, name: `From ${i}`, siteId: `sf${i}` },
      toStop: { id: `t${i}`, name: `To ${i}`, siteId: `st${i}` },
      transportType: 'bus' as const,
    })),
  };
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

describe('SegmentList touch drag', () => {
  beforeEach(() => {
    setLocale('sv');
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  describe('empty state', () => {
    it('shows hint when page has no segments', () => {
      const page = makePage(0);
      const { getByText } = render(SegmentList, { props: { page } });
      expect(getByText('Lägg till avgångar nedan')).toBeTruthy();
    });
  });

  describe('rendering and interaction', () => {
    it('renders all segments', () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      expect(container.querySelectorAll('[data-drag-index]')).toHaveLength(3);
    });

    it('expands segment on body click', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      const body = container.querySelector('.segment-body') as HTMLElement;

      await fireEvent.click(body);
      await tick();

      expect(body.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('HTML5 drag reorder', () => {
    it('calls reorderSegments when dropped on different index', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const items = container.querySelectorAll('[data-drag-index]');

      await fireEvent.dragStart(items[0]);
      await tick();
      expect(items[0].classList.contains('dragging')).toBe(true);

      await fireEvent.dragOver(items[2]);
      await tick();
      expect(items[2].classList.contains('drag-over')).toBe(true);
      // drop indicator appears during drag-over
      expect(container.querySelectorAll('.drop-indicator').length).toBeGreaterThan(0);

      await fireEvent.drop(items[2]);
      await tick();

      expect(reorderSegments).toHaveBeenCalledWith('p1', 0, 2);
      expect(items[0].classList.contains('dragging')).toBe(false);
      expect(items[2].classList.contains('drag-over')).toBe(false);
      // drop indicator removed after drop
      expect(container.querySelectorAll('.drop-indicator')).toHaveLength(0);
    });

    it('does not call reorderSegments when dropped on same index', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const items = container.querySelectorAll('[data-drag-index]');

      await fireEvent.dragStart(items[0]);
      await fireEvent.dragOver(items[0]);
      await fireEvent.drop(items[0]);
      await tick();

      expect(reorderSegments).not.toHaveBeenCalled();
    });
  });

  describe('touch drag reorder', () => {
    it('sets pointer-events none on touch start and restores on end', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const items = container.querySelectorAll('[data-drag-index]');
      const dragHandle = items[0].querySelector('.drag-handle')!;
      const listEl = container.querySelector('.segment-list')!;

      // Before: default style
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('');

      // Touch start on handle of item 0
      await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
      await tick();
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('none');

      // Touch end
      await fireEvent(listEl, makeTouchEvent('touchend', 100, 200));
      await tick();
      expect((items[0] as HTMLElement).style.pointerEvents).toBe('');
    });

    it('reorders segments via touch drag', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const items = container.querySelectorAll('[data-drag-index]');
      const dragHandle = items[0].querySelector('.drag-handle')!;
      const listEl = container.querySelector('.segment-list')!;

      // Spy on elementFromPoint to return the drop target (item 2)
      const eFP = vi.spyOn(document, 'elementFromPoint').mockReturnValue(items[2] as Element);

      // Touch start on handle of item 0
      await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
      await tick();
      expect(items[0].classList.contains('dragging')).toBe(true);

      // Touch move with pointer over item 2's area
      await fireEvent(listEl, makeTouchEvent('touchmove', 100, 500));
      await tick();
      expect(items[2].classList.contains('drag-over')).toBe(true);
      expect(eFP).toHaveBeenCalledWith(100, 500);
      // drop indicator appears during touch drag
      expect(container.querySelectorAll('.drop-indicator').length).toBeGreaterThan(0);

      // Touch end
      await fireEvent(listEl, makeTouchEvent('touchend', 100, 500));
      await tick();

      expect(reorderSegments).toHaveBeenCalledWith('p1', 0, 2);

      // State reset after end
      expect(items[0].classList.contains('dragging')).toBe(false);
      expect(items[2].classList.contains('drag-over')).toBe(false);
      // drop indicator removed after end
      expect(container.querySelectorAll('.drop-indicator')).toHaveLength(0);
    });

    it('touch move is no-op without active drag', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const listEl = container.querySelector('.segment-list')!;

      // Fire touchmove without prior touchstart — guard in handler returns
      await fireEvent(listEl, makeTouchEvent('touchmove', 100, 500));
      await tick();

      expect(reorderSegments).not.toHaveBeenCalled();
    });

    it('does not toggle expand during active touch drag', async () => {
      const page = makePage(3);
      const { container } = render(SegmentList, { props: { page } });
      await tick();

      const items = container.querySelectorAll('[data-drag-index]');
      const dragHandle = items[0].querySelector('.drag-handle')!;

      // Start touch drag
      await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
      await tick();

      // Click body while drag is active — guard prevents toggle
      const body = items[0].querySelector('.segment-body') as HTMLElement;
      await fireEvent.click(body);
      await tick();

      expect(body.getAttribute('aria-expanded')).toBe('false');
    });

    describe('long-press haptic', () => {
      it('sets setTimeout on touch start', async () => {
        const page = makePage(3);
        const { container } = render(SegmentList, { props: { page } });
        await tick();

        const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
        const items = container.querySelectorAll('[data-drag-index]');
        const dragHandle = items[0].querySelector('.drag-handle')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        expect(setTimeoutSpy).toHaveBeenCalled();
        expect(setTimeoutSpy.mock.lastCall?.[1]).toBe(300);
        setTimeoutSpy.mockRestore();
      });

      it('calls clearTimeout on touch move', async () => {
        const page = makePage(3);
        const { container } = render(SegmentList, { props: { page } });
        await tick();

        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
        const items = container.querySelectorAll('[data-drag-index]');
        const dragHandle = items[0].querySelector('.drag-handle')!;
        const listEl = container.querySelector('.segment-list')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        await fireEvent(listEl, makeTouchEvent('touchmove', 100, 300));
        await tick();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });

      it('calls clearTimeout on touch end', async () => {
        const page = makePage(3);
        const { container } = render(SegmentList, { props: { page } });
        await tick();

        const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
        const items = container.querySelectorAll('[data-drag-index]');
        const dragHandle = items[0].querySelector('.drag-handle')!;
        const listEl = container.querySelector('.segment-list')!;

        await fireEvent(dragHandle, makeTouchEvent('touchstart', 100, 200));
        await tick();

        await fireEvent(listEl, makeTouchEvent('touchend', 100, 200));
        await tick();

        expect(clearTimeoutSpy).toHaveBeenCalled();
        clearTimeoutSpy.mockRestore();
      });
    });
  });
});
