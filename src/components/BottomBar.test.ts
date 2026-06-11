import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import BottomBar from "./BottomBar.svelte";
import { getLocale, setLocale } from "../stores/localeStore.svelte";

beforeEach(() => setLocale("sv"));
afterEach(cleanup);

describe("BottomBar", () => {
  it('shows "Spara" when editing', () => {
    const { getByRole } = render(BottomBar, {
      props: { editing: true, onclick: vi.fn() },
    });
    expect(getByRole("button").textContent?.trim()).toBe("Spara");
  });

  it("fires onclick when Redigera is clicked", async () => {
    const onclick = vi.fn();
    const { getByRole } = render(BottomBar, {
      props: { editing: false, onclick },
    });
    await fireEvent.click(getByRole("button"));
    expect(onclick).toHaveBeenCalledOnce();
  });
});
