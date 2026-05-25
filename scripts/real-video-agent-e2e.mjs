import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;
const videoPath = process.env.E2E_VIDEO_PATH || "E:\\Downloads\\shot_4_final.mp4";
const outputDir = resolve("data/tmp/real-video-agent");
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";

await access(videoPath);
await mkdir(outputDir, { recursive: true });

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(150_000);
page.setDefaultNavigationTimeout(150_000);

const capturedGenerateResponses = [];
page.on("response", async (response) => {
  if (!response.url().includes("/api/generate") || response.status() !== 200) return;
  try {
    capturedGenerateResponses.push(await response.json());
  } catch {
    capturedGenerateResponses.push({ error: "failed to parse generate response" });
  }
});

await page.goto(baseUrl, { waitUntil: "networkidle" });

const firstPrompt =
  "请把这条视频拆解成一个 AI 短视频结构迁移样例：先识别画面中的科技感、空间关系、镜头节奏、字幕/包装/转场方法，再迁移成“SD2Lite 视频创作 Agent”的新品发布短视频方案。不要复制原片内容。";
await page.locator("#targetPrompt").fill(firstPrompt);
await page.locator("#productName").fill("SD2Lite 视频创作 Agent");
await page.locator("#targetAudience").fill("AI 创作者、短视频运营、参赛评委");
await page.locator("#sellingPoints").fill("单视频抽帧理解\n结构迁移而非复制\n素材不足自动补全\n可对话式迭代方案");

const uploadResponsePromise = page.waitForResponse((response) => response.url().includes("/api/upload/sample") && response.status() === 200, {
  timeout: 150_000
});
await page.locator("#sample-video").setInputFiles(videoPath);
const uploadJson = await (await uploadResponsePromise).json();

const firstGenerateResponsePromise = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200, {
  timeout: 150_000
});
await page.getByRole("button", { name: "开始 AI 拆解并生成方案" }).click();
await page.getByRole("heading", { name: "正在分析样例视频" }).waitFor({ state: "visible" });
const firstGenerateJson = await (await firstGenerateResponsePromise).json();
await page.locator(".video-agent-panel").waitFor({ state: "visible" });

const followUpPrompt =
  "继续作为视频 Agent，把中间分析过程说得更具体：列出关键帧数量、Hook、节奏、字幕层级、画面包装、转场、BGM 卡点和素材缺口补全策略，并让方案更适合参赛演示。";
const revisionResponsePromise = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200, {
  timeout: 150_000
});
await page.locator("#revisionPrompt").fill(followUpPrompt);
await page.getByRole("button", { name: "发送给视频 Agent" }).click();
const revisionGenerateJson = await (await revisionResponsePromise).json();
await page.locator(".video-agent-panel").waitFor({ state: "visible" });
await page.waitForTimeout(400);

const screenshotPath = resolve(outputDir, "result.png");
await page.screenshot({ path: screenshotPath, fullPage: true });

const domMetrics = {
  videoAgentPanelCount: await page.locator(".video-agent-panel").count(),
  userBubbleCount: await page.locator(".chat-row.user .agent-bubble").count(),
  aiBubbleCount: await page.locator(".chat-row.ai .agent-bubble").count(),
  toolCallCount: await page.locator(".agent-tool-call").count(),
  fallbackToolCount: await page.locator(".agent-tool-call.fallback").count(),
  revisionInputCount: await page.locator("#revisionPrompt").count(),
  uploadedVideoNameVisible: await page.getByText(basename(videoPath)).count()
};

await browser.close();

const evaluation = evaluateResult({
  uploadJson,
  firstGenerateJson,
  revisionGenerateJson,
  domMetrics,
  videoPath,
  firstPrompt,
  followUpPrompt
});

const initialJsonPath = resolve(outputDir, "initial-generate.json");
const revisionJsonPath = resolve(outputDir, "revision-generate.json");
const reportPath = resolve(outputDir, "report.json");
await writeFile(initialJsonPath, JSON.stringify(firstGenerateJson, null, 2), "utf8");
await writeFile(revisionJsonPath, JSON.stringify(revisionGenerateJson, null, 2), "utf8");
await writeFile(
  reportPath,
  JSON.stringify(
    {
      videoPath,
      uploadJson,
      domMetrics,
      capturedGenerateResponses: capturedGenerateResponses.length,
      initialJsonPath,
      revisionJsonPath,
      screenshotPath,
      evaluation
    },
    null,
    2
  ),
  "utf8"
);

const summary = {
  ok: evaluation.ok,
  score: evaluation.score,
  blockers: evaluation.blockers,
  warnings: evaluation.warnings,
  files: { reportPath, initialJsonPath, revisionJsonPath, screenshotPath },
  domMetrics
};
console.log(JSON.stringify(summary));

if (!evaluation.ok) {
  throw new Error(`Real video agent E2E failed reliability gate: ${evaluation.blockers.join("; ")}`);
}

function evaluateResult({ uploadJson, firstGenerateJson, revisionGenerateJson, domMetrics, videoPath, firstPrompt, followUpPrompt }) {
  const blockers = [];
  const warnings = [];
  const allText = JSON.stringify({ uploadJson, firstGenerateJson, revisionGenerateJson });
  const result = revisionGenerateJson;
  const sample = result?.samples?.[0];
  const video = sample?.video;
  const generated = result?.generated;
  const prompt = result?.source?.prompt ?? "";
  const slotMatches = generated?.compositionPlan?.slotMatches ?? [];
  const materialSegments = result?.material?.segments ?? [];
  const rationale = generated?.compositionPlan?.rationale ?? [];
  const timeline = generated?.timeline ?? [];
  const storyboard = generated?.storyboard ?? [];
  const packaging = generated?.packagingSuggestions ?? [];
  const trace = result?.agentTrace ?? [];
  const frameCount = video?.previewFrameCount ?? traceFrameCount(trace) ?? 0;

  if (uploadJson?.video?.fileName !== basename(videoPath)) blockers.push("upload response did not preserve the real uploaded filename");
  if (video?.fileName !== basename(videoPath)) blockers.push("generate result is not grounded in the uploaded video filename");
  if (!video?.durationSec || video.durationSec <= 0) blockers.push("video metadata duration is missing");
  if (!video?.width || !video?.height) blockers.push("video metadata resolution is missing");
  if (video?.localPath || video?.previewFrameDataUrls) blockers.push("public API leaked localPath or frame data URLs");
  if (frameCount < 1) blockers.push("no keyframe count reached the public result");
  if (!prompt.includes(firstPrompt.slice(0, 18))) blockers.push("first prompt is missing from generated source prompt");
  if (!prompt.includes("改片指令") || !prompt.includes(followUpPrompt.slice(0, 18))) blockers.push("follow-up Agent message was not included in regeneration prompt");
  if (!allText.includes("SD2Lite 视频创作 Agent")) blockers.push("custom product/brief did not survive generation");
  if (allText.includes("智能随行杯") || allText.includes("出门总是忘记喝水吗")) blockers.push("default mock copy leaked into real video result");
  if (timeline.length < 5) blockers.push("timeline has fewer than 5 structure items");
  if (storyboard.length < 5) blockers.push("storyboard has fewer than 5 items");
  if (slotMatches.length < 5) blockers.push("slot matching/gap diagnosis is incomplete");
  if (materialSegments.some((segment) => segment.endSec > video.durationSec + 0.2)) blockers.push("material segments exceed the real uploaded video duration");
  if (video.durationSec < result.source.targetDurationSec * 0.5 && !slotMatches.some((match) => match.status !== "matched")) {
    blockers.push("short source video did not produce any weak/missing material gap diagnosis");
  }
  if (packaging.length < 3) blockers.push("packaging suggestions are too thin");
  if (trace.length < 2) blockers.push("agent trace is missing tool evidence");
  if (domMetrics.videoAgentPanelCount !== 1) blockers.push("Agent panel did not render");
  if (domMetrics.userBubbleCount < 2) blockers.push("Agent conversation did not show initial + follow-up user turns");
  if (domMetrics.toolCallCount < 12) blockers.push("Agent tool flow did not render for both turns");
  if (domMetrics.revisionInputCount !== 1) blockers.push("Agent follow-up input is missing");

  if (result?.agentMode !== "tool-calling") warnings.push(`agent mode is ${result?.agentMode}; acceptable only if fallback is explicit`);
  if (domMetrics.fallbackToolCount > 0) warnings.push("vision/model API fell back; result must be treated as local-rule assisted rather than full model understanding");
  if (!rationale.some((item) => typeof item === "string" && item.includes("关键帧"))) warnings.push("rationale does not explicitly mention keyframes");
  if (!generated?.demo?.url) warnings.push("preview URL is missing");

  const score = Math.max(0, 100 - blockers.length * 14 - warnings.length * 4);
  return {
    ok: blockers.length === 0 && score >= 84,
    score,
    blockers,
    warnings,
    evidence: {
      fileName: video?.fileName,
      durationSec: video?.durationSec,
      resolution: video?.width && video?.height ? `${video.width}x${video.height}` : undefined,
      frameCount,
      timelineItems: timeline.length,
      storyboardItems: storyboard.length,
      slotMatches: slotMatches.length,
      weakOrMissingSlots: slotMatches.filter((match) => match.status !== "matched").length,
      materialSegments: materialSegments.map((segment) => ({ startSec: segment.startSec, endSec: segment.endSec, confidence: segment.confidence })),
      packagingSuggestions: packaging.length,
      agentTraceCount: trace.length,
      mode: result?.mode,
      agentMode: result?.agentMode
    }
  };
}

function traceFrameCount(trace) {
  if (!Array.isArray(trace)) return undefined;
  for (const item of trace) {
    const text = JSON.stringify(item?.observation ?? {});
    const match = text.match(/"frameCount"\s*:\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return undefined;
}
