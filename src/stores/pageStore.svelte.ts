import type { Page, Segment } from "../types/page";
import { loadPages, savePages } from "../services/storage";

let _pages = $state<Page[]>(loadPages());

type Subscriber = (pages: Page[]) => void;
let _subscribers: Subscriber[] = [];

function notify() {
  for (const fn of _subscribers) fn(_pages);
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
  _pages = [..._pages, newPage];
  savePages(_pages);
  notify();
  return newPage.id;
}

export function removePage(id: string): void {
  _pages = _pages.filter(p => p.id !== id);
  savePages(_pages);
  notify();
}

export function addSegment(pageId: string, segment: Omit<Segment, "id">): void {
  const newSegment: Segment = { ...segment, id: crypto.randomUUID() };
  _pages = _pages.map(page =>
    page.id === pageId
      ? { ...page, segments: [...page.segments, newSegment] }
      : page,
  );
  savePages(_pages);
  notify();
}

export function removeSegment(pageId: string, segmentId: string): void {
  _pages = _pages.map(p =>
    p.id === pageId
      ? { ...p, segments: p.segments.filter(s => s.id !== segmentId) }
      : p,
  );
  savePages(_pages);
  notify();
}


export function renamePage(id: string, name: string): void {
  _pages = _pages.map(p => (p.id === id ? { ...p, name } : p));
  savePages(_pages);
  notify();
}

export function reorderPages(fromIndex: number, toIndex: number): void {
  const updated = [..._pages];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  _pages = updated;
  savePages(_pages);
  notify();
}

export function reorderSegments(pageId: string, fromIndex: number, toIndex: number): void {
  const page = _pages.find(p => p.id === pageId);
  if (!page) return;
  const segments = [...page.segments];
  const [moved] = segments.splice(fromIndex, 1);
  segments.splice(toIndex, 0, moved);
  _pages = _pages.map(p => (p.id === pageId ? { ...p, segments } : p));
  savePages(_pages);
  notify();
}

export function initialize(): void {
  _pages = loadPages();
  if (_pages.length > 0 && _activePageId === null) {
    _activePageId = _pages[0].id;
  }
  notify();
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



