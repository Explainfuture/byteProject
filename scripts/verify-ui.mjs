import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

const title = await page.locator("h1").innerText();
const slotCount = await page.locator(".slot-node").count();
const structureTabCount = await page.getByRole("tab", { name: "结构迁移" }).count();

await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200),
  page.getByRole("button", { name: "生成新视频方案" }).click()
]);
await page.waitForLoadState("networkidle");
await page.locator(".timeline-block").first().waitFor({ state: "visible" });

const timelineCount = await page.locator(".timeline-block").count();
const previewLinkCount = await page.locator(".preview-link").count();
const screenshotPath = resolve("data/tmp/ui-verification.png");
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

const result = {
  title,
  slotCount,
  structureTabCount,
  timelineCount,
  previewLinkCount,
  screenshotPath
};

await writeFile(resolve("data/tmp/ui-verification.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
