import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import DisruptionList from "./DisruptionList.svelte";

afterEach(() => cleanup());

describe("DisruptionList", () => {
  it("keeps disruption nodes attached to their messages when reordered or removed", async () => {
    const initial = render(DisruptionList, {
      siteDevs: [{ message: "A" }, { message: "B" }],
      t: { disruptions: "Störningar" },
    });
    expect(Array.from(initial.container.querySelectorAll(".disruption-content p")).map((paragraph) => paragraph.textContent)).toEqual(["A", "B"]);
    initial.unmount();

    const reordered = render(DisruptionList, {
      siteDevs: [{ message: "B" }, { message: "A" }],
      t: { disruptions: "Störningar" },
    });
    expect(Array.from(reordered.container.querySelectorAll(".disruption-content p")).map((paragraph) => paragraph.textContent)).toEqual(["B", "A"]);
    reordered.unmount();

    const removed = render(DisruptionList, {
      siteDevs: [{ message: "A" }],
      t: { disruptions: "Störningar" },
    });
    expect(removed.container.querySelectorAll(".disruption-content p")).toHaveLength(1);
    expect(removed.container.querySelector(".disruption-content p")?.textContent).toBe("A");
  });
});
