import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);
page.setDefaultNavigationTimeout(120_000);

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

const generateButtonName = "开始 AI 拆解并生成方案";
const startTitle = await page.getByRole("heading", { name: "爆款结构迁移引擎" }).innerText();
const uploadActionCount = await page.locator(".upload-action").count();
const promptCount = await page.locator("#targetPrompt").count();
const studioWorkspaceCount = await page.locator(".studio-workspace").count();
const startButtonInitiallyDisabled = await page.getByRole("button", { name: generateButtonName }).isDisabled();
const startDesktopScreenshotPath = resolve("data/tmp/ui-start-1440.png");
const startMobileScreenshotPath = resolve("data/tmp/ui-start-mobile.png");
await page.screenshot({ path: startDesktopScreenshotPath, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: startMobileScreenshotPath, fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });

await page.locator("#targetPrompt").fill("把这个横屏科技展示视频迁移成新品发布短视频方案，强调空间感和产品亮相。");
await page.locator("#productName").fill("横屏演示装置");
await page.locator("#targetAudience").fill("科技新品观众");
await page.locator("#sellingPoints").fill("空间感强\n产品亮相明确\n适合发布会开场");

const landscapeVideoFile = await createLandscapeVideoFile(page);
await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/upload/sample") && response.status() === 200),
  page.locator("#sample-video").setInputFiles(landscapeVideoFile)
]);

const responsePromise = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200, {
  timeout: 120_000
});
await page.getByRole("button", { name: generateButtonName }).click();
await page.getByRole("heading", { name: "正在分析样例视频" }).waitFor({ state: "visible" });
const progressStepCount = await page.locator(".progress-step").count();
const generateResponse = await responsePromise;
const generateJson = await generateResponse.json();
const generatedJsonText = JSON.stringify(generateJson);
const usesCustomBrief = generatedJsonText.includes("横屏演示装置") && generatedJsonText.includes("空间感强");
const leakedDefaultMockTranscript = generatedJsonText.includes("出门总是忘记喝水吗") || generatedJsonText.includes("智能随行杯");
if (!usesCustomBrief || leakedDefaultMockTranscript) {
  throw new Error(
    `Generated result is not grounded in the uploaded brief. usesCustomBrief=${usesCustomBrief}, leakedDefaultMockTranscript=${leakedDefaultMockTranscript}`
  );
}
const generationRationale = generateJson?.generated?.compositionPlan?.rationale ?? [];
const mentionsUploadedFrames = generationRationale.some((item) => typeof item === "string" && item.includes("关键帧"));
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
const videoAgentPanelCount = await page.locator(".video-agent-panel").count();
const agentToolCallCount = await page.locator(".agent-tool-call").count();
const userAgentBubbleCount = await page.locator(".chat-row.user .agent-bubble").count();
const adaptiveVideoClasses = await page.locator(".adaptive-video-frame").evaluateAll((nodes) => nodes.map((node) => node.className));
const landscapeVideoFrameCount = adaptiveVideoClasses.filter((className) => className.includes("landscape")).length;
if (videoAgentPanelCount !== 1 || agentToolCallCount < 6 || naturalLanguageInputCount !== 1 || userAgentBubbleCount < 1) {
  throw new Error(
    `Agent conversation panel is incomplete. panel=${videoAgentPanelCount}, tools=${agentToolCallCount}, input=${naturalLanguageInputCount}, userBubbles=${userAgentBubbleCount}`
  );
}

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
  studioWorkspaceCount,
  startButtonInitiallyDisabled,
  startDesktopScreenshotPath,
  startMobileScreenshotPath,
  uploadedVideo: landscapeVideoFile.name,
  landscapeVideoFrameCount,
  usesCustomBrief,
  leakedDefaultMockTranscript,
  mentionsUploadedFrames,
  modelEnhanced,
  agentMode,
  agentTraceCount,
  progressStepCount,
  demoTitleCount,
  fakeRemotionPlayerCount,
  phoneRemotionPlayerCount,
  naturalLanguageInputCount,
  videoAgentPanelCount,
  agentToolCallCount,
  userAgentBubbleCount,
  mappingRowCount,
  diagnosisCardCount,
  timelineTrackCount,
  screenshotPath
};

await writeFile(resolve("data/tmp/ui-verification.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));

async function createLandscapeVideoFile(page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context is unavailable.");

    const stream = canvas.captureStream(12);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });

    const stopped = new Promise((resolveRecorder) => recorder.addEventListener("stop", resolveRecorder, { once: true }));
    recorder.start();
    for (let frame = 0; frame < 18; frame += 1) {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#111827");
      gradient.addColorStop(0.5, "#243244");
      gradient.addColorStop(1, "#51406f");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255,255,255,0.9)";
      context.font = "600 56px sans-serif";
      context.fillText("Landscape test video", 80 + frame * 8, 360);
      await new Promise((resolveFrame) => setTimeout(resolveFrame, 50));
    }
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    await stopped;

    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  });

  return {
    name: "landscape-fixture.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(base64, "base64")
  };
}
