import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;
const sampleVideoPath = resolve("data/tmp/e2e-sample.mp4");
const materialVideoPath = resolve("data/tmp/e2e-material.mp4");

await writeFile(sampleVideoPath, "fake sample video payload for upload fallback", "utf8");
await writeFile(materialVideoPath, "fake material video payload for upload fallback", "utf8");

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(120_000);
page.setDefaultNavigationTimeout(120_000);

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

const startTitle = await page.getByRole("heading", { name: "爆款结构迁移引擎" }).innerText();
const uploadActionCount = await page.locator(".upload-action").count();
const promptCount = await page.locator("#targetPrompt").count();

await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/upload/sample") && response.status() === 200),
  page.locator("#sample-video").setInputFiles(sampleVideoPath)
]);

await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/upload/material") && response.status() === 200),
  page.locator("#material-video").setInputFiles(materialVideoPath)
]);

const responsePromise = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200, {
  timeout: 120_000
});
await page.getByRole("button", { name: "开始结构迁移" }).click();
await page.getByRole("heading", { name: "正在分析样例视频" }).waitFor({ state: "visible" });
const progressStepCount = await page.locator(".progress-step").count();
const generateResponse = await responsePromise;
const generateJson = await generateResponse.json();
const generationRationale = generateJson?.generated?.compositionPlan?.rationale ?? [];
const modelEnhanced = generationRationale.some(
  (item) => typeof item === "string" && (item.includes("Ark/Doubao") || item.includes("已完成在线模型创意增强"))
);
const agentMode = generateJson?.agentMode ?? "missing";
const agentTraceCount = Array.isArray(generateJson?.agentTrace) ? generateJson.agentTrace.length : 0;
await page.getByRole("heading", { name: "爆款结构迁移结果" }).waitFor({ state: "visible" });

const demoTitleCount = await page.getByRole("heading", { name: /已生成 .* 秒商品短视频草案/ }).count();
const fakeRemotionPlayerCount = await page.locator(".fake-remotion-player").count();
const phoneRemotionPlayerCount = await page.locator(".phone-remotion-player").count();
const naturalLanguageInputCount = await page.locator("#revisionPrompt").count();

await page.locator(".result-nav button", { hasText: "结构" }).click();
const mappingRowCount = await page.locator(".mapping-row").count();

await page.locator(".result-nav button", { hasText: "缺口" }).click();
const diagnosisCardCount = await page.locator(".diagnosis-card").count();

await page.locator(".result-nav button", { hasText: "时间线" }).click();
const timelineTrackCount = await page.locator(".light-track").count();

await page.locator(".result-nav button", { hasText: "成片" }).click();
const screenshotPath = resolve("data/tmp/ui-verification.png");
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

const result = {
  startTitle,
  uploadActionCount,
  promptCount,
  uploadedSample: sampleVideoPath,
  uploadedMaterial: materialVideoPath,
  modelEnhanced,
  agentMode,
  agentTraceCount,
  progressStepCount,
  demoTitleCount,
  fakeRemotionPlayerCount,
  phoneRemotionPlayerCount,
  naturalLanguageInputCount,
  mappingRowCount,
  diagnosisCardCount,
  timelineTrackCount,
  screenshotPath
};

await writeFile(resolve("data/tmp/ui-verification.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
