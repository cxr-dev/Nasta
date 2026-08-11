import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPage,
  addSegment,
  createPage,
  deletePage,
  getActivePage,
  getActivePageId,
  getAll,
  getPages,
  initialize,
  removePage,
  removeSegment,
  renamePage,
  reorderPages,
  reorderSegments,
  setActivePage,
  subscribe,
} from "./pageStore.svelte";

beforeEach(() => {
  localStorage.clear();
  initialize();
});

function segmentData(line = "76") {
  return {
    line,
    lineName: line,
    direction: { code: 1, destination: "Ropsten", stopPointId: "" },
    fromStop: { id: "f1", name: "Start", siteId: "100" },
    toStop: { id: "t1", name: "End", siteId: "200" },
    transportType: "bus" as const,
  };
}

describe("page CRUD", () => {
  it("addPage creates a new page and assigns an ID", () => {
    const id = addPage("Work");
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    const pages = getAll();
    expect(pages).toHaveLength(1);
    expect(pages[0].name).toBe("Work");
    expect(pages[0].segments).toEqual([]);
  });

  it("addPage with duplicate names is allowed", () => {
    addPage("Test");
    addPage("Test");
    expect(getAll()).toHaveLength(2);
    expect(getAll()[0].name).toBe("Test");
    expect(getAll()[1].name).toBe("Test");
  });

  it("removePage removes a page by ID", () => {
    const id1 = addPage("A");
    addPage("B");
    removePage(id1);
    expect(getAll()).toHaveLength(1);
    expect(getAll()[0].name).toBe("B");
  });

  it("deletePage refuses to delete the last page", () => {
    addPage("Only");
    const id = getAll()[0].id;
    deletePage(id);
    expect(getAll()).toHaveLength(1);
  });

  it("deletePage deletes when there are multiple pages", () => {
    addPage("A");
    addPage("B");
    deletePage(getAll()[0].id);
    expect(getAll()).toHaveLength(1);
  });

  it("deletePage switches active page if current is deleted", () => {
    addPage("A");
    addPage("B");
    const aId = getAll()[0].id;
    const bId = getAll()[1].id;
    setActivePage(aId);
    deletePage(aId);
    expect(getActivePageId()).toBe(bId);
    expect(getActivePage()?.name).toBe("B");
  });

  it("renamePage updates page name", () => {
    const id = addPage("Old");
    renamePage(id, "Renamed");
    expect(getAll()[0].name).toBe("Renamed");
  });

  it("reorderPages moves a page", () => {
    addPage("A");
    addPage("B");
    addPage("C");
    reorderPages(2, 0);
    expect(getAll().map((p) => p.name)).toEqual(["C", "A", "B"]);
  });

  it("reorderPages is stable at same index", () => {
    addPage("A");
    addPage("B");
    reorderPages(0, 0);
    expect(getAll().map((p) => p.name)).toEqual(["A", "B"]);
  });

  it("createPage uses provided name", () => {
    createPage("Custom");
    expect(getAll()[0].name).toBe("Custom");
  });
});

describe("segment CRUD", () => {
  it("addSegment adds a segment to a page", () => {
    const pageId = addPage("Work");
    addSegment(pageId, segmentData("76"));
    const page = getAll()[0];
    expect(page.segments).toHaveLength(1);
    expect(page.segments[0].line).toBe("76");
    expect(page.segments[0].id).toBeTruthy();
  });

  it("addSegment adds multiple segments", () => {
    const pageId = addPage("Work");
    addSegment(pageId, segmentData("76"));
    addSegment(pageId, segmentData("13"));
    addSegment(pageId, segmentData("4"));
    expect(getAll()[0].segments).toHaveLength(3);
  });

  it("removeSegment removes a segment by ID", () => {
    const pageId = addPage("Work");
    addSegment(pageId, segmentData("76"));
    addSegment(pageId, segmentData("13"));
    const segId = getAll()[0].segments[0].id;
    removeSegment(pageId, segId);
    expect(getAll()[0].segments).toHaveLength(1);
    expect(getAll()[0].segments[0].line).toBe("13");
  });

  it("reorderSegments moves a segment", () => {
    const pageId = addPage("Work");
    addSegment(pageId, segmentData("76"));
    addSegment(pageId, segmentData("13"));
    reorderSegments(pageId, 1, 0);
    expect(getAll()[0].segments[0].line).toBe("13");
    expect(getAll()[0].segments[1].line).toBe("76");
  });

  it("reorderSegments is no-op for unknown page", () => {
    addSegment("nonexistent", segmentData("76"));
    expect(getAll()).toHaveLength(0);
  });
});



describe("active page", () => {
  it("selects the first persisted page during module initialization", async () => {
    localStorage.setItem("nasta_routes", JSON.stringify([
      { id: "persisted-first", name: "Work", segments: [] },
      { id: "persisted-second", name: "Home", segments: [] },
    ]));
    vi.resetModules();

    const store = await import("./pageStore.svelte");

    expect(store.getActivePageId()).toBe("persisted-first");
    expect(store.getActivePage()?.name).toBe("Work");
  });

  it("setActivePage updates active page", () => {
    addPage("A");
    addPage("B");
    const bId = getAll()[1].id;
    setActivePage(bId);
    expect(getActivePageId()).toBe(bId);
    expect(getActivePage()?.name).toBe("B");
  });

  it("resolves to first page when active is cleared", () => {
    addPage("A");
    addPage("B");
    setActivePage(null!);
    expect(getActivePage()?.name).toBe("A");
  });

  it("returns null when no pages exist", () => {
    expect(getActivePage()).toBeNull();
    expect(getActivePageId()).toBeNull();
  });
});

describe("subscribe", () => {
  it("notifies subscribers on page changes", () => {
    const fn = vi.fn();
    const unsub = subscribe(fn);
    addPage("New");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(getAll());
    unsub();
  });

  it("notifies subscribers on segment changes", () => {
    const pageId = addPage("Work");
    const fn = vi.fn();
    const unsub = subscribe(fn);
    fn.mockClear();
    addSegment(pageId, segmentData());
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("calls subscriber immediately with current state", () => {
    addPage("Prepop");
    const fn = vi.fn();
    subscribe(fn);
    expect(fn).toHaveBeenCalledWith(getAll());
  });
});
