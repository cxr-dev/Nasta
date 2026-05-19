import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("nasta_settings", JSON.stringify({ language: "sv" }));
});
await page.goto("http://localhost:5173/Nasta/", { waitUntil: "networkidle" });
console.log("url", await page.url());
console.log("empty visible", await page.isVisible(".empty-cta"));
await page.click(".empty-cta");
await page.waitForTimeout(2000);
console.log(
  "overlay open count",
  await page.$$eval(".editor-overlay.open", (els) => els.length),
);
console.log("overlay visible", await page.isVisible(".editor-overlay.open"));
console.log(
  "search container visible",
  await page.isVisible(".search-container"),
);
console.log("hint visible", await page.isVisible(".onboarding-hint"));
console.log(
  "location prompt visible",
  await page.isVisible(".location-prompt"),
);
await browser.close();
