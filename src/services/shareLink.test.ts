import { describe, it, expect, vi, afterEach } from "vitest";
import { shareUrl, shareFileName, shareTitleText, canShareFiles, shareIntent, copyShareLink } from "./shareLink";
import type { ShareIntent } from "../lib/shareModel";
import type { JourneyShareData, DepartureShareData, ShareCardRendererOptions } from "../lib/shareImageRenderer";

const journeyIntent: ShareIntent = { kind: "journey", origin: "T-Centralen", dest: "Slussen", timeMode: "now" };
const departureIntent: ShareIntent = {
  kind: "departure",
  siteId: "9192",
  stop: "T-Centralen",
  line: "7",
  direction: "Solna station",
  transportType: "tram",
};

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

const BASE = "https://example.com/Nasta/";

function fakeCanvas() {
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
    measureText: () => ({ width: 10 }),
    fillText: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    stroke: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
  };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })),
  };
}

function renderOpts(): ShareCardRendererOptions {
  return {
    measure: (t) => t.length * 10,
    fonts: { ready: () => Promise.resolve() },
    canvasFactory: () => fakeCanvas() as unknown as HTMLCanvasElement,
  };
}

function failingRenderOpts(): ShareCardRendererOptions {
  return {
    measure: (t) => t.length * 10,
    fonts: { ready: () => Promise.resolve() },
    canvasFactory: () => {
      throw new Error("no canvas");
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shareUrl / shareFileName / shareTitleText", () => {
  it("builds a share URL with base and versioned hash", () => {
    const url = shareUrl(journeyIntent, BASE);
    expect(url).toContain("https://example.com/Nasta/#share?");
    expect(url).toContain("v=1");
    expect(url).toContain("type=journey");
  });

  it("builds departure URLs", () => {
    const url = shareUrl(departureIntent, BASE);
    expect(url).toContain("#share?");
    expect(url).toContain("type=departure");
  });

  it("uses origin + BASE_URL by default", () => {
    const url = shareUrl(journeyIntent);
    expect(url).toContain(import.meta.env.BASE_URL);
    expect(url).toContain("#share?");
  });

  it("names files by kind", () => {
    expect(shareFileName(journeyIntent)).toBe("nasta-journey.png");
    expect(shareFileName(departureIntent)).toBe("nasta-departure.png");
  });

  it("builds share text from card data", () => {
    expect(shareTitleText(journeyIntent, journeyData)).toEqual({
      title: "T-Centralen → Slussen",
      text: "T-Centralen → Slussen",
    });
    expect(shareTitleText(departureIntent, departureData)).toEqual({
      title: "7 Solna station",
      text: "Från T-Centralen",
    });
  });
});

describe("canShareFiles", () => {
  it("true when share + canShare agree", () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => true });
    expect(canShareFiles()).toBe(true);
  });

  it("false when canShare is missing", () => {
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShareFiles()).toBe(false);
  });

  it("false when canShare declines files", () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => false });
    expect(canShareFiles()).toBe(false);
  });

  it("false when canShare throws", () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => { throw new Error("nope"); } });
    expect(canShareFiles()).toBe(false);
  });

  it("false when navigator is missing", () => {
    vi.stubGlobal("navigator", undefined);
    expect(canShareFiles()).toBe(false);
  });
});

describe("shareIntent", () => {
  it("shares a file when file sharing is supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const outcome = await shareIntent(journeyIntent, journeyData, "light", { baseUrl: BASE, render: renderOpts() });
    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.any(File)],
        title: "T-Centralen → Slussen",
        url: expect.stringContaining("#share?"),
      }),
    );
    const arg = share.mock.calls[0][0] as { files: File[] };
    expect(arg.files[0].name).toBe("nasta-journey.png");
    expect(arg.files[0].type).toBe("image/png");
  });

  it("falls back to text + URL when the card cannot be rendered", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const outcome = await shareIntent(departureIntent, departureData, "dark", {
      baseUrl: BASE,
      render: failingRenderOpts(),
    });
    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining("#share?") }));
    const arg = share.mock.calls[0][0] as { files?: File[] };
    expect(arg.files).toBeUndefined();
  });

  it("shares text + URL when file sharing is unsupported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => false });
    const outcome = await shareIntent(journeyIntent, journeyData, "light", { baseUrl: BASE });
    expect(outcome).toBe("shared");
    const arg = share.mock.calls[0][0] as { files?: File[]; url: string };
    expect(arg.files).toBeUndefined();
    expect(arg.url).toContain("#share?");
  });

  it("reports cancellation on AbortError", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("navigator", { share, canShare: () => false });
    const outcome = await shareIntent(journeyIntent, journeyData, "light", { baseUrl: BASE });
    expect(outcome).toBe("cancelled");
  });

  it("reports failure on other share errors", async () => {
    const share = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("navigator", { share, canShare: () => false });
    const outcome = await shareIntent(journeyIntent, journeyData, "light", { baseUrl: BASE });
    expect(outcome).toBe("failed");
  });

  it("is unsupported without Web Share", async () => {
    vi.stubGlobal("navigator", {});
    const outcome = await shareIntent(journeyIntent, journeyData, "light", { baseUrl: BASE });
    expect(outcome).toBe("unsupported");
  });
});

describe("copyShareLink", () => {
  it("copies via the async clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ok = await copyShareLink(journeyIntent, { baseUrl: BASE });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("#share?"));
  });

  it("falls back to execCommand without the clipboard API", async () => {
    const exec = vi.fn(() => true);
    vi.stubGlobal("navigator", {});
    document.execCommand = exec;
    const ok = await copyShareLink(journeyIntent, { baseUrl: BASE });
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.body.textContent).toBe("");
  });

  it("fails when clipboard rejects", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const ok = await copyShareLink(journeyIntent, { baseUrl: BASE });
    expect(ok).toBe(false);
  });
});
