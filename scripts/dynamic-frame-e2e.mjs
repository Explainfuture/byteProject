import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import playwrightModule from "playwright";

const playwright = playwrightModule.default ?? playwrightModule;
const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";
const outputDir = resolve("data/tmp/dynamic-frame-e2e");
const cases = [
  { name: "short-4s.webm", durationSec: 4, expectedFrames: 4 },
  { name: "long-31s.webm", durationSec: 31, expectedFrames: 8 }
];

await mkdir(outputDir, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true });
const results = [];

try {
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(180_000);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const videoFile = await createFixtureVideoFile(page, testCase);

    await page.locator("#targetPrompt").fill(`请分析 ${testCase.durationSec} 秒测试视频，迁移成产品发布短视频方案，并说明关键帧数量。`);
    await page.locator("#productName").fill(`动态抽帧测试 ${testCase.durationSec}s`);
    await page.locator("#targetAudience").fill("评审和开发者");
    await page.locator("#sellingPoints").fill("按视频时长抽帧\n结构迁移可解释\n素材缺口可诊断");

    const uploadResponsePromise = page.waitForResponse((response) => response.url().includes("/api/upload/sample") && response.status() === 200);
    await page.locator("#sample-video").setInputFiles(videoFile);
    const uploadJson = await (await uploadResponsePromise).json();

    const generateResponsePromise = page.waitForResponse((response) => response.url().includes("/api/generate") && response.status() === 200, {
      timeout: 180_000
    });
    await page.getByRole("button", { name: "开始 AI 拆解并生成方案" }).click();
    const generateJson = await (await generateResponsePromise).json();
    await page.getByRole("heading", { name: "爆款结构迁移结果" }).waitFor({ state: "visible" });

    const modelTrace = findTrace(generateJson, "analyze_sample_video");
    const frameCount = generateJson?.samples?.[0]?.video?.previewFrameCount ?? uploadJson?.video?.previewFrameCount ?? traceFrameCount(modelTrace);
    const usedVision = Boolean(modelTrace?.observation?.model?.usedVision);
    const result = {
      fileName: testCase.name,
      expectedFrames: testCase.expectedFrames,
      uploadFrameCount: uploadJson?.video?.previewFrameCount,
      resultFrameCount: generateJson?.samples?.[0]?.video?.previewFrameCount,
      traceFrameCount: traceFrameCount(modelTrace),
      durationSec: generateJson?.samples?.[0]?.video?.durationSec,
      agentMode: generateJson?.agentMode,
      usedVision,
      timelineItems: generateJson?.generated?.timeline?.length,
      slotMatches: generateJson?.generated?.compositionPlan?.slotMatches?.length
    };
    results.push(result);

    if (frameCount !== testCase.expectedFrames) {
      throw new Error(`${testCase.name} expected ${testCase.expectedFrames} frames, got ${frameCount}`);
    }
    if (generateJson?.agentMode !== "tool-calling") {
      throw new Error(`${testCase.name} did not use tool-calling mode`);
    }
    if (!usedVision) {
      throw new Error(`${testCase.name} did not return online vision analysis`);
    }
    if ((generateJson?.generated?.timeline?.length ?? 0) < 5) {
      throw new Error(`${testCase.name} did not generate a complete timeline`);
    }

    await page.close();
  }
} finally {
  await browser.close();
}

const report = { ok: true, cases: results };
await writeFile(resolve(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report));

async function createFixtureVideoFile(page, testCase) {
  const base64 = await page.evaluate(async ({ durationSec }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");

    const stream = canvas.captureStream(12);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });

    const stopped = new Promise((resolveRecorder) => recorder.addEventListener("stop", resolveRecorder, { once: true }));
    recorder.start();
    const start = performance.now();
    let frame = 0;
    while (performance.now() - start < durationSec * 1000) {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, frame % 2 ? "#111827" : "#202b3f");
      gradient.addColorStop(1, frame % 2 ? "#51406f" : "#116466");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255,255,255,0.92)";
      context.font = "700 38px sans-serif";
      context.fillText(`Duration ${durationSec}s`, 40, 150);
      context.font = "500 24px sans-serif";
      context.fillText(`Frame ${frame}`, 40, 205);
      frame += 1;
      await new Promise((resolveFrame) => setTimeout(resolveFrame, 84));
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
  }, { durationSec: testCase.durationSec });

  return {
    name: testCase.name,
    mimeType: "video/webm",
    buffer: Buffer.from(base64, "base64")
  };
}

function findTrace(result, toolName) {
  return (result?.agentTrace ?? []).find((item) => item.tool === toolName);
}

function traceFrameCount(trace) {
  const value = trace?.observation?.model?.frameCount ?? trace?.observation?.frameCount;
  return typeof value === "number" ? value : undefined;
}
