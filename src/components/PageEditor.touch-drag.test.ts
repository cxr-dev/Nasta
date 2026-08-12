import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import PageEditor from './PageEditor.svelte';
import { setLocale } from '../stores/localeStore.svelte';
import { reorderPages, renamePage, deletePage, createPage, setActivePage } from '../stores/pageStore.svelte';
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

// jsdom lacks PointerEvent with pointerType; build synthetic pointer events
// that match the shape longPress.ts listens for (touch pointer, button 0).
function makePointerEvent(type: string, x = 0, y = 0): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
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

      await fireEvent.dragStart(items[0].querySelector('.page-drag-handle')!);
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

      await fireEvent.dragStart(items[0].querySelector('.page-drag-handle')!);
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

    it('restores the dragged page when the OS cancels the touch gesture', async () => {
      const { getByText, container } = render(PageEditor, {
        props: {
          pages: makePages(3),
          activePageId: 'p0',
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage: vi.fn(),
        },
      });
      await fireEvent.click(getByText('Pages'));
      await tick();
      const row = container.querySelector('[data-page-drag-index="0"]') as HTMLElement;
      const handle = row.querySelector('.page-drag-handle')!;
      const pages = container.querySelector('.pages-tab')!;

      await fireEvent(handle, makeTouchEvent('touchstart', 100, 200));
      expect(row.style.pointerEvents).toBe('none');
      await fireEvent(pages, makeTouchEvent('touchcancel', 100, 200));
      await tick();

      expect(row.style.pointerEvents).toBe('');
      expect(row.classList.contains('dragging')).toBe(false);
    });
  });
});

  describe('page actions and swipe isolation', () => {
    function setup(pages: Page[] = makePages(3), onSwitchPage: (id: string) => void = vi.fn()) {
      return render(PageEditor, {
        props: {
          pages,
          activePageId: pages[0]?.id ?? null,
          isOpen: true,
          onClose: vi.fn(),
          onSwitchPage,
        },
      });
    }

    async function showPages(getByText: (text: string) => HTMLElement) {
      await fireEvent.click(getByText('Pages'));
      await tick();
    }

    function moreButton(container: HTMLElement): HTMLButtonElement {
      return container.querySelector(
        '[data-page-drag-index="0"] .page-actions button',
      ) as HTMLButtonElement;
    }

    it('more button opens menu with rename and delete actions', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
      expect(getByText('Rename')).toBeTruthy();
      expect(getByText('Delete page')).toBeTruthy();
      expect(renamePage).not.toHaveBeenCalled();
      expect(deletePage).not.toHaveBeenCalled();
    });

    it('clicking Rename in the menu opens the rename input', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
      await tick();
      expect(container.querySelector('.page-rename-input')).toBeTruthy();
      expect(renamePage).not.toHaveBeenCalled();
      expect(deletePage).not.toHaveBeenCalled();
    });

    it('Rename in menu focuses the rename input, not the trigger button', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect(document.activeElement?.getAttribute('data-page-more-btn')).toBeNull();
      // sheet is fully closed before the rename input takes focus
      expect(container.querySelector('.page-actions-menu')).toBeNull();
    });

    it('commits renamed page via Enter with trimmed value', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
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

    it('blur does not commit rename and keeps the input mounted', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      await fireEvent.input(input, { target: { value: 'Work' } });
      await tick();
      await fireEvent.blur(input);
      await tick();
      expect(renamePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-rename-input')).toBeTruthy();
    });

    it('cancel button cancels rename without committing', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      await fireEvent.input(input, { target: { value: 'Work' } });
      await tick();
      const cancel = container.querySelector(
        '.page-rename-actions button:first-child',
      ) as HTMLButtonElement;
      await fireEvent.click(cancel);
      await tick();
      expect(renamePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-rename-input')).toBeNull();
    });

    it('Escape cancels rename without committing', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Rename'));
      await tick();
      const input = container.querySelector('.page-rename-input') as HTMLInputElement;
      await fireEvent.input(input, { target: { value: 'Work' } });
      await tick();
      await fireEvent.keyDown(input, { key: 'Escape' });
      await tick();
      expect(renamePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-rename-input')).toBeNull();
    });

    it('touch start on action buttons does not arm page swipe', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const more = moreButton(container);
      await fireEvent(more, makeTouchEvent('touchstart', 200, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchmove', 180, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchend', 180, 300));
      await tick();
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(false);
      // tap still works after the touch sequence — opens menu, not rename
      await fireEvent.click(more);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
      expect(deletePage).not.toHaveBeenCalled();
    });

    it('touch swipe from page name still reveals delete', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
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
      await showPages(getByText);
      const deleteAction = container.querySelector('.page-delete-action')!;
      expect(deleteAction.classList.contains('page-delete-visible')).toBe(false);
      expect(componentCss()).toMatch(/\.page-delete-action[^{]*\{[^}]*pointer-events:\s*none/);
    });

    it('revealed delete action opens confirm view and deletes only after confirm', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
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
      expect(deletePage).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Delete this page?');
      await fireEvent.click(getByText('Delete page'));
      await tick();
      expect(deletePage).toHaveBeenCalledTimes(1);
      expect(deletePage).toHaveBeenCalledWith('p0');
    });

    it('delete via menu requires confirmation', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      await fireEvent.click(getByText('Delete page'));
      await tick();
      expect(deletePage).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Delete this page?');
      await fireEvent.click(getByText('Delete page'));
      await tick();
      expect(deletePage).toHaveBeenCalledTimes(1);
      expect(deletePage).toHaveBeenCalledWith('p0');
      expect(renamePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
    });

    it('Escape closes the menu', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      const action = container.querySelector('.page-menu-action') as HTMLElement;
      await fireEvent.keyDown(action, { key: 'Escape' });
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
    });

    it('outside click closes the menu', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
      const overlays = container.querySelectorAll('.sheet-overlay');
      const menuOverlay = overlays[overlays.length - 1] as HTMLElement;
      await fireEvent.click(menuOverlay);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
    });

    it('opening a second page menu replaces the first', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      const buttons = container.querySelectorAll('.page-actions button');
      await fireEvent.click(buttons[0]);
      await tick();
      await fireEvent.click(buttons[1]);
      await tick();
      expect(container.querySelectorAll('.page-actions-menu')).toHaveLength(1);
      expect(getByText('Rename')).toBeTruthy();
    });

    it('clicking the SVG inside the more button still opens the menu', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      const svg = moreButton(container).querySelector('svg')!;
      await fireEvent.click(svg);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
    });

    it('add page button creates a page and switches to it', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      const addBtn = container.querySelector('.add-btn') as HTMLButtonElement;
      await fireEvent.click(addBtn);
      await tick();
      expect(createPage).toHaveBeenCalled();
      expect(setActivePage).toHaveBeenCalled();
    });

    it('title is static Manage pages, no page name interpolation', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      expect(getByText('Manage pages')).toBeTruthy();
      expect(container.querySelector('.sheet-title')?.textContent).toBe('Manage pages');
    });

    it('delete action hidden in menu when only one page exists', async () => {
      const { getByText, container } = setup(makePages(1));
      await showPages(getByText);
      await fireEvent.click(moreButton(container));
      await tick();
      expect(container.querySelectorAll('.page-menu-action')).toHaveLength(1);
      expect(container.querySelector('.page-menu-action.destructive')).toBeNull();
    });

    it('long press on page info opens the same actions menu as the more button', async () => {
      vi.useFakeTimers();
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const infoWrap = row.querySelector('.page-info-wrap')!;
      infoWrap.dispatchEvent(makePointerEvent('pointerdown', 200, 300));
      vi.advanceTimersByTime(450);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
      expect(getByText('Rename')).toBeTruthy();
      expect(renamePage).not.toHaveBeenCalled();
      expect(deletePage).not.toHaveBeenCalled();
      infoWrap.dispatchEvent(makePointerEvent('pointerup', 200, 300));
      vi.useRealTimers();
    });

    it('long press on the drag handle does not open the menu', async () => {
      vi.useFakeTimers();
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const handle = row.querySelector('.page-drag-handle')!;
      handle.dispatchEvent(makePointerEvent('pointerdown', 200, 300));
      vi.advanceTimersByTime(450);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
      handle.dispatchEvent(makePointerEvent('pointerup', 200, 300));
      vi.useRealTimers();
    });

    it('long press is cancelled when the pointer moves beyond the threshold', async () => {
      vi.useFakeTimers();
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const infoWrap = row.querySelector('.page-info-wrap')!;
      infoWrap.dispatchEvent(makePointerEvent('pointerdown', 200, 300));
      vi.advanceTimersByTime(449);
      infoWrap.dispatchEvent(makePointerEvent('pointermove', 220, 300));
      vi.advanceTimersByTime(20);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
      infoWrap.dispatchEvent(makePointerEvent('pointerup', 220, 300));
      vi.useRealTimers();
    });

    it('quick tap on page info does not open the menu', async () => {
      vi.useFakeTimers();
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const infoWrap = row.querySelector('.page-info-wrap')!;
      infoWrap.dispatchEvent(makePointerEvent('pointerdown', 200, 300));
      infoWrap.dispatchEvent(makePointerEvent('pointerup', 200, 300));
      vi.advanceTimersByTime(450);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeNull();
      vi.useRealTimers();
    });

    it('click is suppressed after a successful long press (no page switch)', async () => {
      const onSwitchPage = vi.fn();
      const { getByText, container } = setup(makePages(3), onSwitchPage);
      await showPages(getByText);
      vi.useFakeTimers();
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const infoWrap = row.querySelector('.page-info-wrap')!;
      const nameBtn = row.querySelector('.page-name-btn') as HTMLButtonElement;
      infoWrap.dispatchEvent(makePointerEvent('pointerdown', 200, 300));
      vi.advanceTimersByTime(450);
      await tick();
      expect(container.querySelector('.page-actions-menu')).toBeTruthy();
      infoWrap.dispatchEvent(makePointerEvent('pointerup', 200, 300));
      nameBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      expect(onSwitchPage).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('cancelling delete after swipe reveal restores the row', async () => {
      const { getByText, container } = setup();
      await showPages(getByText);
      const row = container.querySelector('[data-page-drag-index="0"]')!;
      const nameBtn = row.querySelector('.page-name-btn') as HTMLButtonElement;
      await fireEvent(nameBtn, makeTouchEvent('touchstart', 200, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchmove', 120, 300));
      await tick();
      await fireEvent(row, makeTouchEvent('touchend', 120, 300));
      await tick();
      expect(container.querySelector('.page-delete-visible')).toBeTruthy();
      const deleteAction = container.querySelector('.page-delete-action')!;
      await fireEvent.click(deleteAction);
      await tick();
      expect(deletePage).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Delete this page?');
      await fireEvent.click(getByText('Cancel'));
      await tick();
      expect(deletePage).not.toHaveBeenCalled();
      expect(container.querySelector('.page-delete-visible')).toBeNull();
    });
  });
});
