import { describe, expect, it } from "vitest";
import { getServiceWorkerUrl } from "./sw";

describe("getServiceWorkerUrl", () => {
  it("returns a base-aware service worker URL for trailing slash bases", () => {
    expect(getServiceWorkerUrl("/Nasta/")).toBe("/Nasta/sw.js");
  });

  it("normalizes base URLs without a trailing slash", () => {
    expect(getServiceWorkerUrl("/Nasta")).toBe("/Nasta/sw.js");
  });
});
