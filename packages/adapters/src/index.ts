import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { GeneratedPlan, KnowledgeEntry, MaterialSegment, SampleAnalysis, SourceInput, TimelineItem, VideoMetadata } from "@byteproject/shared";

const require = createRequire(import.meta.url);
const bundledFfmpegPath = require("ffmpeg-static") as string | null;
const bundledFfprobePath = (require("ffprobe-static") as { path?: string }).path;

export type ToolProtocol<I, O> = {
  name: string;
  inputSchema: string;
  outputSchema: string;
  requiredEnv: string[];
  filePermissions: string[];
  timeoutMs: number;
  fallback: string;
  run(input: I): Promise<O>;
};

export const videoAnalyzerAdapter: ToolProtocol<
  { filePath: string; fileName: string; role: "sample" | "material"; sizeBytes?: number },
  VideoMetadata
> = {
  name: "FFmpeg Video Analyzer",
  inputSchema: "{ filePath, fileName, role, sizeBytes }",
  outputSchema: "VideoMetadata",
  requiredEnv: ["FFPROBE_PATH"],
  filePermissions: ["UPLOAD_DIR", "TMP_DIR"],
  timeoutMs: 15_000,
  fallback: "Use deterministic mock metadata when ffprobe is unavailable.",
  async run(input) {
    const ffprobe = resolveFfprobePath();
    try {
      const raw = await execJson(ffprobe, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        input.filePath
      ]);
      const data = JSON.parse(raw) as {
        format?: { duration?: string; size?: string };
        streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
      };
      const videoStream = data.streams?.find((stream) => stream.codec_type === "video");
      return {
        id: stableId(input.role, input.fileName),
        role: input.role,
        fileName: input.fileName,
        durationSec: Number(Number(data.format?.duration ?? 18).toFixed(1)),
        width: videoStream?.width ?? 1080,
        height: videoStream?.height ?? 1920,
        fps: parseFps(videoStream?.r_frame_rate),
        sizeBytes: Number(data.format?.size ?? input.sizeBytes ?? 0),
        localPath: input.filePath
      };
    } catch {
      return {
        id: stableId(input.role, input.fileName),
        role: input.role,
        fileName: input.fileName,
        durationSec: input.role === "sample" ? 18 : 48,
        width: 1080,
        height: 1920,
        fps: 30,
        sizeBytes: input.sizeBytes ?? 0,
        localPath: input.filePath
      };
    }
  }
};

export const remotionStoryboardAdapter: ToolProtocol<
  { plan: GeneratedPlan; outputDir: string },
  { url: string; path: string }
> = {
  name: "Remotion Storyboard Renderer",
  inputSchema: "{ plan, outputDir }",
  outputSchema: "{ url, path }",
  requiredEnv: [],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 10_000,
  fallback: "Create an HTML storyboard preview when Remotion renderer is not installed.",
  async run(input) {
    await mkdir(input.outputDir, { recursive: true });
    const fileName = `${input.plan.id}.html`;
    const outputPath = join(input.outputDir, fileName);
    await writeFile(outputPath, renderTimelineHtml(input.plan.timeline, input.plan.script), "utf8");
    return {
      path: outputPath,
      url: `/outputs/${fileName}`
    };
  }
};

export type ModelVideoUnderstandingInput = {
  video: VideoMetadata;
  role: "sample" | "material";
  prompt: string;
  productName?: string;
  targetDurationSec?: number;
};

export type ModelVideoUnderstanding = {
  summary?: string;
  transcript?: Array<{ startSec: number; endSec: number; text: string }>;
  slots?: Array<{
    segment?: "hook" | "body" | "proof" | "offer" | "cta";
    intent?: string;
    durationSec?: number;
    rhythmHint?: "fast" | "medium" | "slow";
    packagingHints?: string[];
  }>;
  rhythmPattern?: string;
  packagingPattern?: string[];
  shotCount?: number;
  visualNotes?: string[];
};

type VideoStructureSlotInsight = NonNullable<ModelVideoUnderstanding["slots"]>[number];

export const modelVideoUnderstandingAdapter: ToolProtocol<
  ModelVideoUnderstandingInput,
  { provider: "ark" | "mock"; model?: string; analysis?: ModelVideoUnderstanding; frameCount?: number; error?: string }
> = {
  name: "Ark Doubao Multimodal Video Understanding Adapter",
  inputSchema: "{ video, role, prompt, productName?, targetDurationSec? }",
  outputSchema: "{ provider, model, analysis?, frameCount?, error? }",
  requiredEnv: ["ARK_BASE_URL", "ARK_API_KEY", "ARK_ENDPOINT_ID", "FFMPEG_PATH"],
  filePermissions: ["UPLOAD_DIR", "TMP_DIR"],
  timeoutMs: 90_000,
  fallback: "Use deterministic rule-based sample analysis when video understanding is unavailable.",
  async run(input) {
    if (process.env.ENABLE_VISION_ANALYSIS === "false") {
      return { provider: "mock", error: "ENABLE_VISION_ANALYSIS is false." };
    }

    if ((process.env.LLM_PROVIDER ?? "ark") !== "ark") {
      return { provider: "mock", error: "LLM_PROVIDER is not ark." };
    }

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
    if (!apiKey || apiKey === "replace_me" || !model || model === "replace_me") {
      return { provider: "mock", error: "Ark credentials are not configured." };
    }

    const uploadedFrames = normalizeUploadedFrameDataUrls(input.video.previewFrameDataUrls);
    if (uploadedFrames.length) {
      return requestVideoUnderstanding(input, uploadedFrames);
    }

    if (!input.video.localPath) {
      return { provider: "mock", model, error: "Video localPath is missing; cannot sample visual frames." };
    }

    const sampled = await sampleVideoFrames(input.video.localPath, input.video.id);
    if (!sampled.frames.length) {
      return { provider: "ark", model, error: sampled.error ?? "No frames were extracted from the uploaded video." };
    }

    return requestVideoUnderstanding(input, sampled.frames);
  }
};

export type ModelEnhancementInput = {
  source: SourceInput;
  sample: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
  plan: GeneratedPlan;
};

export type ModelEnhancement = {
  script?: string;
  timeline?: Array<{
    id?: string;
    slotId?: string;
    caption?: string;
    packaging?: string[];
    transition?: string;
    beatHint?: string;
  }>;
  storyboard?: Array<{
    slotId?: string;
    title?: string;
    visual?: string;
    caption?: string;
    reason?: string;
  }>;
  packagingSuggestions?: string[];
  rationale?: string[];
};

export const modelCreativeAdapter: ToolProtocol<
  ModelEnhancementInput,
  { provider: "ark" | "mock"; model?: string; enhancement?: ModelEnhancement; error?: string }
> = {
  name: "Ark Doubao Creative Model Adapter",
  inputSchema: "{ source, sample, knowledge, materialSegments, plan }",
  outputSchema: "{ provider, model, enhancement?, error? }",
  requiredEnv: ["ARK_BASE_URL", "ARK_API_KEY", "ARK_ENDPOINT_ID"],
  filePermissions: [],
  timeoutMs: 75_000,
  fallback: "Return no enhancement and keep deterministic rule-based plan.",
  async run(input) {
    if ((process.env.LLM_PROVIDER ?? "ark") !== "ark") {
      return { provider: "mock", error: "LLM_PROVIDER is not ark." };
    }

    const apiKey = process.env.ARK_API_KEY;
    const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
    if (!apiKey || apiKey === "replace_me" || !model || model === "replace_me") {
      return { provider: "mock", error: "Ark credentials are not configured." };
    }

    try {
      const baseUrl = normalizeBaseUrl(process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3");
      const response = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: buildCreativeMessages(input),
            temperature: 0.45,
            max_tokens: 1800
          })
        },
        75_000
      );

      if (!response.ok) {
        return { provider: "ark", model, error: `Ark request failed with ${response.status}: ${await safeResponseText(response)}` };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return { provider: "ark", model, error: "Ark response did not include message content." };

      const enhancement = normalizeEnhancement(parseJsonObject(content));
      return { provider: "ark", model, enhancement };
    } catch (error) {
      return {
        provider: "ark",
        model,
        error: error instanceof Error ? error.message : "Unknown Ark adapter error."
      };
    }
  }
};

function renderTimelineHtml(timeline: TimelineItem[], script: string) {
  const blocks = timeline
    .map(
      (item) => `
        <section class="shot">
          <div class="time">${item.startSec}s - ${item.endSec}s</div>
          <h2>${escapeHtml(item.caption)}</h2>
          <p>${escapeHtml(item.packaging.join(" / "))}</p>
          <span>${escapeHtml(item.transition ?? "顺切")}</span>
        </section>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>低保真成片 Demo</title>
  <style>
    body { margin: 0; background: #101113; color: #f7f1e8; font-family: "Microsoft YaHei", sans-serif; }
    main { width: min(420px, 100vw); margin: 0 auto; min-height: 100vh; background: #191b1f; }
    .shot { min-height: 220px; padding: 28px; border-bottom: 1px solid rgba(255,255,255,.12); display: grid; align-content: center; gap: 12px; }
    .time { color: #70e0c1; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h2 { font-size: 34px; line-height: 1.08; margin: 0; }
    p { margin: 0; color: #d4d7dc; line-height: 1.6; }
    span { color: #ffcf66; font-size: 13px; }
    pre { white-space: pre-wrap; padding: 24px; color: #b7bec9; }
  </style>
</head>
<body>
  <main>${blocks}<pre>${escapeHtml(script)}</pre></main>
</body>
</html>`;
}

function buildCreativeMessages(input: ModelEnhancementInput) {
  const source = input.source;
  const slots = input.sample.slots.map((slot) => ({
    id: slot.id,
    segment: slot.segment,
    intent: slot.intent,
    requiredAssetTypes: slot.requiredAssetTypes,
    rhythmHint: slot.rhythmHint,
    packagingHints: slot.packagingHints
  }));
  const matches = input.plan.compositionPlan.slotMatches.map((match) => ({
    slotId: match.slotId,
    status: match.status,
    reason: match.reason,
    gapPlan: match.gapPlan
  }));
  const currentTimeline = input.plan.timeline.map((item) => ({
    id: item.id,
    slotId: item.slotId,
    startSec: item.startSec,
    endSec: item.endSec,
    caption: item.caption,
    packaging: item.packaging,
    transition: item.transition,
    beatHint: item.beatHint
  }));
  const knowledge = input.knowledge.flatMap((entry) => entry.atoms).slice(0, 8).map((atom) => ({
    id: atom.id,
    kind: atom.kind,
    name: atom.name,
    intent: atom.intent,
    outputHint: atom.outputHint
  }));

  return [
    {
      role: "system",
      content:
        "你是短视频结构迁移引擎的创意编排模块。只迁移样例结构和剪辑方法，禁止复制样例具体画面、人物、品牌、音频、字幕原文。必须输出严格 JSON，不要 Markdown，不要解释。"
    },
    {
      role: "user",
      content: JSON.stringify({
        task:
          "基于样例结构、新素材槽位匹配和知识原子，增强新视频方案。保持 timeline 的 id/slotId/startSec/endSec 不变，只改 caption、packaging、transition、beatHint、script、rationale。不要输出 storyboard。",
        outputSchema: {
          script: "string，中文，按段落输出，每段以【Hook/展开/证明/卖点/CTA】开头",
          timeline: [
            {
              id: "必须使用输入 timeline 的 id",
              slotId: "必须使用输入 timeline 的 slotId",
              caption: "短字幕，不超过 22 个中文字符",
              packaging: ["1-3 个包装建议"],
              transition: "转场建议",
              beatHint: "节奏/BGM 卡点建议"
            }
          ],
          packagingSuggestions: ["3-5 条包装建议"],
          rationale: ["3 条以内，说明如何迁移结构、如何补缺口"]
        },
        source,
        sampleSummary: input.sample.summary,
        slots,
        slotMatches: matches,
        currentTimeline,
        materialSegments: input.materialSegments,
        knowledgeAtoms: knowledge
      })
    }
  ];
}

function buildVideoUnderstandingMessages(input: ModelVideoUnderstandingInput, frames: string[]) {
  return [
    {
      role: "system",
      content:
        "你是短视频结构拆解助手。只分析用户上传视频的画面结构、镜头节奏、字幕包装和可能的口播/字幕内容，不复制原视频具体内容。必须输出严格 JSON，不要 Markdown，不要解释。"
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task:
              input.role === "sample"
                ? "根据这些从样例视频抽取的关键帧，拆解爆款短视频结构。输出脚本段落、Hook/Body/Proof/Offer/CTA 槽位、节奏、包装、字幕/语音概览。"
                : "根据这些从用户素材视频抽取的关键帧，识别可用于重构短视频的素材类型、画面内容和缺口。",
            video: {
              fileName: input.video.fileName,
              durationSec: input.video.durationSec,
              width: input.video.width,
              height: input.video.height,
              fps: input.video.fps
            },
            userGoal: input.prompt,
            productName: input.productName,
            targetDurationSec: input.targetDurationSec,
            outputSchema: {
              summary: "string，概括视频真实画面和结构，不超过80字",
              transcript: [{ startSec: "number", endSec: "number", text: "从字幕/画面文字/可推断口播得到的短句" }],
              slots: [
                {
                  segment: "hook | body | proof | offer | cta",
                  intent: "该段结构意图",
                  durationSec: "number",
                  rhythmHint: "fast | medium | slow",
                  packagingHints: ["字幕/标题条/贴纸/转场/封面等包装观察"]
                }
              ],
              rhythmPattern: "string",
              packagingPattern: ["string"],
              shotCount: "number",
              visualNotes: ["string"]
            }
          })
        },
        ...frames.map((frame) => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${frame}`,
            detail: "low"
          }
        }))
      ]
    }
  ];
}

async function requestVideoUnderstanding(input: ModelVideoUnderstandingInput, frames: string[]) {
  const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
  const apiKey = process.env.ARK_API_KEY;
  try {
    const baseUrl = normalizeBaseUrl(process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3");
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: buildVideoUnderstandingMessages(input, frames),
          temperature: 0.2,
          max_tokens: 1800
        })
      },
      90_000
    );

    if (!response.ok) {
      return { provider: "ark" as const, model, frameCount: frames.length, error: `Ark vision request failed with ${response.status}: ${await safeResponseText(response)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { provider: "ark" as const, model, frameCount: frames.length, error: "Ark vision response did not include message content." };

    return {
      provider: "ark" as const,
      model,
      frameCount: frames.length,
      analysis: normalizeVideoUnderstanding(parseJsonObject(content))
    };
  } catch (error) {
    return {
      provider: "ark" as const,
      model,
      frameCount: frames.length,
      error: error instanceof Error ? error.message : "Unknown Ark vision adapter error."
    };
  }
}

async function sampleVideoFrames(filePath: string, videoId: string) {
  const ffmpeg = resolveFfmpegPath();
  const frameCount = Number(process.env.VISION_FRAME_COUNT ?? 6);
  const tmpRoot = resolve(process.env.TMP_DIR ?? "data/tmp");
  const outputDir = join(tmpRoot, `vision-${videoId}-${Date.now()}`);
  await mkdir(outputDir, { recursive: true });

  try {
    await execJson(ffmpeg, [
      "-y",
      "-i",
      filePath,
      "-vf",
      `fps=1/3,scale='min(480,iw)':-2`,
      "-frames:v",
      String(frameCount),
      "-q:v",
      "4",
      join(outputDir, "frame-%02d.jpg")
    ]);
    const frameFiles = (await readdir(outputDir)).filter((file) => file.endsWith(".jpg")).sort().slice(0, frameCount);
    const frames = await Promise.all(frameFiles.map(async (file) => (await readFile(join(outputDir, file))).toString("base64")));
    return { frames };
  } catch (error) {
    return { frames: [], error: error instanceof Error ? error.message : "Failed to extract video frames." };
  }
}

function normalizeUploadedFrameDataUrls(value: string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .map((frame) => frame.match(/^data:image\/(?:jpeg|png);base64,(.+)$/)?.[1])
    .filter((frame): frame is string => Boolean(frame))
    .slice(0, Number(process.env.VISION_FRAME_COUNT ?? 6));
}

function resolveFfmpegPath() {
  return resolveBundledAwareBinary(process.env.FFMPEG_PATH, bundledFfmpegPath, "ffmpeg");
}

function resolveFfprobePath() {
  return resolveBundledAwareBinary(process.env.FFPROBE_PATH, bundledFfprobePath, "ffprobe");
}

function resolveBundledAwareBinary(configuredValue: string | undefined, bundledPath: string | null | undefined, commandName: string) {
  const configured = configuredValue?.trim();
  if (configured && configured !== commandName) return configured;
  return bundledPath || configured || commandName;
}

function normalizeVideoUnderstanding(value: unknown): ModelVideoUnderstanding {
  if (!value || typeof value !== "object") return {};
  const candidate = value as ModelVideoUnderstanding;
  return {
    summary: typeof candidate.summary === "string" ? candidate.summary : undefined,
    transcript: cleanTranscript(candidate.transcript),
    slots: cleanSlots(candidate.slots),
    rhythmPattern: typeof candidate.rhythmPattern === "string" ? candidate.rhythmPattern : undefined,
    packagingPattern: cleanStringList(candidate.packagingPattern),
    shotCount: typeof candidate.shotCount === "number" && Number.isFinite(candidate.shotCount) ? Math.max(1, Math.round(candidate.shotCount)) : undefined,
    visualNotes: cleanStringList(candidate.visualNotes)
  };
}

function cleanTranscript(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const candidate = item as { startSec?: unknown; endSec?: unknown; text?: unknown };
      if (typeof candidate.text !== "string" || !candidate.text.trim()) return undefined;
      return {
        startSec: typeof candidate.startSec === "number" ? candidate.startSec : 0,
        endSec: typeof candidate.endSec === "number" ? candidate.endSec : 0,
        text: candidate.text.trim()
      };
    })
    .filter((item): item is { startSec: number; endSec: number; text: string } => Boolean(item));
  return lines.length ? lines.slice(0, 12) : undefined;
}

function cleanSlots(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const allowedSegments = new Set(["hook", "body", "proof", "offer", "cta"]);
  const allowedRhythm = new Set(["fast", "medium", "slow"]);
  const slots: VideoStructureSlotInsight[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const segment = typeof candidate.segment === "string" && allowedSegments.has(candidate.segment) ? candidate.segment : undefined;
    const rhythmHint = typeof candidate.rhythmHint === "string" && allowedRhythm.has(candidate.rhythmHint) ? candidate.rhythmHint : undefined;
    slots.push({
      segment: segment as VideoStructureSlotInsight["segment"],
      intent: typeof candidate.intent === "string" ? candidate.intent : undefined,
      durationSec: typeof candidate.durationSec === "number" && Number.isFinite(candidate.durationSec) ? candidate.durationSec : undefined,
      rhythmHint: rhythmHint as VideoStructureSlotInsight["rhythmHint"],
      packagingHints: cleanStringList(candidate.packagingHints)
    });
  }
  return slots.length ? slots.slice(0, 8) : undefined;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function parseJsonObject(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(trimmed) as unknown;
}

function normalizeEnhancement(value: unknown): ModelEnhancement {
  if (!value || typeof value !== "object") return {};
  const candidate = value as ModelEnhancement;
  return {
    script: typeof candidate.script === "string" ? candidate.script : undefined,
    timeline: Array.isArray(candidate.timeline) ? candidate.timeline : undefined,
    storyboard: Array.isArray(candidate.storyboard) ? candidate.storyboard : undefined,
    packagingSuggestions: cleanStringList(candidate.packagingSuggestions),
    rationale: cleanStringList(candidate.rationale)
  };
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return items.length ? items.slice(0, 8) : undefined;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function safeResponseText(response: Response) {
  const text = await response.text();
  return text.slice(0, 500);
}

function execJson(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

function parseFps(rate?: string) {
  if (!rate) return 30;
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!numerator || !denominator) return 30;
  return Number((numerator / denominator).toFixed(2));
}

function stableId(role: string, fileName: string) {
  return `${role}-${Buffer.from(fileName).toString("base64url").slice(0, 12)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
