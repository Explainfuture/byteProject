import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);
page.setDefaultNavigationTimeout(120_000);

await page.addInitScript(() => window.localStorage.removeItem("byteproject:migration-history"));
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.locator(".workbench-shell").waitFor({ state: "visible" });

const generateButtonName = "发送给主智能体";
const startTitle = await page.locator(".input-panel .section-heading strong").first().innerText();
const uploadActionCount = await page.locator(".upload-action").count();
const promptCount = await page.locator("#targetPrompt").count();
const workbenchShellCount = await page.locator(".workbench-shell").count();
const sideNavCount = await page.locator(".workbench-sidenav").count();
const topNavCount = await page.locator(".workbench-topnav").count();
const studioWorkspaceCount = await page.locator(".studio-workspace").count();
const startAgentPanelCount = await page.locator(".start-agent-panel").count();
const agentReadyCount = await page.locator(".agent-ready-state").count();
const startRunningToolCount = await page.locator(".start-agent-flow .agent-tool-call.running").count();
const disabledShellButtonCount = await page.locator(".workbench-sidenav button:disabled, .workbench-topnav button:disabled").count();
const retiredShellTextCount = await page.getByText(/帮助|设置|升级方案|素材库|待接入|文档/).count();
const sideNavFooterCount = await page.locator(".sidenav-footer").count();
const startButtonInitiallyDisabled = await page.getByRole("button", { name: generateButtonName }).isDisabled();
if (workbenchShellCount !== 1 || sideNavCount !== 1 || topNavCount !== 1 || agentReadyCount !== 1 || startRunningToolCount !== 0) {
  throw new Error(
    `Stitch 工作台结构不完整。shell=${workbenchShellCount}, side=${sideNavCount}, top=${topNavCount}, ready=${agentReadyCount}, running=${startRunningToolCount}`
  );
}
if (disabledShellButtonCount !== 0 || retiredShellTextCount !== 0 || sideNavFooterCount !== 0) {
  throw new Error(
    `工作台仍有未接入入口。disabledShellButtons=${disabledShellButtonCount}, retiredText=${retiredShellTextCount}, footer=${sideNavFooterCount}`
  );
}
await assertBodyTextClean(page, "start");
const startDesktopScreenshotPath = resolve("data/tmp/ui-start-1440.png");
const startMobileScreenshotPath = resolve("data/tmp/ui-start-mobile.png");
await page.screenshot({ path: startDesktopScreenshotPath, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: startMobileScreenshotPath, fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });

await page.locator("#targetPrompt").fill("把这个横屏科技展示视频迁移成新品发布短视频方案，强调空间感和产品亮相。");
await page.locator(".brief-details").evaluate((node) => {
  node.open = true;
});
await page.locator("#productName").fill("横屏演示装置");
await page.locator("#targetAudience").fill("科技新品观众");
await page.locator("#sellingPoints").fill("空间感强\n产品亮相明确\n适合发布会开场");

const landscapeVideoFile = await createLandscapeVideoFile(page);
await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/upload/sample") && response.status() === 200),
  page.locator("#sample-video").setInputFiles(landscapeVideoFile)
]);
await page.waitForFunction((buttonName) => {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.some((button) => button.textContent?.includes(buttonName) && !button.disabled);
}, generateButtonName);

const responsePromise = page.waitForResponse((response) => response.url().includes("/api/generate/stream"), {
  timeout: 300_000
});
await page.getByRole("button", { name: generateButtonName }).click();
const generateResponse = await responsePromise;
if (generateResponse.status() !== 200) {
  throw new Error(`Generate request failed with HTTP ${generateResponse.status()}`);
}
const generateJson = parseRunResultFromSse(await generateResponse.text());
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
const benchmarkScore = generateJson?.benchmarkScore?.totalScore;
const benchmarkDimensionApiCount = Array.isArray(generateJson?.benchmarkScore?.dimensionScores) ? generateJson.benchmarkScore.dimensionScores.length : 0;
if (typeof benchmarkScore !== "number" || benchmarkDimensionApiCount < 6) {
  throw new Error("Generated result is missing a complete benchmarkScore.");
}
const iterationCount = Array.isArray(generateJson?.iterations) ? generateJson.iterations.length : 0;
const iterationsWithDemo = Array.isArray(generateJson?.iterations) ? generateJson.iterations.filter((iteration) => iteration?.demo?.url).length : 0;
if (iterationCount < 1 || iterationsWithDemo < 1) {
  throw new Error(`Generated result is missing per-iteration video output. iterations=${iterationCount}, demos=${iterationsWithDemo}`);
}
const iterationsWithRemotionArtifacts = Array.isArray(generateJson?.iterations)
  ? generateJson.iterations.filter((iteration) => iteration?.remotionArtifact?.remotionCode && iteration?.remotionArtifact?.dsl && iteration?.visualBenchmark?.score).length
  : 0;
if (iterationsWithRemotionArtifacts < iterationCount) {
  throw new Error(`Generated result did not persist per-iteration Remotion/Judge evidence. iterations=${iterationCount}, artifacts=${iterationsWithRemotionArtifacts}`);
}
await page.locator(".result-shell").waitFor({ state: "visible" });
await assertBodyTextClean(page, "result");

const demoTitleCount = await page.getByRole("heading", { name: /已生成(自动化视频草稿| .* 秒结构化预览)/ }).count();
const generatedVideoCount = await page.locator(".generated-video-card video").count();
const naturalLanguageInputCount = await page.locator("#revisionPrompt").count();
const videoAgentPanelCount = await page.locator(".video-agent-panel").count();
const agentToolCallCount = await page.locator(".agent-tool-call").count();
const agentToolHistoryCount = await page.locator(".agent-tool-history").count();
const runningAgentToolCallCount = await page.locator(".agent-tool-call.running").count();
const userAgentBubbleCount = await page.locator(".chat-row.user .agent-bubble").count();
const userAvatarCount = await page.locator(".chat-row.user .user-avatar").count();
const candidateIterationCardCount = await page.locator(".candidate-iteration-grid article").count();
const candidateIterationVideoCount = await page.locator(".candidate-iteration-grid video").count();
const candidateReasonCount = await page.locator(".candidate-reason").count();
const candidateEvidenceCount = await page.locator(".candidate-evidence").count();
const adaptiveVideoClasses = await page.locator(".adaptive-video-frame").evaluateAll((nodes) => nodes.map((node) => node.className));
const landscapeVideoFrameCount = adaptiveVideoClasses.filter((className) => className.includes("landscape")).length;
if (demoTitleCount < 1 || generatedVideoCount < 1) {
  throw new Error(`成片预览不完整。titles=${demoTitleCount}, generatedVideos=${generatedVideoCount}`);
}
if (videoAgentPanelCount !== 1 || agentToolCallCount !== 1 || agentToolHistoryCount !== 1 || runningAgentToolCallCount !== 0 || naturalLanguageInputCount !== 1 || userAgentBubbleCount < 1 || userAvatarCount < 1) {
  throw new Error(
    `智能体对话面板或预览区不完整。panel=${videoAgentPanelCount}, tools=${agentToolCallCount}, history=${agentToolHistoryCount}, runningTools=${runningAgentToolCallCount}, generatedVideos=${generatedVideoCount}, input=${naturalLanguageInputCount}, userBubbles=${userAgentBubbleCount}, userAvatars=${userAvatarCount}`
  );
}
if (candidateIterationCardCount < 1 || candidateIterationVideoCount < 1) {
  throw new Error(`每轮生成视频没有展示。cards=${candidateIterationCardCount}, videos=${candidateIterationVideoCount}`);
}
if (candidateReasonCount < candidateIterationCardCount || candidateEvidenceCount < candidateIterationCardCount) {
  throw new Error(`候选证据没有完整展示。reasons=${candidateReasonCount}, evidence=${candidateEvidenceCount}, cards=${candidateIterationCardCount}`);
}

await page.locator(".result-nav button", { hasText: "评分" }).click();
const benchmarkDimensionCount = await page.locator(".benchmark-dimensions article").count();

await page.locator(".result-nav button", { hasText: "结构" }).click();
const mappingRowCount = await page.locator(".mapping-row").count();

await page.locator(".result-nav button", { hasText: "缺口" }).click();
const diagnosisCardCount = await page.locator(".diagnosis-card").count();

await page.locator(".result-nav button", { hasText: "时间线" }).click();
const lightTimelineTrackCount = await page.locator(".light-track").count();
const lightTimelineItemCount = await page.locator(".track-item").count();
if (lightTimelineTrackCount < 4 || lightTimelineItemCount < 1) {
  throw new Error(`时间线视图不完整。tracks=${lightTimelineTrackCount}, items=${lightTimelineItemCount}`);
}
const timelineScreenshotPath = resolve("data/tmp/ui-timeline.png");
await page.screenshot({ path: timelineScreenshotPath, fullPage: true });

await page.locator(".result-nav button", { hasText: "成片" }).click();
const screenshotPath = resolve("data/tmp/ui-verification.png");
await page.screenshot({ path: screenshotPath, fullPage: true });

await page.getByRole("button", { name: "历史", exact: true }).click();
await page.locator(".history-shell").waitFor({ state: "visible" });
await assertBodyTextClean(page, "history");
const historyCardCount = await page.locator(".history-card").count();
const activeSideLabelsOnHistory = await page.locator(".sidenav-links button.active span").allInnerTexts();
const persistedHistoryCount = await page.evaluate(() => {
  const raw = window.localStorage.getItem("byteproject:migration-history");
  return raw ? JSON.parse(raw).length : 0;
});
if (historyCardCount < 1 || persistedHistoryCount < 1) {
  throw new Error(`历史功能没有记录本轮结果。cards=${historyCardCount}, persisted=${persistedHistoryCount}`);
}
if (!activeSideLabelsOnHistory.includes("历史记录")) {
  throw new Error(`历史页侧边栏当前项不正确：${activeSideLabelsOnHistory.join(",")}`);
}
const historyScreenshotPath = resolve("data/tmp/ui-history.png");
await page.screenshot({ path: historyScreenshotPath, fullPage: true });
await page.getByRole("button", { name: "打开结果" }).first().click();
await page.locator(".result-shell").waitFor({ state: "visible" });
const restoredResultPanelCount = await page.locator(".video-agent-panel").count();
if (restoredResultPanelCount !== 1) {
  throw new Error(`从历史打开结果失败。agentPanels=${restoredResultPanelCount}`);
}
await browser.close();

const result = {
  startTitle,
  uploadActionCount,
  promptCount,
  workbenchShellCount,
  sideNavCount,
  topNavCount,
  studioWorkspaceCount,
  startAgentPanelCount,
  agentReadyCount,
  startRunningToolCount,
  disabledShellButtonCount,
  retiredShellTextCount,
  sideNavFooterCount,
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
  benchmarkScore,
  benchmarkDimensionApiCount,
  iterationCount,
  iterationsWithDemo,
  iterationsWithRemotionArtifacts,
  benchmarkDimensionCount,
  demoTitleCount,
  generatedVideoCount,
  naturalLanguageInputCount,
  videoAgentPanelCount,
  agentToolCallCount,
  agentToolHistoryCount,
  runningAgentToolCallCount,
  userAgentBubbleCount,
  userAvatarCount,
  candidateIterationCardCount,
  candidateIterationVideoCount,
  candidateReasonCount,
  candidateEvidenceCount,
  mappingRowCount,
  diagnosisCardCount,
  lightTimelineTrackCount,
  lightTimelineItemCount,
  timelineScreenshotPath,
  screenshotPath,
  historyCardCount,
  persistedHistoryCount,
  activeSideLabelsOnHistory,
  historyScreenshotPath,
  restoredResultPanelCount
};

await writeFile(resolve("data/tmp/ui-verification.json"), JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result));
process.exit(0);

async function assertBodyTextClean(page, stage) {
  const text = await page.locator("body").innerText();
  const match = text.match(/�|锟|鍙|鎴|绔|妯|棰|瑙|鐢|淇|瀛|骞|浣|搴|杈|鍖|缂|鐖|鐨|杩|佺|榛|鈥/);
  if (match) {
    throw new Error(`页面存在疑似中文乱码。stage=${stage}, token=${match[0]}`);
  }
}

function parseRunResultFromSse(text) {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((frame) => frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n"))
    .filter(Boolean)
    .map((data) => JSON.parse(data));
  const resultEvent = events.findLast((event) => event.type === "run_result");
  if (!resultEvent?.result) throw new Error("Generate stream did not include run_result.");
  const startCount = events.filter((event) => event.type === "tool_use_start").length;
  const doneCount = events.filter((event) => event.type === "tool_use_end" || event.type === "tool_use_error").length;
  if (startCount < 2 || doneCount < 2) {
    throw new Error(`Generate stream did not include real tool events. starts=${startCount}, done=${doneCount}`);
  }
  return resultEvent.result;
}

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
