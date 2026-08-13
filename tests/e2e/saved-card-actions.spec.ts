import { test, expect, type Page } from "@playwright/test";

const now = Date.now();
const journeyMeta = {
  journeyId: "journey-actions",
  originLabel: "Östermalmstorg",
  destLabel: "Kista centrum",
  legs: [
    {
      originName: "Östermalmstorg",
      originSiteId: "100",
      destName: "Kista centrum",
      destSiteId: "200",
      transportType: "metro" as const,
      line: "11",
      lineName: "11",
      directionCode: 1,
      directionName: "Akalla",
      departureTime: now + 10 * 60_000,
      arrivalTime: now + 35 * 60_000,
      durationMin: 25,
      platformPosition: "middle" as const,
    },
  ],
  totalDurationMin: 25,
  transfers: 0,
  query: { origin: "Östermalmstorg", destination: "Kista centrum" },
  status: "planned" as const,
  updatedAt: now,
};

const routes = [
  {
    id: "actions-page",
    name: "Test",
    segments: [
      {
        id: "departure-actions",
        line: "6",
        lineName: "6",
        direction: { code: 1, destination: "Ropsten", stopPointId: "" },
        fromStop: { id: "from-1", name: "Jaktgatan", siteId: "100" },
        toStop: { id: "to-1", name: "Ropsten", siteId: "200" },
        transportType: "bus",
      },
      {
        id: "journey-actions",
        line: "11",
        lineName: "11",
        direction: { code: 1, destination: "Kista centrum", stopPointId: "" },
        fromStop: { id: "from-2", name: "Östermalmstorg", siteId: "300" },
        toStop: { id: "to-2", name: "Kista centrum", siteId: "400" },
        transportType: "metro",
        journeyMeta,
      },
    ],
  },
];

// Two pages so the saved-card sheet renders 4 actions (the genuine clip case)
// and the page-actions-menu shows "Delete page" (pages.length > 1 gate).
const twoPageRoutes = [
  ...routes,
  { id: "second-page", name: "Second", segments: [] },
];

async function prepare(
  page: Page,
  viewport: { width: number; height: number },
  routesOverride?: typeof routes,
) {
  const seededRoutes = routesOverride ?? routes;
  await page.setViewportSize(viewport);
  await page.route("**/*.integration.sl.se/**", async (route: any) => {
    const url = route.request().url();
    if (url.includes("departures")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          departures: [
            {
              line: { designation: "6" },
              direction_code: 1,
              destination: "Ropsten",
              display: "3 min",
            },
          ],
        }),
      });
    } else if (url.includes("deviations") || url.includes("messages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("journeyplanner") || url.includes("trip")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ trips: [] }),
      });
    } else {
      await route.continue();
    }
  });
  await page.addInitScript(
    (value: typeof routes) =>
      localStorage.setItem("nasta_routes", JSON.stringify(value)),
    seededRoutes,
  );
  await page.goto("/Nasta/", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content:
      "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await expect(page.locator(".departure-card")).toBeVisible({ timeout: 15000 });
}

async function expectJourneyActionsOnRight(page: Page) {
  const card = page.locator(".journey-card");
  await card.locator(".card-main").click();

  const share = card.getByRole("button", { name: "Share journey" });
  const more = card.getByRole("button", { name: /more actions/i });
  await expect(share).toBeVisible();
  await expect(more).toBeVisible();

  const [cardBox, shareBox, moreBox] = await Promise.all([
    card.boundingBox(),
    share.boundingBox(),
    more.boundingBox(),
  ]);
  expect(cardBox).not.toBeNull();
  expect(shareBox).not.toBeNull();
  expect(moreBox).not.toBeNull();

  const cardRight = cardBox!.x + cardBox!.width;
  expect(shareBox!.x).toBeGreaterThanOrEqual(cardBox!.x + cardBox!.width / 2);
  expect(moreBox!.x).toBeGreaterThan(shareBox!.x);
  expect(moreBox!.x + moreBox!.width).toBeLessThanOrEqual(cardRight + 1);
}

test.describe("saved card contextual actions", () => {
  for (const [name, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["tablet", { width: 768, height: 1024 }],
  ] as const) {
    test(`keeps journey Share and More grouped on the right at ${name} size`, async ({ page }) => {
      await prepare(page, viewport);
      await expectJourneyActionsOnRight(page);
    });
  }

  test("keeps the collapsed journey compact and expands into a route overview", async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 });
    const card = page.locator(".journey-card");
    await expect(card.locator(".journey-summary-top")).toBeVisible();
    await expect(card.locator(".timeline")).toHaveCount(0);
    const collapsedBox = await card.boundingBox();
    expect(collapsedBox?.height ?? 999).toBeLessThan(160);

    await card.locator(".card-main").click();
    await expect(card.locator('[data-testid="journey-route-overview"]')).toBeVisible();
    await expect(card.locator(".journey-detail-summary")).toBeVisible();
    await expect(card.locator(".timeline")).toBeVisible();
    await expect(card.locator(".journey-next-step")).toBeVisible();
  });

  test("uses a content-height mobile surface and clear departure identity", async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.locator(".departure-card .card-main").click();
    const departureCard = page.locator(".departure-card");
    const share = departureCard.getByRole("button", { name: "Share departure" });
    const more = departureCard.getByRole("button", { name: /more actions/i });
    await expect(share).toBeVisible();
    await expect(more).toBeVisible();
    const shareBox = await share.boundingBox();
    const moreBox = await more.boundingBox();
    expect(shareBox?.width).toBeGreaterThanOrEqual(44);
    expect(shareBox?.height).toBeGreaterThanOrEqual(44);
    expect(moreBox?.width).toBeGreaterThanOrEqual(44);
    expect(moreBox?.height).toBeGreaterThanOrEqual(44);
    await more.click();
    const sheet = page.locator(".sheet.saved-card-actions-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".action-context")).toContainText("Line 6");
    await expect(sheet.locator(".action-context")).toContainText(
      "Jaktgatan → Ropsten",
    );
    const box = await sheet.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(500);
  });

  test("uses an anchored desktop popover with equivalent journey actions", async ({
    page,
  }) => {
    await prepare(page, { width: 1024, height: 768 });
    await page.locator(".departure-card .card-main").click();
    await page.locator(".departure-card").getByRole("button", { name: /more actions/i }).click();
    await expect(page.locator(".sheet.saved-card-actions-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator(".journey-card .card-main").click();
    await page.locator(".journey-card .more-actions-button").click();
    const sheet = page.locator(".sheet.saved-card-actions-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator(".action-context")).toContainText(
      "Journey to Kista centrum",
    );
    await expect(sheet.locator(".action-context")).toContainText(
      "Östermalmstorg → Kista centrum",
    );
    const box = await sheet.boundingBox();
    expect(box?.height ?? 999).toBeLessThan(420);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(
      page.locator(".journey-card .more-actions-button"),
    ).toBeFocused();
  });

  test("keeps long-press and More on the same command set", async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 });
    const card = page.locator(".departure-card");
    await card.dispatchEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 8,
      clientX: 120,
      clientY: 120,
      button: 0,
    });
    const sheet = page.locator(".sheet.saved-card-actions-sheet");
    await expect(sheet).toBeVisible({ timeout: 2000 });
    await card.dispatchEvent("pointerup", {
      pointerType: "touch",
      pointerId: 8,
      clientX: 120,
      clientY: 120,
      button: 0,
    });
    const longPressActions = await sheet
      .locator(".action-button")
      .allTextContents();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card).toBeVisible();
    await card.locator(".card-main").click();
    const more = card.getByRole("button", { name: /more actions/i });
    await expect(more).toBeVisible();
    await more.click();
    const moreActions = await sheet.locator(".action-button").allTextContents();
    expect(longPressActions).toEqual(moreActions);
  });

  test("keeps the action surface legible in both color schemes", async ({
    page,
  }) => {
    await prepare(page, { width: 1024, height: 768 });
    await page.locator(".journey-card .card-main").click();
    await page.locator(".journey-card .more-actions-button").click();
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator(".sheet.saved-card-actions-sheet")).toBeVisible();
  });
});

async function assertLastActionReachable(
  sheet: ReturnType<Page["locator"]>,
  actionText: string,
  actionSelector = ".action-button",
) {
  // Guard 1: bottom inset actually consumed (old code: 50px).
  // If this isn't 34px the injected override never reached the sheet
  // (Chromium reports env()=0, so the test would pass vacuously otherwise).
  expect(await sheet.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe(
    "34px",
  );
  // Guard 2: top inset suppressed on the bottom sheet even though :root says 47px
  // (old code: 63px).
  expect(
    await sheet
      .locator(".sheet-header")
      .evaluate((el) => getComputedStyle(el).paddingTop),
  ).toBe("16px");
  // Reachability: last action is visible, within the sheet's bounds, and clickable.
  const lastAction = sheet.locator(actionSelector, { hasText: actionText });
  await expect(lastAction).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  const actionBox = await lastAction.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
    sheetBox!.y + sheetBox!.height + 1,
  );
  await lastAction.click({ trial: true });
}

test.describe("saved card safe-area PWA simulation", () => {
  test("keeps the saved-card last action reachable with nonzero safe-area insets", async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 }, twoPageRoutes);
    // Simulate PWA standalone insets (Chromium always reports env()=0 — issue #23611).
    await page.addStyleTag({
      content:
        ":root { --safe-area-inset-top: 47px; --safe-area-inset-bottom: 34px; }",
    });
    const activePage = page.locator(".page-slot:not(.page-slot-preview)");
    await activePage.locator(".departure-card .card-main").click();
    await activePage.locator(".departure-card").getByRole("button", { name: /more actions/i }).click();
    const sheet = activePage.locator(".sheet.saved-card-actions-sheet");
    await expect(sheet).toBeVisible();
    await assertLastActionReachable(sheet, "Remove departure");
  });

  test("keeps the page-menu last action reachable with nonzero safe-area insets", async ({
    page,
  }) => {
    await prepare(page, { width: 390, height: 844 }, twoPageRoutes);
    // Simulate PWA standalone insets.
    await page.addStyleTag({
      content:
        ":root { --safe-area-inset-top: 47px; --safe-area-inset-bottom: 34px; }",
    });
    await page.getByRole("button", { name: "Manage pages" }).click();
    const editor = page.locator(".sheet.editor-sheet");
    await expect(editor).toBeVisible();
    await editor.locator("[data-page-more-btn]").first().click();
    const menu = page.locator(".sheet.page-actions-menu");
    await expect(menu).toBeVisible();
    // Main view: direct reachability of its last action.
    // PageEditor menu buttons use .page-menu-action (unlike .action-button).
    await assertLastActionReachable(menu, "Delete page", ".page-menu-action");
    // Perform the single real click after reachability verification.
    const deleteAction = menu.locator(".page-menu-action.destructive", {
      hasText: "Delete page",
    });
    await expect(deleteAction).toBeVisible();
    await deleteAction.click();
    const cancelAction = menu.locator(".page-menu-action", {
      hasText: "Cancel",
    });
    await expect(cancelAction).toBeVisible();
    // Bounding box proof: the action fits within the sheet.
    const confirmBox = await cancelAction.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(confirmBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(
      menuBox!.y + menuBox!.height + 1,
    );
  });
});
