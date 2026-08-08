import { describe, it, expect, vi, beforeEach } from "vitest";
import { getShareCard, shareCardCacheKey } from "./shareCard";
import { persistentCache } from "./persistentCache";
import type { JourneyShareData, DepartureShareData, ShareCardRendererOptions } from "../lib/shareImageRenderer";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("./persistentCache", () => ({
  persistentCache: {
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    remove: async () => {},
  },
}));

beforeEach(() => {
  store.clear();
});

const journeyData: JourneyShareData = {
  kind: "journey",
  originLabel: "T-Centralen",
  destLabel: "Slussen",
  departureTime: 0,
  arrivalTime: 600_000,
  durationMin: 10,
  transfers: 0,
  legs: [
    {
      transportType: "metro",
      line: "17",
      platformPosition: "middle",
      directionName: "Hässelby strand",
      originName: "T-Centralen",
      destName: "Slussen",
      departureTime: 0,
      arrivalTime: 600_000,
      durationMin: 10,
    },
  ],
  labels: {
    duration: "min",
    transfer: "byte",
    transfers: "byten",
    direct: "Direkt",
    front: "Främre",
    middle: "Mitten",
    back: "Bakre",
    walk: "Gång",
    change: "byte",
    arrives: "Ankomst",
    andMore: "+{n} till",
    towards: "towards {dir}",
  },
};

const departureData: DepartureShareData = {
  kind: "departure",
  line: "7",
  lineName: "Tvärbanan",
  destination: "Solna station",
  stop: "T-Centralen",
  transportType: "tram",
  timeLabel: "Nu",
  predicted: true,
  labels: { departs: "Från", predicted: "Beräknad", late: "{n} min sen" },
};

function fakeCanvas(calls: string[]) {
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
    measureText: () => ({ width: 10 }),
    fillText: () => calls.push("fillText"),
    fillRect: () => calls.push("fillRect"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    bezierCurveTo: () => calls.push("bezierCurveTo"),
    quadraticCurveTo: () => calls.push("quadraticCurveTo"),
    arcTo: () => calls.push("arcTo"),
    closePath: () => calls.push("closePath"),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: () => calls.push("translate"),
    scale: () => calls.push("scale"),
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })),
  };
}

function dryRunOptions(measure: (text: string, font: string) => number): ShareCardRendererOptions {
  return {
    measure,
    fonts: { ready: () => Promise.resolve() },
    canvasFactory: () => fakeCanvas([]) as unknown as HTMLCanvasElement,
  };
}

describe("shareCard", () => {
  it("shareCardCacheKey distinguishes theme and data", () => {
    const a = shareCardCacheKey(journeyData, "light");
    expect(a).not.toBe(shareCardCacheKey(journeyData, "dark"));
    expect(a).not.toBe(shareCardCacheKey(departureData, "light"));
    expect(a).toContain("light");
  });

  it("renders and caches on a cache miss", async () => {
    const measure = vi.fn((text: string) => text.length * 10);
    const opts = dryRunOptions(measure);
    const card = await getShareCard(journeyData, "light", opts);
    expect(card).not.toBeNull();
    expect(card!.width).toBe(1080);
    expect(card!.height).toBe(1350);
    expect(card!.blob.type).toBe("image/png");
    expect(measure).toHaveBeenCalled();
  });

  it("returns the cached card on a fresh hit", async () => {
    const seeded = new Blob(["cached"], { type: "image/png" });
    const key = shareCardCacheKey(departureData, "dark");
    await persistentCache.set(key, { blob: seeded, width: 1080, height: 1350, createdAt: Date.now() }, 1000 * 60 * 60 * 24 * 365 * 10);
    const card = await getShareCard(departureData, "dark", dryRunOptions((t) => t.length * 10));
    expect(card).not.toBeNull();
    expect(await card!.blob.text()).toBe("cached");
  });

  it("re-renders and replaces the card when stale", async () => {
    const stale = new Blob(["stale"], { type: "image/png" });
    const key = shareCardCacheKey(journeyData, "light");
    await persistentCache.set(key, { blob: stale, width: 1080, height: 1350, createdAt: Date.now() - 11 * 60_000 }, 1000 * 60 * 60 * 24 * 365 * 10);
    const card = await getShareCard(journeyData, "light", dryRunOptions((t) => t.length * 10));
    expect(card).not.toBeNull();
    expect(await card!.blob.text()).not.toBe("stale");
    expect(card!.blob.type).toBe("image/png");
  });

  it("keeps the latest valid PNG when a stale refresh fails", async () => {
    const stale = new Blob(["valid-old"], { type: "image/png" });
    const key = shareCardCacheKey(journeyData, "light");
    await persistentCache.set(key, { blob: stale, width: 1080, height: 1350, createdAt: Date.now() - 11 * 60_000 }, 1000 * 60 * 60 * 24 * 365 * 10);
    const card = await getShareCard(journeyData, "light", {
      measure: (t) => t.length * 10,
      fonts: { ready: () => Promise.resolve() },
      canvasFactory: () => {
        throw new Error("canvas unavailable");
      },
    });
    expect(card).not.toBeNull();
    expect(await card!.blob.text()).toBe("valid-old");
  });

  it("ignores corrupt cache entries and re-renders", async () => {
    await persistentCache.set(shareCardCacheKey(journeyData, "dark"), "garbage", 60_000);
    const card = await getShareCard(journeyData, "dark", dryRunOptions((t) => t.length * 10));
    expect(card).not.toBeNull();
    expect(card!.blob.type).toBe("image/png");
  });

  it("returns null when rendering fails with no cached card", async () => {
    const card = await getShareCard(journeyData, "dark", {
      measure: (t) => t.length * 10,
      fonts: { ready: () => Promise.resolve() },
      canvasFactory: () => {
        throw new Error("canvas unavailable");
      },
    });
    expect(card).toBeNull();
  });
});
