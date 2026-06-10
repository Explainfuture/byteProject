import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FRAME_BUDGET, creativeReconstructionSkills, frameSampleCountForDuration, normalizeFrameBudget } from "@byteproject/shared";
import type {
  AssetType,
  BenchmarkScore,
  GapStrategy,
  GeneratedPlan,
  KnowledgeEntry,
  MatchStatus,
  MaterialSegment,
  RemotionCompositionDsl,
  SampleAnalysis,
  SourceInput,
  VideoMetadata
} from "@byteproject/shared";

const require = createRequire(import.meta.url);
const bundledFfmpegPath = require("ffmpeg-static") as string | null;
const bundledFfprobePath = (require("ffprobe-static") as { path?: string }).path;
const installerFfmpegPath = (require("@ffmpeg-installer/ffmpeg") as { path?: string }).path;
const REMOTION_STORYBOARD_COMPOSITION_ID = "ByteProjectStoryboard";

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
  { plan: GeneratedPlan; outputDir: string; materialVideo?: VideoMetadata; materialSegments?: MaterialSegment[]; remotionDsl?: RemotionCompositionDsl; remotionCode?: string },
  { url: string; path: string }
> = {
  name: "Remotion Storyboard Renderer",
  inputSchema: "{ plan, outputDir, materialVideo?, materialSegments? }",
  outputSchema: "{ url, path }",
  requiredEnv: [],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 240_000,
  fallback: "Render a Remotion MP4 by default; HTML fallback is disabled unless explicitly enabled.",
  async run(input) {
    await mkdir(input.outputDir, { recursive: true });

    try {
      const mp4 = await renderTimelineMp4(input.plan, input.outputDir, input.materialVideo, input.materialSegments);
      return mp4;
    } catch (error) {
      if (process.env.ENABLE_HTML_PREVIEW_FALLBACK !== "true") throw error;
      const htmlFileName = `${input.plan.id}.html`;
      const htmlPath = join(input.outputDir, htmlFileName);
      await writeFile(htmlPath, renderTimelineHtml(input.plan), "utf8");
      return {
        path: htmlPath,
        url: `/outputs/${htmlFileName}`
      };
    }
  }
};

export type SeedanceRemotionCoderInput = {
  source: SourceInput;
  sample: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
  plan: GeneratedPlan;
  iterationIndex: number;
  rewriteBrief?: string;
  previousCandidateId?: string;
};

export type SeedanceRemotionCoderOutput = {
  provider: "seedance" | "mock";
  model?: string;
  dsl?: RemotionCompositionDsl;
  remotionCode?: string;
  notes?: string[];
  error?: string;
};

export const seedanceRemotionCoderAdapter: ToolProtocol<SeedanceRemotionCoderInput, SeedanceRemotionCoderOutput> = {
  name: "Seedance Remotion Coder",
  inputSchema: "{ source, sample, knowledge, materialSegments, plan, iterationIndex, rewriteBrief? }",
  outputSchema: "{ provider, model?, dsl?, remotionCode?, notes?, error? }",
  requiredEnv: ["ARK_BASE_URL", "ARK_API_KEY", "ARK_ENDPOINT_ID"],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 90_000,
  fallback: "Return a visibly marked mock Remotion DSL/code artifact that cannot pass formal benchmark.",
  async run(input) {
    const model = process.env.SEEDANCE_REMOTION_MODEL || process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
    if (!canUseArkModel(model)) return buildMockSeedanceRemotionOutput(input, "Seedance Remotion Coder is not configured.");

    try {
      return await requestSeedanceRemotionCode(input, model);
    } catch (error) {
      return buildMockSeedanceRemotionOutput(input, error instanceof Error ? error.message : "Seedance Remotion Coder request failed.");
    }
  }
};

export type VisualBenchmarkJudgeInput = {
  source: SourceInput;
  sample: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
  plan: GeneratedPlan;
  candidateId: string;
  iterationIndex: number;
  renderedVideo: { url: string; path: string };
  remotionDsl: RemotionCompositionDsl;
  remotionCode: string;
  previousScore?: BenchmarkScore;
  rewriteBrief?: string;
};

export type VisualBenchmarkJudgeOutput = {
  provider: "ark" | "mock";
  model?: string;
  score?: BenchmarkScore;
  frameEvidence?: Array<{ frameUrl: string; framePath?: string; timestampSec: number; observation: string }>;
  reasons?: string[];
  nextRewriteBrief?: string;
  error?: string;
};

export const visualBenchmarkJudgeAdapter: ToolProtocol<VisualBenchmarkJudgeInput, VisualBenchmarkJudgeOutput> = {
  name: "Visual Benchmark Judge",
  inputSchema: "{ source, sample, materialSegments, candidateId, renderedVideo, remotionDsl, remotionCode }",
  outputSchema: "{ provider, model?, score?, frameEvidence?, reasons?, nextRewriteBrief?, error? }",
  requiredEnv: ["ARK_BASE_URL", "ARK_API_KEY", "ARK_ENDPOINT_ID", "FFMPEG_PATH"],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 90_000,
  fallback: "Return an explicit mock-mode failing benchmark instead of pretending the video passed.",
  async run(input) {
    const model = process.env.VISUAL_JUDGE_MODEL || process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
    if (!canUseArkModel(model)) return buildMockVisualJudgeOutput(input, "Visual Benchmark Judge is not configured.");

    try {
      const frames = await sampleRenderedVideoEvidenceFrames(input.renderedVideo.path, input.renderedVideo.url, input.candidateId);
      if (!frames.length) return buildMockVisualJudgeOutput(input, "Visual Benchmark Judge could not extract rendered frames.");
      return await requestVisualBenchmarkJudgement(input, model, frames);
    } catch (error) {
      return buildMockVisualJudgeOutput(input, error instanceof Error ? error.message : "Visual Benchmark Judge request failed.");
    }
  }
};

function canUseArkModel(model: string | undefined): model is string {
  if ((process.env.LLM_PROVIDER ?? "ark") !== "ark") return false;
  const apiKey = process.env.ARK_API_KEY;
  return Boolean(apiKey && apiKey !== "replace_me" && model && model !== "replace_me");
}

function buildMockSeedanceRemotionOutput(input: SeedanceRemotionCoderInput, reason?: string): SeedanceRemotionCoderOutput {
  const dsl = buildFallbackRemotionDsl(input);
  return {
    provider: "mock",
    model: "mock-seedance-remotion-coder",
    dsl,
    remotionCode: compileRemotionDslToCode(dsl),
    notes: [
      reason ?? "Mock mode: Seedance Remotion Coder is not configured.",
      "Mock mode: Seedance Remotion Coder is not configured, so this candidate cannot formally pass benchmark."
    ],
    error: reason
  };
}

function buildMockVisualJudgeOutput(input: VisualBenchmarkJudgeInput, reason?: string): VisualBenchmarkJudgeOutput {
  const displayReason = reason ?? "Visual Benchmark Judge is not configured.";
  return {
    provider: "mock",
    model: "mock-visual-benchmark-judge",
    frameEvidence: [
      {
        frameUrl: input.renderedVideo.url,
        timestampSec: 0,
        observation: "Mock judge did not inspect rendered frames."
      }
    ],
    reasons: [displayReason],
    nextRewriteBrief: "Configure the visual judge model before claiming benchmark pass.",
    score: createMockVisualBenchmarkScore(input)
  };
}

async function requestSeedanceRemotionCode(input: SeedanceRemotionCoderInput, model: string): Promise<SeedanceRemotionCoderOutput> {
  const response = await requestArkChatContent(
    model,
    buildSeedanceRemotionMessages(input),
    90_000,
    2600,
    0.35
  );
  const parsed = parseJsonObject(response) as {
    dsl?: unknown;
    remotionCode?: unknown;
    notes?: unknown;
  };
  const dsl = normalizeRemotionDsl(parsed.dsl, input);
  const remotionCode = typeof parsed.remotionCode === "string" && parsed.remotionCode.trim()
    ? parsed.remotionCode.trim()
    : compileRemotionDslToCode(dsl);
  return {
    provider: "seedance",
    model,
    dsl,
    remotionCode,
    notes: cleanStringList(parsed.notes) ?? []
  };
}

function buildSeedanceRemotionMessages(input: SeedanceRemotionCoderInput) {
  return [
    {
      role: "system",
      content:
        "You are Seedance 2.0 Lite acting as a Remotion code subagent. Rewrite the current video plan into a fresh Remotion composition candidate. Return strict JSON only. Do not copy source-video content verbatim; transfer structure, pacing, slots, and packaging. Each iteration must make a real structural change when rewriteBrief is present."
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate a Remotion candidate DSL and code for this iteration.",
        iterationIndex: input.iterationIndex,
        previousCandidateId: input.previousCandidateId,
        rewriteBrief: input.rewriteBrief,
        source: input.source,
        extractedSample: {
          summary: input.sample.summary,
          slots: input.sample.slots,
          rhythmPattern: input.sample.rhythmPattern,
          packagingPattern: input.sample.packagingPattern
        },
        materialSegments: input.materialSegments,
        currentPlan: {
          id: input.plan.id,
          script: input.plan.script,
          timeline: input.plan.timeline,
          rendererPrompt: input.plan.rendererPrompt,
          rationale: input.plan.compositionPlan.rationale
        },
        outputSchema: {
          dsl: {
            version: 1,
            candidateName: "string",
            scenes: [
              {
                id: "string",
                startSec: "number",
                endSec: "number",
                layout: "centered_caption | split_reveal | product_card | media_clip | cta",
                caption: "short caption",
                assetIds: ["material segment ids"],
                motion: "slow_push | snap_zoom | pan | cut | hold"
              }
            ]
          },
          remotionCode: "TypeScript React component code using the DSL scene sequence",
          notes: ["short implementation notes"]
        }
      })
    }
  ];
}

type RenderedEvidenceFrame = {
  frameUrl: string;
  framePath: string;
  timestampSec: number;
  base64: string;
};

type JudgeFrameEvidence = NonNullable<VisualBenchmarkJudgeOutput["frameEvidence"]>[number];

async function sampleRenderedVideoEvidenceFrames(filePath: string, renderedVideoUrl: string, candidateId: string): Promise<RenderedEvidenceFrame[]> {
  const ffmpeg = resolveFfmpegPath();
  const frameCount = 6;
  const outputDir = join(dirname(filePath), "candidates", candidateId, "frames");
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
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
    join(outputDir, "frame-%03d.jpg")
  ]);
  const files = (await readdir(outputDir)).filter((file) => file.endsWith(".jpg")).sort().slice(0, frameCount);
  const publicBase = renderedVideoUrl.replace(/\/[^/]+$/, `/candidates/${candidateId}/frames`);
  return Promise.all(files.map(async (file, index) => ({
    frameUrl: `${publicBase}/${file}`,
    framePath: join(outputDir, file),
    timestampSec: index * 3,
    base64: (await readFile(join(outputDir, file))).toString("base64")
  })));
}

async function requestVisualBenchmarkJudgement(
  input: VisualBenchmarkJudgeInput,
  model: string,
  frames: RenderedEvidenceFrame[]
): Promise<VisualBenchmarkJudgeOutput> {
  const content = await requestArkChatContent(
    model,
    buildVisualBenchmarkMessages(input, frames),
    90_000,
    2200,
    0.2
  );
  const parsed = parseJsonObject(content) as {
    score?: unknown;
    frameEvidence?: unknown;
    reasons?: unknown;
    nextRewriteBrief?: unknown;
  };
  const score = normalizeJudgeScore(parsed.score, input);
  const frameEvidence = normalizeFrameEvidence(parsed.frameEvidence, frames);
  const reasons = cleanStringList(parsed.reasons) ?? score.topFixes;
  return {
    provider: "ark",
    model,
    score,
    frameEvidence,
    reasons,
    nextRewriteBrief: typeof parsed.nextRewriteBrief === "string" ? parsed.nextRewriteBrief : score.revisionBrief?.failedDimensions.map((dimension) => dimension.instruction).join("\n")
  };
}

function buildVisualBenchmarkMessages(input: VisualBenchmarkJudgeInput, frames: RenderedEvidenceFrame[]) {
  return [
    {
      role: "system",
      content:
        "You are a strict visual benchmark judge for short-video structure transfer. Inspect the rendered frames, the Remotion DSL, and the user's target. Return strict JSON only. Score real observable output; do not reward mock or unverifiable claims."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            task: "Judge this rendered candidate and provide iteration guidance.",
            candidateId: input.candidateId,
            iterationIndex: input.iterationIndex,
            userGoal: input.source.prompt,
            productName: input.source.productName,
            targetDurationSec: input.source.targetDurationSec,
            sampleStructure: {
              summary: input.sample.summary,
              slots: input.sample.slots,
              rhythmPattern: input.sample.rhythmPattern,
              packagingPattern: input.sample.packagingPattern
            },
            materialSegments: input.materialSegments,
            remotionDsl: input.remotionDsl,
            previousScore: input.previousScore,
            rewriteBrief: input.rewriteBrief,
            outputSchema: {
              score: {
                totalScore: "0-100 number",
                dimensionScores: [
                  {
                    id: "user_brief_alignment | uploaded_video_usage | hook_retention | visual_packaging | remotion_code_delta | safety_compliance",
                    score: "number",
                    maxScore: "number",
                    evidence: ["observable evidence"],
                    deductions: ["specific deduction"],
                    fixInstruction: "specific fix"
                  }
                ],
                hardFailures: [
                  {
                    code: "missing_required_material_use | no_remotion_code_delta | unsafe_content | render_failed | invalid_video | mock_mode",
                    maxAllowedScore: "number",
                    reason: "string"
                  }
                ],
                topFixes: ["specific next actions"]
              },
              frameEvidence: [
                {
                  frameUrl: "copy one provided frameUrl",
                  timestampSec: "number",
                  observation: "what is visible and why it affects the score"
                }
              ],
              reasons: ["short score rationale"],
              nextRewriteBrief: "brief for the next Seedance iteration when score is below 90"
            }
          })
        },
        ...frames.map((frame) => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${frame.base64}`,
            detail: "low"
          }
        }))
      ]
    }
  ];
}

function buildFallbackRemotionDsl(input: SeedanceRemotionCoderInput): RemotionCompositionDsl {
  const firstSegmentId = input.materialSegments[0]?.id;
  const scenes = input.plan.timeline.slice(0, 5).map((item, index) => ({
    id: `scene-${input.iterationIndex}-${index + 1}`,
    startSec: item.startSec,
    endSec: item.endSec,
    layout: (index === 0 ? "centered_caption" : index === input.plan.timeline.length - 1 ? "cta" : "product_card") as RemotionCompositionDsl["scenes"][number]["layout"],
    caption: item.caption || `${input.source.productName || "产品"} ${index + 1}`,
    assetIds: item.assetIds.length ? item.assetIds : firstSegmentId ? [firstSegmentId] : [],
    motion: (input.iterationIndex > 0 && index === 0 ? "snap_zoom" : item.transition ? "cut" : "slow_push") as RemotionCompositionDsl["scenes"][number]["motion"]
  }));

  return {
    version: 1,
    candidateName: `MockSeedanceCandidate_${input.iterationIndex}`,
    scenes: scenes.length
      ? scenes
      : [
          {
            id: `scene-${input.iterationIndex}-fallback`,
            startSec: 0,
            endSec: Math.max(6, input.source.targetDurationSec),
            layout: "centered_caption",
            caption: input.source.productName || input.source.prompt || "Mock candidate",
            assetIds: firstSegmentId ? [firstSegmentId] : [],
            motion: "hold"
          }
        ]
  };
}

function compileRemotionDslToCode(dsl: RemotionCompositionDsl) {
  const sceneCode = dsl.scenes
    .map(
      (scene) =>
        `  <Scene id="${scene.id}" from={${scene.startSec}} to={${scene.endSec}} layout="${scene.layout}" motion="${scene.motion}" caption={${JSON.stringify(scene.caption)}} assets={${JSON.stringify(scene.assetIds)}} />`
    )
    .join("\n");
  return [
    "import { Scene } from '@byteproject/remotion-safe-components';",
    "",
    `export function ${sanitizeComponentName(dsl.candidateName)}() {`,
    "  return (",
    "    <>",
    sceneCode,
    "    </>",
    "  );",
    "}"
  ].join("\n");
}

function sanitizeComponentName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Candidate_${cleaned}`;
}

function createMockVisualBenchmarkScore(input: VisualBenchmarkJudgeInput): BenchmarkScore {
  return {
    candidateId: input.candidateId,
    iterationIndex: input.iterationIndex,
    totalScore: 59,
    grade: "fail",
    accepted: false,
    threshold: {
      regenerateBelow: 60,
      targetScore: 90,
      excellentFrom: 95,
      maxIterations: 5
    },
    dimensionScores: [
      makeVisualDimension("user_brief_alignment", "用户需求和商品表达", 25, 12, "Mock judge cannot validate brief alignment from frames."),
      makeVisualDimension("uploaded_video_usage", "上传视频结构和素材利用", 20, 8, "Mock judge cannot prove source footage use."),
      makeVisualDimension("hook_retention", "前 3 秒 hook、节奏和留存", 20, 10, "Mock judge cannot inspect opening frames."),
      makeVisualDimension("visual_packaging", "画面包装、字幕、转场和可看性", 15, 8, "Mock judge cannot inspect visual packaging."),
      makeVisualDimension("remotion_code_delta", "Remotion 代码变化真实有效", 10, 6, "Mock coder output is not a formal Seedance result."),
      makeVisualDimension("safety_compliance", "安全合规", 10, 10, "No sensitive content was exposed in mock score.")
    ],
    hardFailures: [
      {
        code: "mock_mode",
        maxAllowedScore: 59,
        reason: "Seedance or Visual Benchmark Judge is running in mock mode, so the candidate cannot formally pass."
      }
    ],
    topFixes: ["Configure Seedance Remotion Coder and Visual Benchmark Judge before formal acceptance."],
    revisionBrief: {
      task: "revise_video_plan_from_benchmark",
      targetScore: 90,
      currentScore: 59,
      failedDimensions: [
        {
          dimension: "uploaded_video_usage",
          score: 8,
          reason: "Mock judge cannot prove source footage use.",
          instruction: "Run visual frame judging against the rendered MP4."
        }
      ],
      mustKeep: ["Use the uploaded video as both structure reference and available material pool."],
      mustAvoid: ["Do not mark mock candidates as benchmark-passing production output."],
      rewriteScope: ["rendererPrompt", "timeline captions", "packaging", "transition", "beatHint"]
    }
  };
}

function makeVisualDimension(id: BenchmarkScore["dimensionScores"][number]["id"], label: string, maxScore: number, score: number, reason: string) {
  return {
    id,
    label,
    maxScore,
    score,
    evidence: [reason],
    deductions: score >= maxScore ? [] : [reason],
    fixInstruction: reason
  };
}

function normalizeRemotionDsl(value: unknown, input: SeedanceRemotionCoderInput): RemotionCompositionDsl {
  const fallback = buildFallbackRemotionDsl(input);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<RemotionCompositionDsl>;
  const scenes = normalizeRemotionScenes(candidate.scenes, fallback.scenes);
  return {
    version: 1,
    candidateName: typeof candidate.candidateName === "string" && candidate.candidateName.trim()
      ? candidate.candidateName.trim()
      : `SeedanceCandidate_${input.iterationIndex}`,
    scenes
  };
}

function normalizeRemotionScenes(value: unknown, fallbackScenes: RemotionCompositionDsl["scenes"]) {
  if (!Array.isArray(value)) return fallbackScenes;
  const allowedLayouts = new Set<RemotionCompositionDsl["scenes"][number]["layout"]>(["centered_caption", "split_reveal", "product_card", "media_clip", "cta"]);
  const allowedMotions = new Set<RemotionCompositionDsl["scenes"][number]["motion"]>(["slow_push", "snap_zoom", "pan", "cut", "hold"]);
  const scenes = value
    .map((item, index) => {
      if (!item || typeof item !== "object") return undefined;
      const scene = item as Record<string, unknown>;
      const startSec = cleanNonNegativeNumber(scene.startSec);
      const endSec = cleanNonNegativeNumber(scene.endSec);
      const layout = typeof scene.layout === "string" && allowedLayouts.has(scene.layout as RemotionCompositionDsl["scenes"][number]["layout"])
        ? scene.layout as RemotionCompositionDsl["scenes"][number]["layout"]
        : fallbackScenes[index]?.layout ?? "product_card";
      const motion = typeof scene.motion === "string" && allowedMotions.has(scene.motion as RemotionCompositionDsl["scenes"][number]["motion"])
        ? scene.motion as RemotionCompositionDsl["scenes"][number]["motion"]
        : fallbackScenes[index]?.motion ?? "cut";
      return {
        id: typeof scene.id === "string" && scene.id.trim() ? scene.id.trim() : `scene-${index + 1}`,
        startSec: startSec ?? fallbackScenes[index]?.startSec ?? index * 3,
        endSec: Math.max(endSec ?? fallbackScenes[index]?.endSec ?? index * 3 + 3, startSec ?? fallbackScenes[index]?.startSec ?? index * 3),
        layout,
        caption: typeof scene.caption === "string" && scene.caption.trim() ? scene.caption.trim().slice(0, 80) : fallbackScenes[index]?.caption ?? "",
        assetIds: cleanStringList(scene.assetIds) ?? fallbackScenes[index]?.assetIds ?? [],
        motion
      };
    })
    .filter((scene): scene is RemotionCompositionDsl["scenes"][number] => Boolean(scene))
    .slice(0, 8);
  return scenes.length ? scenes : fallbackScenes;
}

function normalizeJudgeScore(value: unknown, input: VisualBenchmarkJudgeInput): BenchmarkScore {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const totalScore = clampScore(typeof raw.totalScore === "number" ? raw.totalScore : 0);
  const hardFailures = normalizeHardFailures(raw.hardFailures);
  const accepted = totalScore >= 90 && hardFailures.length === 0;
  return {
    candidateId: input.candidateId,
    iterationIndex: input.iterationIndex,
    totalScore,
    grade: accepted ? totalScore >= 95 ? "excellent" : "pass" : totalScore < 60 ? "fail" : "needs_iteration",
    accepted,
    threshold: {
      regenerateBelow: 60,
      targetScore: 90,
      excellentFrom: 95,
      maxIterations: 5
    },
    dimensionScores: normalizeJudgeDimensions(raw.dimensionScores),
    hardFailures,
    topFixes: cleanStringList(raw.topFixes) ?? ["Improve visual structure transfer, material use, opening hook, and packaging clarity."],
    revisionBrief: accepted ? undefined : buildRevisionBriefFromJudge(input, totalScore, raw.dimensionScores)
  };
}

function normalizeJudgeDimensions(value: unknown): BenchmarkScore["dimensionScores"] {
  const allowed = new Map<BenchmarkScore["dimensionScores"][number]["id"], { label: string; maxScore: number }>([
    ["user_brief_alignment", { label: "用户目标贴合", maxScore: 25 }],
    ["uploaded_video_usage", { label: "上传视频结构与素材利用", maxScore: 20 }],
    ["hook_retention", { label: "开头留存", maxScore: 20 }],
    ["visual_packaging", { label: "视觉包装", maxScore: 15 }],
    ["remotion_code_delta", { label: "Remotion 代码变化", maxScore: 10 }],
    ["safety_compliance", { label: "安全合规", maxScore: 10 }]
  ]);
  const dimensions: BenchmarkScore["dimensionScores"] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const id = typeof raw.id === "string" && allowed.has(raw.id as BenchmarkScore["dimensionScores"][number]["id"])
        ? raw.id as BenchmarkScore["dimensionScores"][number]["id"]
        : undefined;
      if (!id || dimensions.some((dimension) => dimension.id === id)) continue;
      const meta = allowed.get(id)!;
      const maxScore = typeof raw.maxScore === "number" && raw.maxScore > 0 ? raw.maxScore : meta.maxScore;
      const score = clampScore(typeof raw.score === "number" ? raw.score : 0, maxScore);
      const evidence = cleanStringList(raw.evidence) ?? ["Judge did not provide detailed evidence."];
      dimensions.push({
        id,
        label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : meta.label,
        maxScore,
        score,
        evidence,
        deductions: cleanStringList(raw.deductions) ?? (score >= maxScore ? [] : evidence),
        fixInstruction: typeof raw.fixInstruction === "string" && raw.fixInstruction.trim() ? raw.fixInstruction.trim() : evidence[0]
      });
    }
  }
  for (const [id, meta] of allowed) {
    if (!dimensions.some((dimension) => dimension.id === id)) {
      dimensions.push(makeVisualDimension(id, meta.label, meta.maxScore, 0, "Judge did not return this dimension."));
    }
  }
  return dimensions;
}

function normalizeHardFailures(value: unknown): BenchmarkScore["hardFailures"] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<BenchmarkScore["hardFailures"][number]["code"]>([
    "missing_required_material_use",
    "no_remotion_code_delta",
    "unsafe_content",
    "render_failed",
    "invalid_video",
    "mock_mode",
    "stagnant_iteration",
    "sensitive_leak",
    "empty_preview"
  ]);
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const raw = item as Record<string, unknown>;
      const code = typeof raw.code === "string" && allowed.has(raw.code as BenchmarkScore["hardFailures"][number]["code"])
        ? raw.code as BenchmarkScore["hardFailures"][number]["code"]
        : undefined;
      if (!code) return undefined;
      return {
        code,
        maxAllowedScore: typeof raw.maxAllowedScore === "number" ? clampScore(raw.maxAllowedScore) : 60,
        reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : code
      };
    })
    .filter((failure): failure is BenchmarkScore["hardFailures"][number] => Boolean(failure))
    .slice(0, 4);
}

function buildRevisionBriefFromJudge(input: VisualBenchmarkJudgeInput, totalScore: number, dimensions: unknown): BenchmarkScore["revisionBrief"] {
  const normalized = normalizeJudgeDimensions(dimensions)
    .filter((dimension) => dimension.score < dimension.maxScore)
    .sort((a, b) => (a.score / a.maxScore) - (b.score / b.maxScore))
    .slice(0, 3);
  return {
    task: "revise_video_plan_from_benchmark",
    targetScore: 90,
    currentScore: totalScore,
    failedDimensions: normalized.map((dimension) => ({
      dimension: dimension.id,
      score: dimension.score,
      reason: dimension.deductions[0] ?? dimension.evidence[0] ?? "Needs improvement.",
      instruction: dimension.fixInstruction
    })),
    mustKeep: ["Use the uploaded sample as structure evidence and the uploaded material as the candidate media pool."],
    mustAvoid: ["Do not repeat the same Remotion scene structure without changing timing, layout, motion, or material mapping."],
    rewriteScope: ["script", "timeline captions", "packaging", "transition", "beatHint", "rendererPrompt"]
  };
}

function normalizeFrameEvidence(value: unknown, frames: RenderedEvidenceFrame[]): JudgeFrameEvidence[] {
  if (!Array.isArray(value)) {
    return frames.slice(0, 3).map((frame) => ({
      frameUrl: frame.frameUrl,
      framePath: frame.framePath,
      timestampSec: frame.timestampSec,
      observation: "Frame extracted for visual judging."
    }));
  }
  const byUrl = new Map(frames.map((frame) => [frame.frameUrl, frame]));
  const evidence = value
    .map((item): JudgeFrameEvidence | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const raw = item as Record<string, unknown>;
      const requestedUrl = typeof raw.frameUrl === "string" ? raw.frameUrl : undefined;
      const sourceFrame = requestedUrl ? byUrl.get(requestedUrl) : undefined;
      const fallbackFrame = frames[0];
      if (!sourceFrame && !fallbackFrame) return undefined;
      const frame = sourceFrame ?? fallbackFrame;
      return {
        frameUrl: frame.frameUrl,
        framePath: frame.framePath,
        timestampSec: typeof raw.timestampSec === "number" ? raw.timestampSec : frame.timestampSec,
        observation: typeof raw.observation === "string" && raw.observation.trim() ? raw.observation.trim() : "Frame was inspected by the visual judge."
      };
    })
    .filter((frame): frame is JudgeFrameEvidence => Boolean(frame))
    .slice(0, 6);
  return evidence.length ? evidence : normalizeFrameEvidence(undefined, frames);
}

function clampScore(value: number, max = 100) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

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
  fallback: "Return no analysis when video understanding is unavailable; callers must not synthesize preset slots.",
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
  const fileName = `${plan.id}.mp4`;
  const outputPath = join(outputDir, fileName);

  try {
    await renderRemotionTimelineMp4(plan, outputPath);
    return {
      path: outputPath,
      url: `/outputs/${fileName}`
    };
  } catch (error) {
    if (process.env.ENABLE_LEGACY_FFMPEG_SYNTHETIC !== "true") throw error;
  }

  const ffmpeg = resolveFfmpegPath();
  const assFileName = `${plan.id}.ass`;
  const sidecarNames = new Set<string>([assFileName]);
  const hasStructuredMaterial = Boolean(materialVideo?.localPath && materialSegments.length && canRenderSourceFootage(materialVideo));

  await writeFile(join(outputDir, assFileName), renderTimelineAss(plan), "utf8");

  try {
    if (hasStructuredMaterial) {
      await renderSegmentTimelineMp4({
        ffmpeg,
        plan,
        outputDir,
        materialVideo: materialVideo!,
        materialSegments,
        assFileName,
        fileName,
        sidecarNames
      });
    } else {
      await renderSyntheticTimelineMp4({
        ffmpeg,
        plan,
        outputDir,
        materialVideo,
        assFileName,
        fileName,
        sidecarNames
      });
    }
    return {
      path: outputPath,
      url: `/outputs/${fileName}`
    };
  } finally {
    await cleanupOutputFiles(outputDir, [...sidecarNames]);
  }
}

async function renderRemotionTimelineMp4(plan: GeneratedPlan, outputPath: string) {
  const [{ bundle }, { renderMedia, selectComposition }] = await Promise.all([import("@remotion/bundler"), import("@remotion/renderer")]);
  const entryPoint = fileURLToPath(new URL("./remotion/entry.tsx", import.meta.url));
  const serveUrl = await bundle({ entryPoint });
  const browserExecutable = resolveRemotionBrowserExecutable();
  if (!browserExecutable && process.env.ALLOW_REMOTION_BROWSER_DOWNLOAD !== "true") {
    throw new Error("Remotion rendering requires Chrome. Set REMOTION_BROWSER_EXECUTABLE or ALLOW_REMOTION_BROWSER_DOWNLOAD=true.");
  }
  const inputProps = {
    plan,
    variant: plan.previewVariants.find((variant) => variant.renderer === "remotion") ?? plan.previewVariants[0]
  };
  const composition = await selectComposition({
    serveUrl,
    id: REMOTION_STORYBOARD_COMPOSITION_ID,
    inputProps,
    browserExecutable
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    browserExecutable,
    scale: resolveRemotionRenderScale(),
    crf: 28,
    concurrency: process.env.REMOTION_RENDER_CONCURRENCY ?? "50%",
    logLevel: "warn",
    timeoutInMilliseconds: Number(process.env.REMOTION_RENDER_TIMEOUT_MS ?? 180_000),
    x264Preset: "veryfast"
  });
}

function resolveRemotionBrowserExecutable() {
  const candidates = [
    process.env.REMOTION_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveRemotionRenderScale() {
  const scale = Number(process.env.REMOTION_RENDER_SCALE ?? 0.55);
  if (!Number.isFinite(scale)) return 0.55;
  return Math.max(0.35, Math.min(1, scale));
}

async function renderSegmentTimelineMp4(input: {
  ffmpeg: string;
  plan: GeneratedPlan;
  outputDir: string;
  materialVideo: VideoMetadata;
  materialSegments: MaterialSegment[];
  assFileName: string;
  fileName: string;
  sidecarNames: Set<string>;
}) {
  const segmentById = new Map(input.materialSegments.map((segment) => [segment.id, segment]));
  const clipNames: string[] = [];

  for (const [index, item] of input.plan.timeline.entries()) {
    const segment = resolveTimelineSegment(item.assetIds, segmentById, input.materialSegments, index);
    const slices = timelineClipDurations(item);

    for (const [sliceIndex, sliceDuration] of slices.entries()) {
      const visualIndex = index * 4 + sliceIndex;
      const clipName = `${input.plan.id}-clip-${String(index + 1).padStart(3, "0")}-${sliceIndex + 1}.mp4`;
      input.sidecarNames.add(clipName);

      if (segment && input.materialVideo.localPath) {
        const sourceName = `${input.plan.id}-source-${String(index + 1).padStart(3, "0")}-${sliceIndex + 1}.mp4`;
        input.sidecarNames.add(sourceName);
        await renderSourceSegmentClip(input.ffmpeg, input.outputDir, input.materialVideo.localPath, sourceName, segment, visualIndex);
        await renderLoopedClip(input.ffmpeg, input.outputDir, sourceName, clipName, sliceDuration);
      } else {
        await renderCardClip(input.ffmpeg, input.outputDir, clipName, sliceDuration, visualIndex, item);
      }

      clipNames.push(clipName);
    }
  }

  const concatFileName = `${input.plan.id}-concat.txt`;
  const stitchedFileName = `${input.plan.id}-stitched.mp4`;
  input.sidecarNames.add(concatFileName);
  input.sidecarNames.add(stitchedFileName);
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

async function renderSourceSegmentClip(ffmpeg: string, outputDir: string, sourcePath: string, fileName: string, segment: MaterialSegment, index: number) {
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
      sourceSegmentFilter(index),
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

async function renderCardClip(
  ffmpeg: string,
  outputDir: string,
  clipName: string,
  duration: number,
  index: number,
  item?: { slotId?: string }
) {
  await execJson(
    ffmpeg,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${cardColor(index)}:s=1080x1920:d=${duration}:r=30`,
      "-vf",
      syntheticShotFilter(index, duration, item?.slotId),
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

async function renderSyntheticTimelineMp4(input: {
  ffmpeg: string;
  plan: GeneratedPlan;
  outputDir: string;
  materialVideo?: VideoMetadata;
  assFileName: string;
  fileName: string;
  sidecarNames: Set<string>;
}) {
  if (input.materialVideo?.localPath && canRenderSourceFootage(input.materialVideo)) {
    await renderLoopBackgroundMp4(input);
    return;
  }

  const timeline = input.plan.timeline.length
    ? input.plan.timeline
    : [{ id: "synthetic-fallback", startSec: 0, endSec: resolvePlanDuration(input.plan), slotId: "hook", assetIds: [], caption: "", packaging: [] }];
  const clipNames: string[] = [];

  for (const [index, item] of timeline.entries()) {
    const slices = timelineClipDurations(item);
    for (const [sliceIndex, sliceDuration] of slices.entries()) {
      const visualIndex = index * 4 + sliceIndex;
      const clipName = `${input.plan.id}-clip-${String(index + 1).padStart(3, "0")}-${sliceIndex + 1}.mp4`;
      input.sidecarNames.add(clipName);
      await renderCardClip(input.ffmpeg, input.outputDir, clipName, sliceDuration, visualIndex, item);
      clipNames.push(clipName);
    }
  }

  const concatFileName = `${input.plan.id}-concat.txt`;
  const stitchedFileName = `${input.plan.id}-stitched.mp4`;
  input.sidecarNames.add(concatFileName);
  input.sidecarNames.add(stitchedFileName);
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

async function renderLoopBackgroundMp4(input: {
  ffmpeg: string;
  plan: GeneratedPlan;
  outputDir: string;
  materialVideo?: VideoMetadata;
  assFileName: string;
  fileName: string;
}) {
  const duration = String(resolvePlanDuration(input.plan));
  const videoFilter = [sourceSegmentFilter(0), `ass=${input.assFileName}`].join(",");
  await execJson(
    input.ffmpeg,
    [
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
    ],
    { cwd: input.outputDir }
  );
}

function baseVideoFilter(index = 0) {
  const phase = Number((index * 0.73).toFixed(2));
  return [
    "scale=1188:2112:force_original_aspect_ratio=increase",
    `crop=1080:1920:${expr(`(iw-1080)/2+((iw-1080)/2)*0.45*sin(t*0.62+${phase})`)}:${expr(
      `(ih-1920)/2+((ih-1920)/2)*0.34*cos(t*0.48+${phase})`
    )}`,
    "setsar=1"
  ].join(",");
}

function sourceSegmentFilter(index: number) {
  const contrast = 1.04 + (index % 3) * 0.035;
  const saturation = 1.08 + (index % 4) * 0.04;
  return [baseVideoFilter(index), `eq=contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`, movingOverlayFilter(index), sourceFrameTreatment(index)].join(",");
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

function canRenderSourceFootage(video: VideoMetadata) {
  return video.role === "material" && video.id.startsWith("material-");
}

function timelineClipDurations(item: { startSec: number; endSec: number }) {
  const duration = resolveTimelineItemDuration(item);
  if (duration <= 2.4) return [duration];
  const sliceCount = Math.min(5, Math.max(2, Math.ceil(duration / 2.15)));
  const base = Number((duration / sliceCount).toFixed(2));
  return Array.from({ length: sliceCount }, (_, index) => (index === sliceCount - 1 ? Number((duration - base * (sliceCount - 1)).toFixed(2)) : base));
}

function cardColor(index: number) {
  const colors = ["0x101419", "0x0B2A32", "0x2A173C", "0x103727", "0x3A2511", "0x182247", "0x3B1825", "0x132F49"];
  return colors[index % colors.length];
}

function syntheticShotFilter(index: number, duration: number, slotId?: string) {
  return [
    "format=rgba",
    kineticBackdropFilter(index),
    movingOverlayFilter(index),
    shotLayoutFilter(index, duration, slotId),
    "format=yuv420p"
  ].join(",");
}

function movingOverlayFilter(index: number) {
  const accent = accentColor(index);
  const warm = warmAccentColor(index);
  return [
    `drawbox=x=${expr("-340+mod(t*360\\,1760)")}:y=104:w=680:h=12:color=${accent}@0.78:t=fill`,
    `drawbox=x=${expr("960-mod(t*180\\,620)")}:y=1540:w=420:h=20:color=${warm}@0.68:t=fill`,
    `drawbox=x=${expr(`58+26*sin(t*1.9+${index})`)}:y=${expr("244+30*cos(t*1.4)")}:w=960:h=500:color=0xffffff@0.050:t=fill`,
    `drawbox=x=${expr("110+32*cos(t*1.2)")}:y=${expr(`1190+22*sin(t*2.0+${index})`)}:w=850:h=300:color=0x000000@0.24:t=fill`,
    `drawbox=x=0:y=${expr("1780-mod(t*240\\,640)")}:w=1080:h=62:color=${accent}@0.26:t=fill`,
    `drawbox=x=${expr("-520+mod(t*95\\,1600)")}:y=860:w=480:h=640:color=${warm}@0.08:t=fill`
  ].join(",");
}

function kineticBackdropFilter(index: number) {
  const accent = accentColor(index);
  const warm = warmAccentColor(index);
  const cool = coolAccentColor(index);
  return [
    `drawbox=x=0:y=0:w=1080:h=1920:color=${accent}@0.055:t=fill`,
    `drawbox=x=${expr("760+34*sin(t*0.9)")}:y=220:w=320:h=980:color=${cool}@0.12:t=fill`,
    `drawbox=x=0:y=${expr("360+48*cos(t*0.7)")}:w=220:h=920:color=${warm}@0.10:t=fill`,
    `drawbox=x=${expr("120+mod(t*46\\,220)")}:y=156:w=2:h=1460:color=0xffffff@0.075:t=fill`,
    `drawbox=x=${expr("320+mod(t*62\\,310)")}:y=156:w=2:h=1460:color=0xffffff@0.045:t=fill`,
    `drawbox=x=70:y=${expr("1720+12*sin(t*2.4)")}:w=940:h=1:color=0xffffff@0.22:t=fill`
  ].join(",");
}

function shotLayoutFilter(index: number, duration: number, slotId?: string) {
  const accent = accentColor(index);
  const warm = warmAccentColor(index);
  const cool = coolAccentColor(index);
  const progressWidth = Math.max(70, Math.min(940, Math.round(940 / Math.max(1, duration))));
  const layoutKind = shotLayoutKind(slotId, index);
  const layouts: Record<string, string[]> = {
    hook: [
      `drawbox=x=72:y=${expr("250+24*sin(t*1.6)")}:w=936:h=310:color=0x000000@0.42:t=fill`,
      `drawbox=x=72:y=${expr("250+24*sin(t*1.6)")}:w=936:h=14:color=${accent}@0.98:t=fill`,
      `drawbox=x=${expr("120+mod(t*170\\,520)")}:y=650:w=180:h=180:color=${warm}@0.20:t=fill`,
      "drawbox=x=330:y=650:w=180:h=180:color=0xffffff@0.10:t=fill",
      `drawbox=x=540:y=650:w=180:h=180:color=${cool}@0.16:t=fill`,
      "drawbox=x=750:y=650:w=180:h=180:color=0xffffff@0.08:t=fill",
      `drawbox=x=0:y=960:w=${220 + (index % 3) * 70}:h=32:color=${accent}@0.72:t=fill`
    ],
    body: [
      "drawbox=x=82:y=240:w=430:h=760:color=0xffffff@0.075:t=fill",
      `drawbox=x=128:y=300:w=338:h=560:color=${cool}@0.20:t=fill`,
      `drawbox=x=${expr("560+24*sin(t*1.1)")}:y=280:w=410:h=140:color=${accent}@0.18:t=fill`,
      "drawbox=x=560:y=470:w=410:h=138:color=0xffffff@0.095:t=fill",
      `drawbox=x=560:y=660:w=410:h=138:color=${warm}@0.16:t=fill`,
      "drawbox=x=128:y=1110:w=820:h=132:color=0x000000@0.30:t=fill"
    ],
    proof: [
      "drawbox=x=70:y=260:w=455:h=650:color=0xffffff@0.070:t=fill",
      `drawbox=x=555:y=260:w=455:h=650:color=${accent}@0.20:t=fill`,
      `drawbox=x=${expr("520+20*sin(t*2.2)")}:y=260:w=12:h=650:color=${warm}@0.86:t=fill`,
      "drawbox=x=126:y=980:w=828:h=110:color=0x000000@0.30:t=fill",
      "drawbox=x=126:y=1140:w=828:h=110:color=0xffffff@0.070:t=fill",
      `drawbox=x=${expr("126+mod(t*210\\,700)")}:y=1260:w=160:h=16:color=${accent}@0.90:t=fill`
    ],
    offer: [
      `drawbox=x=88:y=260:w=904:h=430:color=${warm}@0.18:t=fill`,
      "drawbox=x=126:y=330:w=250:h=250:color=0xffffff@0.12:t=fill",
      `drawbox=x=410:y=330:w=250:h=250:color=${cool}@0.18:t=fill`,
      "drawbox=x=694:y=330:w=250:h=250:color=0xffffff@0.10:t=fill",
      "drawbox=x=90:y=860:w=900:h=420:color=0x000000@0.28:t=fill",
      `drawbox=x=90:y=${expr("1380+18*sin(t*1.8)")}:w=900:h=120:color=${accent}@0.18:t=fill`
    ],
    cta: [
      "drawbox=x=104:y=280:w=872:h=872:color=0xffffff@0.060:t=fill",
      "drawbox=x=184:y=360:w=712:h=712:color=0x000000@0.22:t=fill",
      `drawbox=x=180:y=${expr("1270+18*sin(t*2.0)")}:w=720:h=172:color=${accent}@0.78:t=fill`,
      `drawbox=x=${expr("250+mod(t*160\\,420)")}:y=1476:w=180:h=18:color=${warm}@0.92:t=fill`,
      "drawbox=x=220:y=1610:w=640:h=4:color=0xffffff@0.22:t=fill"
    ],
    dense: [
      `drawbox=x=80:y=245:w=920:h=1180:color=0x000000@0.22:t=fill`,
      `drawbox=x=124:y=305:w=260:h=260:color=${accent}@0.22:t=fill`,
      "drawbox=x=420:y=305:w=540:h=260:color=0xffffff@0.08:t=fill",
      "drawbox=x=124:y=620:w=836:h=88:color=0xffffff@0.09:t=fill",
      `drawbox=x=124:y=746:w=686:h=88:color=${cool}@0.13:t=fill`,
      "drawbox=x=124:y=872:w=760:h=88:color=0xffffff@0.07:t=fill"
    ]
  };
  return [
    ...(layouts[layoutKind] ?? layouts.dense),
    `drawbox=x=70:y=1680:w=940:h=12:color=0xffffff@0.16:t=fill`,
    `drawbox=x=${expr(`70+mod(t*${progressWidth}\\,940)`)}:y=1680:w=120:h=12:color=${accent}@0.92:t=fill`
  ].join(",");
}

function sourceFrameTreatment(index: number) {
  const accent = accentColor(index);
  const warm = warmAccentColor(index);
  return [
    `drawbox=x=52:y=92:w=976:h=2:color=0xffffff@0.20:t=fill`,
    `drawbox=x=${expr("70+mod(t*210\\,820)")}:y=92:w=170:h=8:color=${accent}@0.86:t=fill`,
    `drawbox=x=62:y=${expr("1500+20*sin(t*1.5)")}:w=956:h=210:color=0x000000@0.26:t=fill`,
    `drawbox=x=${expr("770+24*cos(t*1.0)")}:y=228:w=230:h=230:color=${warm}@0.14:t=fill`
  ].join(",");
}

function shotLayoutKind(slotId: string | undefined, index: number) {
  if (/hook/i.test(slotId ?? "")) return "hook";
  if (/body|product/i.test(slotId ?? "")) return "body";
  if (/proof/i.test(slotId ?? "")) return "proof";
  if (/offer/i.test(slotId ?? "")) return "offer";
  if (/cta/i.test(slotId ?? "")) return "cta";
  return ["hook", "body", "proof", "offer", "dense", "cta"][index % 6];
}

function accentColor(index: number) {
  const colors = ["0x70E0C1", "0xFFD166", "0xFF6B6B", "0x8BD3FF", "0xB8F26D", "0xF6A6FF"];
  return colors[index % colors.length];
}

function warmAccentColor(index: number) {
  const colors = ["0xFFD166", "0xFF8E72", "0xF6A6FF", "0xB8F26D", "0x8BD3FF", "0x70E0C1"];
  return colors[index % colors.length];
}

function coolAccentColor(index: number) {
  const colors = ["0x8BD3FF", "0x70E0C1", "0xB8F26D", "0xF6A6FF", "0xFFD166", "0xFF8E72"];
  return colors[index % colors.length];
}

function expr(value: string) {
  return `'${value}'`;
}

async function cleanupOutputFiles(outputDir: string, fileNames: string[]) {
  await Promise.all(
    fileNames.map((fileName) =>
      rm(join(outputDir, fileName), {
        force: true
      })
    )
  );
}

function renderTimelineAss(plan: GeneratedPlan) {
  const events = plan.timeline
    .map((item, index) => {
      const start = formatAssTime(item.startSec);
      const end = formatAssTime(item.endSec);
      const caption = item.caption || plan.id;
      const renderedTitle = `SHOT ${index + 1} / ${segmentTitle(item.slotId)} / ${item.startSec}s-${item.endSec}s`;
      const packaging = [item.packaging[0], item.beatHint ? `beat: ${item.beatHint}` : ""]
        .filter(Boolean)
        .join(" / ");
      const layout = assLayout(index, item.slotId);
      return [
        `Dialogue: 0,${start},${end},Top,,0,0,0,,{${layout.top}\\fad(90,120)}${assText(renderedTitle)}`,
        `Dialogue: 1,${start},${end},Chip,,0,0,0,,{${layout.chip}\\fad(90,110)}${assText(layout.label)}`,
        `Dialogue: 2,${start},${end},Main,,0,0,0,,{${layout.main}\\fad(80,120)}${assText(caption)}`,
        packaging ? `Dialogue: 3,${start},${end},Bottom,,0,0,0,,{${layout.bottom}\\fad(140,120)}${assText(packaging)}` : "",
        item.beatHint || item.transition
          ? `Dialogue: 4,${start},${end},Micro,,0,0,0,,{${layout.micro}\\fad(120,120)}${assText([item.beatHint, item.transition].filter(Boolean).join("  |  "))}`
          : ""
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
Style: Top, Microsoft YaHei, 38, &H00D9FFF7, &H00FFFFFF, &H00101517, &H99000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 3, 0, 8, 72, 72, 96, 1
Style: Chip, Microsoft YaHei, 34, &H00FFFFFF, &H00FFFFFF, &H00101517, &HAA000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 8, 60, 60, 80, 1
Style: Main, Microsoft YaHei, 76, &H00FFFFFF, &H00FFFFFF, &H00101517, &HAA000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 5, 2, 7, 84, 84, 96, 1
Style: Bottom, Microsoft YaHei, 40, &H00F9E3C1, &H00FFFFFF, &H00101517, &HAA000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 3, 0, 1, 72, 72, 130, 1
Style: Micro, Microsoft YaHei, 30, &H00BFEAFF, &H00FFFFFF, &H00101517, &H99000000, 0, 0, 0, 0, 100, 100, 0, 0, 1, 2, 0, 5, 72, 72, 72, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

function assLayout(index: number, slotId: string) {
  const kind = shotLayoutKind(slotId, index);
  const layouts: Record<string, { top: string; chip: string; main: string; bottom: string; micro: string; label: string }> = {
    hook: {
      top: "\\an7\\pos(78,88)",
      chip: "\\an9\\pos(998,98)",
      main: "\\an7\\move(88,430,88,370,0,260)",
      bottom: "\\an1\\pos(92,1588)",
      micro: "\\an5\\pos(540,1708)",
      label: "HOOK"
    },
    body: {
      top: "\\an7\\pos(86,92)",
      chip: "\\an7\\pos(116,1040)",
      main: "\\an7\\move(92,540,92,492,0,260)\\fs64",
      bottom: "\\an1\\pos(92,1580)",
      micro: "\\an5\\pos(540,1710)",
      label: "PRODUCT"
    },
    proof: {
      top: "\\an8\\pos(540,96)",
      chip: "\\an5\\pos(540,932)",
      main: "\\an5\\move(540,1120,540,1064,0,260)",
      bottom: "\\an1\\pos(92,1586)",
      micro: "\\an5\\pos(540,1710)",
      label: "PROOF"
    },
    offer: {
      top: "\\an7\\pos(86,96)",
      chip: "\\an9\\pos(986,716)",
      main: "\\an7\\move(112,980,112,920,0,260)",
      bottom: "\\an1\\pos(92,1588)",
      micro: "\\an5\\pos(540,1712)",
      label: "OFFER"
    },
    cta: {
      top: "\\an8\\pos(540,104)",
      chip: "\\an8\\pos(540,1220)",
      main: "\\an5\\move(540,910,540,850,0,260)",
      bottom: "\\an5\\pos(540,1420)",
      micro: "\\an5\\pos(540,1584)",
      label: "CTA"
    },
    dense: {
      top: "\\an7\\pos(82,96)",
      chip: "\\an9\\pos(984,96)",
      main: "\\an7\\move(120,790,120,730,0,260)",
      bottom: "\\an1\\pos(92,1584)",
      micro: "\\an5\\pos(540,1710)",
      label: "BEAT"
    }
  };
  return layouts[kind] ?? layouts.dense;
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
  const cleaned = value
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return wrapAssText(cleaned, 14);
}

function wrapAssText(value: string, maxChars: number) {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(""));
  }
  return lines.slice(0, 4).join("\\N");
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
          rendererPrompt: "string，给 Remotion 的结构化渲染提示，只说明本次分析派生的 timeline 如何渲染，时长必须小于等于 60 秒",
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
          preserveMeaning: "transfer structure and method only; never clone sample content",
          visualVariety:
            "do not output five identical centered text cards. Every timeline item needs a distinct layout cue: split screen, moving headline, benefit card stack, before/after proof, progress bar, counter, sticker, CTA button, snap zoom, or rhythmic transition.",
          purchaseIntent:
            "make the viewer understand the problem, believe the proof, and know the next action; avoid vague slogans."
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
              packaging: ["1-3 visual render instructions with motion/layout, not just text"],
              transition: "specific transition instruction such as snap zoom, wipe, split reveal, card push, or beat cut",
              beatHint: "rhythm/BGM cue and pacing intent"
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
              `采用中等抽帧预算：${DEFAULT_FRAME_BUDGET.minFrames}-${DEFAULT_FRAME_BUDGET.maxFrames} 张，约每 ${DEFAULT_FRAME_BUDGET.secondsPerFrame} 秒一帧；不要假设未看到的细节。`,
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

async function requestArkChatContent(model: string, messages: unknown[], timeoutMs: number, maxTokens: number, temperature: number) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new Error("ARK_API_KEY is not configured.");
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
        messages,
        temperature,
        max_tokens: maxTokens
      })
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Ark request failed with ${response.status}: ${await safeResponseText(response)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ark response did not include message content.");
  return content;
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
  return frameSampleCountForDuration(
    durationSec,
    normalizeFrameBudget({
      minFrames: Number(process.env.VISION_MIN_FRAME_COUNT),
      maxFrames: Number(process.env.VISION_MAX_FRAME_COUNT),
      secondsPerFrame: Number(process.env.VISION_SECONDS_PER_FRAME)
    })
  );
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
