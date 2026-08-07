import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import PageEditor from './PageEditor.svelte';
import { setLocale } from '../stores/localeStore.svelte';
import { reorderPages, renamePage, deletePage } from '../stores/pageStore.svelte';
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

  describe('page actions and swipe isolation', () => {
    function setup() {
      return render(PageEditor, {
        props: {
          pages: makePages(3),
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
    }

    it('pencil tap opens rename input without renaming or deleting', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const pencil = row.querySelector('.page-actions button') as HTMLButtonElement;
      await fireEvent.click(pencil);
      await tick();
      expect(container.querySelector('.page-rename-input')).toBeTruthy();
      expect(renamePage).not.toHaveBeenCalled();
      expect(deletePage).not.toHaveBeenCalled();
    });

    it('commits renamed page via Enter with trimmed value', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const pencil = row.querySelector('.page-actions button') as HTMLButtonElement;
      await fireEvent.click(pencil);
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      await fireEvent.input(input, { target: { value: '  Hem  ' } });
      await tick();
      await fireEvent.keyDown(input, { key: 'Enter' });
      await tick();
      expect(renamePage).toHaveBeenCalledWith('p0', 'Hem');
      expect(deletePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-rename-input')).toBeNull();
    });

    it('commits renamed page via blur', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const pencil = row.querySelector('.page-actions button') as HTMLButtonElement;
      await fireEvent.click(pencil);
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      await fireEvent.input(input, { target: { value: 'Work' } });
      await tick();
      await fireEvent.blur(input);
      await tick();
      expect(renamePage).toHaveBeenCalledWith('p0', 'Work');
    });

    it('touch start on action buttons does not arm page swipe', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const pencil = row.querySelector('.page-actions button') as HTMLButtonElement;
      await fireEvent(pencil, makeTouchEvent('touchstart', 200, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchmove', 180, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchend', 180, 300));
      await tick();
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(false);
      // tap still works after the touch sequence
      await fireEvent.click(pencil);
      await tick();
      expect(container.querySelector('.page-rename-input')).toBeTruthy();
      expect(deletePage).not.toHaveBeenCalled();
    });

    it('touch swipe from page name still reveals delete', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const nameBtn = row.querySelector('.page-name-btn') as HTMLButtonElement;
      await fireEvent(nameBtn, makeTouchEvent('touchstart', 200, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchmove', 120, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchend', 120, 300));
      await tick();
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(true);
    });

    // jsdom does not inject Svelte component styles into the DOM (no <style> tags,
    // no adoptedStyleSheets, and getComputedStyle ignores them). Assert the rules
    // against the component source instead; real hit-testing is a device-test concern.
    function componentCss(): string {
      return readFileSync('src/components/PageEditor.svelte', 'utf8');
    }

    it('hidden delete action is pointer-inert', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(false);
      expect(componentCss()).toMatch(/\.page-delete-action[^{]*\{[^}]*pointer-events:\s*none/);
    });

    it('revealed delete action is pointer-active and deletes on tap', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const nameBtn = row.querySelector('.page-name-btn') as HTMLButtonElement;
      await fireEvent(nameBtn, makeTouchEvent('touchstart', 200, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchmove', 120, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchend', 120, 300));
      await tick();
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(true);
      expect(componentCss()).toMatch(/\.page-delete-action[^{]*page-delete-visible[^{]*\{[^}]*pointer-events:\s*auto/);
      await fireEvent.click(deleteAction);
      await tick();
      expect(deletePage).toHaveBeenCalledWith('p0');
    });

    it('direct trash button deletes page', async () => {
      const { getByText, container } = setup();
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const buttons = row.querySelectorAll('.page-actions button');
      const trash = buttons[1] as HTMLButtonElement;
      await fireEvent.click(trash);
      await tick();
      expect(deletePage).toHaveBeenCalledWith('p0');
      expect(renamePage).not.toHaveBeenCalled();
    });
  });
});
