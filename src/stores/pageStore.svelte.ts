import type { Page, Segment } from "../types/page";
import { clearPages, loadPages, savePages } from "../services/storage";

let _pages = $state<Page[]>(loadPages());

export interface RemovedSegmentSnapshot {
  segment: Segment;
  pageId: string;
  index: number;
}

export interface MoveSegmentResult {
  segment: Segment;
  fromPageId: string;
  fromIndex: number;
  toPageId: string;
  toIndex: number;
}

type Subscriber = (pages: Page[]) => void;
let _subscribers: Subscriber[] = [];

function notify() {
  for (const fn of _subscribers) fn(_pages);
}

function commitPages(nextPages: Page[]): boolean {
  try {
    savePages(nextPages);
  } catch (error) {
    console.error('[PageStore] Failed to persist page change:', error);
    return false;
  }

  _pages = nextPages;
  notify();
  return true;
}

export function subscribe(fn: Subscriber): () => void {
  fn(_pages);
  _subscribers.push(fn);
  return () => {
    _subscribers = _subscribers.filter(s => s !== fn);
  };
}

export function getAll(): Page[] { return _pages; }

export function addPage(name: string): string {
  const newPage: Page = {
    id: crypto.randomUUID(),
    name,
    segments: [],
  };
  commitPages([..._pages, newPage]);
  return newPage.id;
}

export function removePage(id: string): void {
  commitPages(_pages.filter(p => p.id !== id));
}

export function addSegment(pageId: string, segment: Omit<Segment, "id">): void {
  const newSegment: Segment = { ...segment, id: crypto.randomUUID() };
  commitPages(_pages.map(page =>
    page.id === pageId
      ? { ...page, segments: [...page.segments, newSegment] }
      : page,
  ));
}

export function removeSegment(pageId: string, segmentId: string): void {
  removeSegmentWithSnapshot(pageId, segmentId);
}

export function removeSegmentWithSnapshot(pageId: string, segmentId: string): RemovedSegmentSnapshot | null {
  const page = _pages.find((candidate) => candidate.id === pageId);
  const index = page?.segments.findIndex((segment) => segment.id === segmentId) ?? -1;
  if (!page || index < 0) return null;

  const segment = page.segments[index];
  const nextPages = _pages.map(p =>
    p.id === pageId
      ? { ...p, segments: p.segments.filter(s => s.id !== segmentId) }
      : p,
  );

  return commitPages(nextPages) ? { segment, pageId, index } : null;
}

export function restoreSegment(snapshot: RemovedSegmentSnapshot): boolean {
  if (_pages.some((page) => page.segments.some((segment) => segment.id === snapshot.segment.id))) {
    return false;
  }

  const targetPage = _pages.find((page) => page.id === snapshot.pageId);
  if (!targetPage) return false;

  const insertAt = Math.max(0, Math.min(snapshot.index, targetPage.segments.length));
  const nextPages = _pages.map((page) => {
    if (page.id !== snapshot.pageId) return page;
    const segments = [...page.segments];
    segments.splice(insertAt, 0, snapshot.segment);
    return { ...page, segments };
  });

  return commitPages(nextPages);
}

export function moveSegment(fromPageId: string, segmentId: string, toPageId: string): MoveSegmentResult | null {
  if (fromPageId === toPageId) return null;

  const sourcePage = _pages.find((page) => page.id === fromPageId);
  const targetPage = _pages.find((page) => page.id === toPageId);
  const fromIndex = sourcePage?.segments.findIndex((segment) => segment.id === segmentId) ?? -1;
  if (!sourcePage || !targetPage || fromIndex < 0) return null;

  const segment = sourcePage.segments[fromIndex];
  const toIndex = targetPage.segments.length;
  const nextPages = _pages.map((page) => {
    if (page.id === fromPageId) {
      return { ...page, segments: page.segments.filter((candidate) => candidate.id !== segmentId) };
    }
    if (page.id === toPageId) {
      return { ...page, segments: [...page.segments, segment] };
    }
    return page;
  });

  return commitPages(nextPages)
    ? { segment, fromPageId, fromIndex, toPageId, toIndex }
    : null;
}

export function updateSegment(pageId: string, segmentId: string, patch: Partial<Segment>): boolean {
  const updated = _pages.map((page) =>
      page.id === pageId
      ? { ...page, segments: page.segments.map((segment) => segment.id === segmentId ? { ...segment, ...patch } : segment) }
      : page,
  );
  return commitPages(updated);
}


export function renamePage(id: string, name: string): void {
  commitPages(_pages.map(p => (p.id === id ? { ...p, name } : p)));
}

export function reorderPages(fromIndex: number, toIndex: number): void {
  const updated = [..._pages];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  commitPages(updated);
}

export function reorderSegments(pageId: string, fromIndex: number, toIndex: number): void {
  const page = _pages.find(p => p.id === pageId);
  if (!page) return;
  const segments = [...page.segments];
  const [moved] = segments.splice(fromIndex, 1);
  segments.splice(toIndex, 0, moved);
  commitPages(_pages.map(p => (p.id === pageId ? { ...p, segments } : p)));
}

export function initialize(): void {
  _pages = loadPages();
  if (_pages.length > 0 && _activePageId === null) {
    _activePageId = _pages[0].id;
  }
  notify();
}

export function replaceAll(pages: Page[]): boolean {
  return commitPages(pages);
}

export function replaceInMemory(pages: Page[]): void {
  _pages = pages;
  _activePageId = pages[0]?.id ?? null;
  notify();
}

export function clearAll(): boolean {
  try {
    clearPages();
  } catch (error) {
    console.error('[PageStore] Failed to clear pages:', error);
    return false;
  }
  _pages = [];
  _activePageId = null;
  notify();
  return true;
}

let _activePageId = $state<string | null>(null);

let _activePage = $derived(
  _activePageId
    ? _pages.find(p => p.id === _activePageId) ?? _pages[0] ?? null
    : _pages.length > 0
      ? _pages[0]
      : null
);

export function getActivePage(): Page | null { return _activePage; }
export function getActivePageId(): string | null { return _activePageId; }
export function getPages(): Page[] { return _pages; }

export function createPage(name: string): string {
  return addPage(name);
}

export function deletePage(id: string): void {
  if (_pages.length <= 1) return;
  removePage(id);
  if (_activePageId === id) {
    const nextId = _pages.find(p => p.id !== id)?.id ?? null;
    if (nextId) setActivePage(nextId);
  }
}

export function setActivePage(id: string): void {
  _activePageId = id;
}
