import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { creativeReconstructionSkills } from "@byteproject/shared";
import type {
  AssetType,
  GapStrategy,
  GeneratedPlan,
  KnowledgeEntry,
  MatchStatus,
  MaterialSegment,
  SampleAnalysis,
  SourceInput,
  VideoMetadata
} from "@byteproject/shared";

const require = createRequire(import.meta.url);
const bundledFfmpegPath = require("ffmpeg-static") as string | null;
const bundledFfprobePath = (require("ffprobe-static") as { path?: string }).path;
const installerFfmpegPath = (require("@ffmpeg-installer/ffmpeg") as { path?: string }).path;
const DEFAULT_SECONDS_PER_VISION_FRAME = 4;
const DEFAULT_MIN_VISION_FRAMES = 4;
const DEFAULT_MAX_VISION_FRAMES = 16;

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
  { plan: GeneratedPlan; outputDir: string; materialVideo?: VideoMetadata; materialSegments?: MaterialSegment[] },
  { url: string; path: string }
> = {
  name: "Remotion Storyboard Renderer",
  inputSchema: "{ plan, outputDir, materialVideo?, materialSegments? }",
  outputSchema: "{ url, path }",
  requiredEnv: [],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 60_000,
  fallback: "Create an HTML storyboard preview if MP4 rendering is unavailable.",
  async run(input) {
    await mkdir(input.outputDir, { recursive: true });
    const htmlFileName = `${input.plan.id}.html`;
    const htmlPath = join(input.outputDir, htmlFileName);
    await writeFile(htmlPath, renderTimelineHtml(input.plan), "utf8");

    try {
      const mp4 = await renderTimelineMp4(input.plan, input.outputDir, input.materialVideo, input.materialSegments);
      return mp4;
    } catch {
      return {
        path: htmlPath,
        url: `/outputs/${htmlFileName}`
      };
    }
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
    requiredAssetTypes?: AssetType[];
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

    const uploadedFrames = normalizeUploadedFrameDataUrls(input.video.previewFrameDataUrls, input.video.durationSec);
    if (uploadedFrames.length) {
      return requestVideoUnderstanding(input, uploadedFrames);
    }

    if (!input.video.localPath) {
      return { provider: "mock", model, error: "Video localPath is missing; cannot sample visual frames." };
    }

    const sampled = await sampleVideoFrames(input.video.localPath, input.video.id, input.video.durationSec);
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
  rendererPrompt?: string;
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

export type ModelPlanComposerInput = {
  source: SourceInput;
  sample: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
};

export type ModelComposedVideoPlan = {
  script?: string;
  rendererPrompt?: string;
  slotMatches?: Array<{
    slotId?: string;
    status?: MatchStatus;
    assetIds?: string[];
    confidence?: number;
    reason?: string;
    gapPlan?: {
      strategy?: GapStrategy;
      output?: string;
    };
  }>;
  timeline?: Array<{
    id?: string;
    slotId?: string;
    startSec?: number;
    endSec?: number;
    assetIds?: string[];
    caption?: string;
    packaging?: string[];
    transition?: string;
    beatHint?: string;
  }>;
  storyboard?: Array<{
    id?: string;
    slotId?: string;
    title?: string;
    visual?: string;
    caption?: string;
    reason?: string;
  }>;
  packagingSuggestions?: string[];
  rationale?: string[];
};

export const modelPlanComposerAdapter: ToolProtocol<
  ModelPlanComposerInput,
  { provider: "ark" | "mock"; model?: string; plan?: ModelComposedVideoPlan; error?: string }
> = {
  name: "Ark Doubao Model Video Plan Composer",
  inputSchema: "{ source, sample, knowledge, materialSegments }",
  outputSchema: "ModelComposedVideoPlan",
  requiredEnv: ["ARK_BASE_URL", "ARK_API_KEY", "ARK_ENDPOINT_ID"],
  filePermissions: [],
  timeoutMs: 90_000,
  fallback: "Fail the generation instead of pretending a local heuristic plan is model-generated.",
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
            messages: buildModelPlanComposerMessages(input),
            temperature: 0.25,
            max_tokens: 2600
          })
        },
        90_000
      );

      if (!response.ok) {
        return { provider: "ark", model, error: `Ark model plan request failed with ${response.status}: ${await safeResponseText(response)}` };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) return { provider: "ark", model, error: "Ark response did not include message content." };

      return {
        provider: "ark",
        model,
        plan: normalizeModelComposedPlan(parseJsonObject(content))
      };
    } catch (error) {
      return {
        provider: "ark",
        model,
        error: error instanceof Error ? error.message : "Unknown Ark model plan adapter error."
      };
    }
  }
};

function renderTimelineHtml(plan: GeneratedPlan) {
  const blocks = plan.timeline
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

  const variants = plan.previewVariants
    .map(
      (variant) => `
        <article class="variant">
          <strong>${escapeHtml(variant.title)}</strong>
          <span>${escapeHtml(variant.renderer)}</span>
          <p>${escapeHtml(variant.description)}</p>
        </article>`
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
    main { width: min(980px, 100vw); margin: 0 auto; min-height: 100vh; background: #191b1f; }
    .phone { width: min(420px, 100%); margin: 0 auto; }
    .shot { min-height: 220px; padding: 28px; border-bottom: 1px solid rgba(255,255,255,.12); display: grid; align-content: center; gap: 12px; }
    .time { color: #70e0c1; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h2 { font-size: 34px; line-height: 1.08; margin: 0; }
    p { margin: 0; color: #d4d7dc; line-height: 1.6; }
    span { color: #ffcf66; font-size: 13px; }
    .variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; padding: 24px; border-bottom: 1px solid rgba(255,255,255,.12); }
    .variant { min-height: 120px; padding: 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; background: rgba(255,255,255,.06); }
    .variant strong { display: block; color: #fff; font-size: 18px; }
    .variant span { display: inline-block; margin-top: 8px; color: #70e0c1; }
    .variant p { margin: 10px 0 0; color: #d4d7dc; font-size: 13px; line-height: 1.5; }
    pre { white-space: pre-wrap; padding: 24px; color: #b7bec9; }
  </style>
</head>
<body>
  <main><section class="variants">${variants}</section><div class="phone">${blocks}</div><pre>${escapeHtml(plan.script)}</pre></main>
</body>
</html>`;
}

async function renderTimelineMp4(plan: GeneratedPlan, outputDir: string, materialVideo?: VideoMetadata, materialSegments: MaterialSegment[] = []) {
  const ffmpeg = resolveFfmpegPath();
  const fileName = `${plan.id}.mp4`;
  const assFileName = `${plan.id}.ass`;
  const outputPath = join(outputDir, fileName);
  await writeFile(join(outputDir, assFileName), renderTimelineAss(plan), "utf8");
  const hasStructuredMaterial = Boolean(materialVideo?.localPath && materialSegments.length);

  if (hasStructuredMaterial) {
    await renderSegmentTimelineMp4({
      ffmpeg,
      plan,
      outputDir,
      materialVideo: materialVideo!,
      materialSegments,
      assFileName,
      fileName
    });
    return {
      path: outputPath,
      url: `/outputs/${fileName}`
    };
  }

  await renderLoopBackgroundMp4({ ffmpeg, plan, outputDir, materialVideo, assFileName, fileName });
  return {
    path: outputPath,
    url: `/outputs/${fileName}`
  };
}

async function renderSegmentTimelineMp4(input: {
  ffmpeg: string;
  plan: GeneratedPlan;
  outputDir: string;
  materialVideo: VideoMetadata;
  materialSegments: MaterialSegment[];
  assFileName: string;
  fileName: string;
}) {
  const segmentById = new Map(input.materialSegments.map((segment) => [segment.id, segment]));
  const clipNames: string[] = [];

  for (const [index, item] of input.plan.timeline.entries()) {
    const clipName = `${input.plan.id}-clip-${String(index + 1).padStart(3, "0")}.mp4`;
    const segment = resolveTimelineSegment(item.assetIds, segmentById, input.materialSegments, index);
    const itemDuration = resolveTimelineItemDuration(item);

    if (segment && input.materialVideo.localPath) {
      const sourceName = `${input.plan.id}-source-${String(index + 1).padStart(3, "0")}.mp4`;
      await renderSourceSegmentClip(input.ffmpeg, input.outputDir, input.materialVideo.localPath, sourceName, segment);
      await renderLoopedClip(input.ffmpeg, input.outputDir, sourceName, clipName, itemDuration);
    } else {
      await renderCardClip(input.ffmpeg, input.outputDir, clipName, itemDuration, index);
    }

    clipNames.push(clipName);
  }

  const concatFileName = `${input.plan.id}-concat.txt`;
  const stitchedFileName = `${input.plan.id}-stitched.mp4`;
  await writeFile(join(input.outputDir, concatFileName), clipNames.map((name) => `file '${name.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await execJson(input.ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concatFileName, "-c", "copy", stitchedFileName], { cwd: input.outputDir });
  await execJson(
    input.ffmpeg,
    [
      "-y",
      "-i",
      stitchedFileName,
      "-vf",
      `ass=${input.assFileName}`,
      "-an",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      input.fileName
    ],
    { cwd: input.outputDir }
  );
}

async function renderSourceSegmentClip(ffmpeg: string, outputDir: string, sourcePath: string, fileName: string, segment: MaterialSegment) {
  const startSec = Math.max(0, Number(segment.startSec.toFixed(2)));
  const duration = Math.max(0.25, Number((segment.endSec - segment.startSec).toFixed(2)));
  await execJson(
    ffmpeg,
    [
      "-y",
      "-ss",
      String(startSec),
      "-i",
      sourcePath,
      "-t",
      String(duration),
      "-vf",
      baseVideoFilter(),
      "-an",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      fileName
    ],
    { cwd: outputDir }
  );
}

async function renderLoopedClip(ffmpeg: string, outputDir: string, sourceName: string, clipName: string, duration: number) {
  await execJson(
    ffmpeg,
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      sourceName,
      "-t",
      String(duration),
      "-vf",
      "fps=30,format=yuv420p",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clipName
    ],
    { cwd: outputDir }
  );
}

async function renderCardClip(ffmpeg: string, outputDir: string, clipName: string, duration: number, index: number) {
  await execJson(
    ffmpeg,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${cardColor(index)}:s=1080x1920:d=${duration}:r=30`,
      "-vf",
      "format=yuv420p",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clipName
    ],
    { cwd: outputDir }
  );
}

async function renderLoopBackgroundMp4(input: {
  ffmpeg: string;
  plan: GeneratedPlan;
  outputDir: string;
  materialVideo?: VideoMetadata;
  assFileName: string;
  fileName: string;
}) {
  const duration = String(resolvePlanDuration(input.plan));
  const videoFilter = [
    baseVideoFilter(),
    `ass=${input.assFileName}`
  ].join(",");
  const colorFilter = `ass=${input.assFileName}`;
  const hasMaterialVideo = Boolean(input.materialVideo?.localPath);
  const args = hasMaterialVideo
    ? [
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        input.materialVideo!.localPath!,
        "-t",
        duration,
        "-vf",
        videoFilter,
        "-an",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        input.fileName
      ]
    : [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x111317:s=1080x1920:d=${duration}:r=30`,
        "-vf",
        colorFilter,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        input.fileName
      ];

  await execJson(input.ffmpeg, args, { cwd: input.outputDir });
}

function baseVideoFilter() {
  return ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "setsar=1"].join(",");
}

function resolveTimelineSegment(assetIds: string[], segmentById: Map<string, MaterialSegment>, fallbackSegments: MaterialSegment[], timelineIndex: number) {
  if (!assetIds.length) return undefined;
  for (const assetId of assetIds) {
    const segment = segmentById.get(assetId);
    if (segment) return segment;
  }
  return fallbackSegments[timelineIndex % fallbackSegments.length];
}

function resolveTimelineItemDuration(item: { startSec: number; endSec: number }) {
  return Math.max(0.5, Number((item.endSec - item.startSec).toFixed(2)));
}

function cardColor(index: number) {
  const colors = ["0x111317", "0x1A2430", "0x241E2E", "0x203028", "0x2E2618"];
  return colors[index % colors.length];
}

function renderTimelineAss(plan: GeneratedPlan) {
  const events = plan.timeline
    .map((item, index) => {
      const start = formatAssTime(item.startSec);
      const end = formatAssTime(item.endSec);
      const title = `镜头 ${index + 1} · ${segmentTitle(item.slotId)} · ${item.startSec}s-${item.endSec}s`;
      const caption = item.caption || plan.id;
      const packaging = [...item.packaging.slice(0, 2), item.transition ? `转场：${item.transition}` : "", item.beatHint ? `节奏：${item.beatHint}` : ""]
        .filter(Boolean)
        .join(" / ");
      return [
        `Dialogue: 0,${start},${end},Top,,0,0,0,,${assText(title)}`,
        `Dialogue: 1,${start},${end},Main,,0,0,0,,${assText(caption)}`,
        packaging ? `Dialogue: 2,${start},${end},Bottom,,0,0,0,,${assText(packaging)}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Top, Microsoft YaHei, 42, &H00D9FFF7, &H00FFFFFF, &H00101517, &H99000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 3, 0, 8, 72, 72, 96, 1
Style: Main, Microsoft YaHei, 70, &H00FFFFFF, &H00FFFFFF, &H00101517, &HAA000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 5, 1, 5, 84, 84, 96, 1
Style: Bottom, Microsoft YaHei, 38, &H00F9E3C1, &H00FFFFFF, &H00101517, &HAA000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 3, 0, 2, 72, 72, 130, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

function resolvePlanDuration(plan: GeneratedPlan) {
  const duration = plan.timeline.at(-1)?.endSec ?? plan.previewVariants[0]?.targetDurationSec ?? 18;
  return Math.max(1, Math.min(60, Number(duration.toFixed(2))));
}

function formatAssTime(value: number) {
  const safe = Math.max(0, value);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function assText(value: string) {
  return value
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N")
    .replace(/,/g, "，")
    .slice(0, 120);
}

function segmentTitle(slotId: string) {
  if (/hook/i.test(slotId)) return "Hook";
  if (/body/i.test(slotId)) return "Body";
  if (/proof/i.test(slotId)) return "Proof";
  if (/offer/i.test(slotId)) return "Offer";
  if (/cta/i.test(slotId)) return "CTA";
  return "结构槽位";
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
  const selectedSkillIds = new Set(input.source.creativeSkillIds ?? []);
  const creativeSkills = creativeReconstructionSkills
    .filter((skill) => selectedSkillIds.has(skill.id))
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      remotionUse: skill.remotionUse,
      hyperframesUse: skill.hyperframesUse,
      guardrail: skill.guardrail
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
          rendererPrompt: "string，给 Remotion/Hyperframes 的结构化渲染提示，说明 10 个赛道预览如何按 timeline 拼接，时长必须小于等于 60 秒",
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
        creativeSkills,
        sampleSummary: input.sample.summary,
        slots,
        slotMatches: matches,
        currentTimeline,
        rendererPrompt: input.plan.rendererPrompt,
        previewVariants: input.plan.previewVariants,
        materialSegments: input.materialSegments,
        knowledgeAtoms: knowledge
      })
    }
  ];
}

function buildModelPlanComposerMessages(input: ModelPlanComposerInput) {
  const source = input.source;
  const selectedSkillIds = new Set(input.source.creativeSkillIds ?? []);
  const creativeSkills = creativeReconstructionSkills
    .filter((skill) => selectedSkillIds.has(skill.id))
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      remotionUse: skill.remotionUse,
      hyperframesUse: skill.hyperframesUse,
      guardrail: skill.guardrail
    }));
  const knowledgeAtoms = input.knowledge.flatMap((entry) => entry.atoms).slice(0, 10).map((atom) => ({
    id: atom.id,
    kind: atom.kind,
    name: atom.name,
    intent: atom.intent,
    outputHint: atom.outputHint,
    constraints: atom.constraints
  }));

  return [
    {
      role: "system",
      content:
        "You are the model director for an AI short-video structure-transfer system. You must analyze the extracted viral-video method, decide the slot-to-material mapping, and output a complete production recipe for the new video. Return strict JSON only. Do not use Markdown. Do not copy the sample video's exact visuals, subtitles, brands, people, audio, or original copy. Use only material segment ids provided by the user payload."
    },
    {
      role: "user",
      content: JSON.stringify({
        task:
          "Compose the final new-video production plan. The model, not local heuristics, must decide the transferable rules, slot matches, timeline order, captions, packaging, transitions, and expected visual effect. The backend renderer will only execute your recipe and write the MP4.",
        constraints: {
          outputDurationSec: source.targetDurationSec,
          aspectRatio: "9:16",
          useOnlyAssetIdsFrom: input.materialSegments.map((segment) => segment.id),
          ifMaterialMissing: "leave assetIds empty, mark the slot weak_match or missing, and provide a packaging/copy/reuse/aigc gapPlan",
          captions: "Chinese, short enough for mobile vertical video",
          preserveMeaning: "transfer structure and method only; never clone sample content"
        },
        outputSchema: {
          script: "string",
          rendererPrompt: "string; include the expected effect and how the backend should render the plan",
          slotMatches: [
            {
              slotId: "must be one of sample.slots[].id",
              status: "matched | weak_match | missing",
              assetIds: ["must be ids from materialSegments, or empty"],
              confidence: "number between 0 and 1",
              reason: "short observable reason",
              gapPlan: {
                strategy: "copy | packaging | reorder | reuse | aigc",
                output: "how to complete the missing visual expression"
              }
            }
          ],
          timeline: [
            {
              id: "stable id, e.g. timeline-1",
              slotId: "must match a slotMatches slotId",
              startSec: "number",
              endSec: "number",
              assetIds: ["ids from materialSegments or empty"],
              caption: "short Chinese caption",
              packaging: ["1-3 render instructions"],
              transition: "transition instruction",
              beatHint: "rhythm/BGM cue"
            }
          ],
          storyboard: [
            {
              id: "stable id",
              slotId: "slot id",
              title: "shot title",
              visual: "what should appear in this shot",
              caption: "caption",
              reason: "why this shot follows the extracted viral method"
            }
          ],
          packagingSuggestions: ["3-5 concrete packaging instructions"],
          rationale: ["3-5 short reasons explaining the extracted rule and the new-video transformation"]
        },
        source,
        extractedSampleRules: {
          summary: input.sample.summary,
          slots: input.sample.slots,
          atoms: input.sample.atoms,
          rhythmPattern: input.sample.rhythmPattern,
          packagingPattern: input.sample.packagingPattern,
          transcriptOverview: input.sample.transcript
        },
        creativeSkills,
        knowledgeAtoms,
        materialSegments: input.materialSegments
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
            frameSampling:
              `采用中等抽帧预算：${DEFAULT_MIN_VISION_FRAMES}-${DEFAULT_MAX_VISION_FRAMES} 张，约每 ${DEFAULT_SECONDS_PER_VISION_FRAME} 秒一帧；不要假设未看到的细节。`,
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
                  requiredAssetTypes: ["product_closeup | usage | comparison | person | scene | text_card | cover"],
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

async function sampleVideoFrames(filePath: string, videoId: string, durationSec?: number) {
  const ffmpeg = resolveFfmpegPath();
  const frameCount = resolveVisionFrameCount(durationSec);
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

function normalizeUploadedFrameDataUrls(value: string[] | undefined, durationSec?: number) {
  if (!Array.isArray(value)) return [];
  const frameCount = resolveVisionFrameCount(durationSec);
  return value
    .map((frame) => frame.match(/^data:image\/(?:jpeg|png);base64,(.+)$/)?.[1])
    .filter((frame): frame is string => Boolean(frame))
    .slice(0, frameCount);
}

function resolveVisionFrameCount(durationSec: number | undefined) {
  const configuredMin = Number(process.env.VISION_MIN_FRAME_COUNT ?? DEFAULT_MIN_VISION_FRAMES);
  const configuredMax = Number(process.env.VISION_MAX_FRAME_COUNT ?? DEFAULT_MAX_VISION_FRAMES);
  const configuredSecondsPerFrame = Number(process.env.VISION_SECONDS_PER_FRAME ?? DEFAULT_SECONDS_PER_VISION_FRAME);
  const minFrames = Number.isFinite(configuredMin) && configuredMin > 0 ? Math.round(configuredMin) : DEFAULT_MIN_VISION_FRAMES;
  const maxFrames = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.max(minFrames, Math.round(configuredMax)) : DEFAULT_MAX_VISION_FRAMES;
  const secondsPerFrame = Number.isFinite(configuredSecondsPerFrame) && configuredSecondsPerFrame > 0 ? configuredSecondsPerFrame : DEFAULT_SECONDS_PER_VISION_FRAME;
  const safeDuration = Number.isFinite(durationSec) && Number(durationSec) > 0 ? Number(durationSec) : 18;
  return Math.max(minFrames, Math.min(maxFrames, Math.ceil(safeDuration / secondsPerFrame)));
}

function resolveFfmpegPath() {
  return resolveBundledAwareBinary(process.env.FFMPEG_PATH, installerFfmpegPath || bundledFfmpegPath, "ffmpeg");
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
      requiredAssetTypes: cleanAssetTypes(candidate.requiredAssetTypes),
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
    rendererPrompt: typeof candidate.rendererPrompt === "string" ? candidate.rendererPrompt : undefined,
    timeline: Array.isArray(candidate.timeline) ? candidate.timeline : undefined,
    storyboard: Array.isArray(candidate.storyboard) ? candidate.storyboard : undefined,
    packagingSuggestions: cleanStringList(candidate.packagingSuggestions),
    rationale: cleanStringList(candidate.rationale)
  };
}

function normalizeModelComposedPlan(value: unknown): ModelComposedVideoPlan {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  return {
    script: typeof candidate.script === "string" ? candidate.script : undefined,
    rendererPrompt: typeof candidate.rendererPrompt === "string" ? candidate.rendererPrompt : undefined,
    slotMatches: cleanModelSlotMatches(candidate.slotMatches),
    timeline: cleanModelTimeline(candidate.timeline),
    storyboard: cleanModelStoryboard(candidate.storyboard),
    packagingSuggestions: cleanStringList(candidate.packagingSuggestions),
    rationale: cleanStringList(candidate.rationale)
  };
}

function cleanModelSlotMatches(value: unknown): ModelComposedVideoPlan["slotMatches"] {
  if (!Array.isArray(value)) return undefined;
  const allowedStatuses = new Set<MatchStatus>(["matched", "weak_match", "missing"]);
  const allowedStrategies = new Set<GapStrategy>(["copy", "packaging", "reorder", "reuse", "aigc"]);
  const matches: NonNullable<ModelComposedVideoPlan["slotMatches"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const slotId = typeof candidate.slotId === "string" ? candidate.slotId : undefined;
    if (!slotId) continue;
    const status = typeof candidate.status === "string" && allowedStatuses.has(candidate.status as MatchStatus) ? (candidate.status as MatchStatus) : undefined;
    const gapPlan = candidate.gapPlan && typeof candidate.gapPlan === "object" ? (candidate.gapPlan as Record<string, unknown>) : undefined;
    const strategy = typeof gapPlan?.strategy === "string" && allowedStrategies.has(gapPlan.strategy as GapStrategy) ? (gapPlan.strategy as GapStrategy) : undefined;
    matches.push({
      slotId,
      status,
      assetIds: cleanStringList(candidate.assetIds) ?? [],
      confidence: cleanUnitNumber(candidate.confidence),
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
      gapPlan: gapPlan
        ? {
            strategy,
            output: typeof gapPlan.output === "string" ? gapPlan.output : undefined
          }
        : undefined
    });
  }
  return matches.length ? matches.slice(0, 10) : undefined;
}

function cleanModelTimeline(value: unknown): ModelComposedVideoPlan["timeline"] {
  if (!Array.isArray(value)) return undefined;
  const timeline: NonNullable<ModelComposedVideoPlan["timeline"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const slotId = typeof candidate.slotId === "string" ? candidate.slotId : undefined;
    if (!slotId) continue;
    timeline.push({
      id: typeof candidate.id === "string" ? candidate.id : undefined,
      slotId,
      startSec: cleanNonNegativeNumber(candidate.startSec),
      endSec: cleanNonNegativeNumber(candidate.endSec),
      assetIds: cleanStringList(candidate.assetIds) ?? [],
      caption: typeof candidate.caption === "string" ? candidate.caption : undefined,
      packaging: cleanStringList(candidate.packaging) ?? [],
      transition: typeof candidate.transition === "string" ? candidate.transition : undefined,
      beatHint: typeof candidate.beatHint === "string" ? candidate.beatHint : undefined
    });
  }
  return timeline.length ? timeline.slice(0, 12) : undefined;
}

function cleanModelStoryboard(value: unknown): ModelComposedVideoPlan["storyboard"] {
  if (!Array.isArray(value)) return undefined;
  const storyboard: NonNullable<ModelComposedVideoPlan["storyboard"]> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const slotId = typeof candidate.slotId === "string" ? candidate.slotId : undefined;
    if (!slotId) continue;
    storyboard.push({
      id: typeof candidate.id === "string" ? candidate.id : undefined,
      slotId,
      title: typeof candidate.title === "string" ? candidate.title : undefined,
      visual: typeof candidate.visual === "string" ? candidate.visual : undefined,
      caption: typeof candidate.caption === "string" ? candidate.caption : undefined,
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined
    });
  }
  return storyboard.length ? storyboard.slice(0, 12) : undefined;
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return items.length ? items.slice(0, 8) : undefined;
}

function cleanAssetTypes(value: unknown): AssetType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set<AssetType>(["product_closeup", "usage", "comparison", "person", "scene", "text_card", "cover"]);
  const items = value.filter((item): item is AssetType => typeof item === "string" && allowed.has(item as AssetType));
  return items.length ? items.slice(0, 4) : undefined;
}

function cleanNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function cleanUnitNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
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

function execJson(command: string, args: string[], options: { cwd?: string } = {}) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, cwd: options.cwd });
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
