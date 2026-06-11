import { test, expect } from "@playwright/test";

test.describe("locale switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nasta_onboarding_seen", "true");
    });
    await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("domcontentloaded");
    await page.addStyleTag({
      content: `*, *::before, *::after { transition: none !important; animation: none !important; }`,
    });
  });

  function langGroup(page: import("@playwright/test").Page) {
    return page.getByRole("group", { name: /language|språk/i });
  }

  test("should start in English and switch between languages", async ({ page }) => {
    const actionBtn = page.locator(".action-btn");

    await expect(actionBtn).toContainText("Settings", { timeout: 10000 });

    await actionBtn.click();

    await expect(langGroup(page).getByRole("button").nth(0)).toContainText("English");
    await expect(langGroup(page).getByRole("button").nth(1)).toContainText("Swedish");

    await langGroup(page).getByRole("button").nth(1).click();
    await actionBtn.click();
    await page.waitForTimeout(100);

    await expect(actionBtn).toContainText("Inställningar", { timeout: 10000 });
  });

  test("should persist language preference after reload", async ({ page }) => {
    await page.locator(".action-btn").click();
    await langGroup(page).getByRole("button").nth(1).click();
    await page.locator(".action-btn").click();

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator(".action-btn")).toContainText("Inställningar", { timeout: 10000 });
  });

  test("no console errors during locale switching", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.locator(".action-btn").click();

    await langGroup(page).getByRole("button").nth(1).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(0).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(1).click();
    await page.waitForTimeout(50);
    await langGroup(page).getByRole("button").nth(0).click();
    await page.locator(".action-btn").click();

    expect(errors.filter((m) => !m.includes("ERR_FAILED") && !m.includes("ERR_ABORTED"))).toEqual([]);
  });
});
