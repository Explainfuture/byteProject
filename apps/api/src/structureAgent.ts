import { resolve } from "node:path";
import { z } from "zod";
import { modelCreativeAdapter, modelPlanComposerAdapter, modelVideoUnderstandingAdapter, remotionStoryboardAdapter } from "@byteproject/adapters";
import { analyzeSampleVideo, createBriefDrivenTranscript, segmentLongVideo } from "@byteproject/core";
import { knowledgeStore } from "@byteproject/knowledge";
import { inferCreativeSkillIds } from "@byteproject/shared";
import type {
  GeneratedPlan,
  KnowledgeEntry,
  MaterialSegment,
  PreviewVariant,
  RunResult,
  SampleAnalysis,
  SegmentKind,
  SourceInput,
  StructureSlot,
  TimelineItem,
  VideoMetadata
} from "@byteproject/shared";

const creativeStrategySchema = z.enum(["balanced", "high_click", "high_conversion", "high_rhythm", "premium"]);
const FRAME_BUDGET = {
  minFrames: 4,
  maxFrames: 16,
  secondsPerFrame: 4
} as const;

const previewTracks: Array<Omit<PreviewVariant, "id" | "targetDurationSec" | "frameBudget" | "promptHint">> = [
  {
    track: "motion_graph_explainer",
    title: "分析派生预览",
    description: "只按本次视频分析出的 timeline、字幕、包装和缺口方案渲染，不套用预设版本。",
    renderer: "remotion"
  }
];

export const sourceInputSchema = z
  .object({
    sampleVideoIds: z.array(z.string()).optional(),
    materialVideoId: z.string().optional(),
    prompt: z.string().trim().optional(),
    productName: z.string().trim().optional(),
    sellingPoints: z.array(z.string()).optional(),
    targetAudience: z.string().trim().optional(),
    tone: z.string().trim().optional(),
    targetDurationSec: z.coerce.number().min(6).max(60).optional(),
    auxiliaryAssetIds: z.array(z.string()).optional(),
    strategy: creativeStrategySchema.optional()
  })
  .passthrough();

export const uploadRoleSchema = z.enum(["sample", "material"]);

export const uploadedFileSchema = z.object({
  originalname: z.string().min(1),
  path: z.string().min(1),
  size: z.number().nonnegative()
});

export type AgentTraceItem = {
  tool: string;
  ok: boolean;
  input: unknown;
  observation: unknown;
};

type AgentContext = {
  source: SourceInput;
  sampleVideo: VideoMetadata;
  materialVideo: VideoMetadata;
  outputDir: string;
  sample?: SampleAnalysis;
  knowledge?: KnowledgeEntry[];
  materialSegments?: MaterialSegment[];
  generated?: GeneratedPlan;
  sampleVision?: Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>;
};

type AgentRunResult = RunResult & {
  agentTrace: AgentTraceItem[];
  agentMode: "tool-calling" | "fallback";
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown, context: AgentContext): Promise<unknown>;
};

export function normalizeSourceInput(body: unknown): SourceInput {
  const parsed = sourceInputSchema.parse(body);
  const sampleVideoIds = parsed.sampleVideoIds?.length ? parsed.sampleVideoIds : ["sample-mock"];
  const source = {
    sampleVideoIds,
    materialVideoId: parsed.materialVideoId || sampleVideoIds[0],
    prompt: parsed.prompt || "把这段素材重构成一个高转化商品短视频",
    productName: parsed.productName || "未命名商品",
    sellingPoints: parsed.sellingPoints?.length ? parsed.sellingPoints : [],
    targetAudience: parsed.targetAudience || "目标用户",
    tone: parsed.tone || "专业、清晰、有节奏",
    targetDurationSec: parsed.targetDurationSec || 18,
    auxiliaryAssetIds: parsed.auxiliaryAssetIds ?? [],
    strategy: parsed.strategy || "balanced"
  };
  return {
    ...source,
    creativeSkillIds: inferCreativeSkillIds(source)
  };
}

export async function runStructureTransferAgent(input: {
  source: SourceInput;
  sampleVideo: VideoMetadata;
  materialVideo: VideoMetadata;
  outputDir: string;
}): Promise<AgentRunResult> {
  const context: AgentContext = {
    source: input.source,
    sampleVideo: input.sampleVideo,
    materialVideo: input.materialVideo,
    outputDir: input.outputDir
  };
  const trace: AgentTraceItem[] = [];

  if (!canUseToolCallingModel()) {
    return runFallbackPipeline(context, trace, "tool-calling model is not configured");
  }

  try {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are the orchestrator for a short-video structure-transfer agent. Use tools to inspect the uploaded video, analyze key frames from the sample, retrieve knowledge, evaluate available visual segments, compose the plan, ask the creative model to enhance the script/renderer prompt, and render preview. Transfer creative method, not source content. Do not answer from memory. Call tools until a preview has been rendered. Final answer must be short JSON with status and calledTools."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Run the full PRD workflow. Transfer creative structure, not sample content.",
          source: input.source,
          availableVideos: {
            sample: publicVideo(input.sampleVideo),
            availableVisualSource: publicVideo(input.materialVideo)
          },
          requiredToolPath: [
            "inspect_uploaded_video",
            "analyze_sample_video",
            "retrieve_structure_knowledge",
            "evaluate_uploaded_video_segments",
            "compose_video_plan",
            "enhance_creative_plan",
            "render_preview"
          ]
        })
      }
    ];

    for (let step = 0; step < 10; step += 1) {
      const response = await callToolCallingModel(messages, toolsForModel());
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("Tool-calling model returned no message.");

      const toolCalls = message.tool_calls ?? [];
      if (!toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls
      });

      for (const toolCall of toolCalls) {
        const tool = agentTools.find((candidate) => candidate.name === toolCall.function.name);
        if (!tool) {
          const observation = { error: `Unknown tool: ${toolCall.function.name}` };
          trace.push({ tool: toolCall.function.name, ok: false, input: {}, observation });
          messages.push(toolMessage(toolCall, observation));
          continue;
        }

        const rawInput = parseToolArguments(toolCall.function.arguments);
        try {
          const observation = await tool.execute(rawInput, context);
          trace.push({ tool: tool.name, ok: true, input: rawInput, observation: summarizeObservation(observation) });
          messages.push(toolMessage(toolCall, summarizeObservation(observation)));
        } catch (error) {
          const observation = { error: error instanceof Error ? error.message : "Tool execution failed." };
          trace.push({ tool: tool.name, ok: false, input: rawInput, observation });
          messages.push(toolMessage(toolCall, observation));
        }
      }

      if (context.generated?.demo.status === "rendered") break;
    }

    if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
      return runFallbackPipeline(context, trace, "agent did not complete required tools");
    }

    return buildRunResult(context, trace, "tool-calling");
  } catch (error) {
    return runFallbackPipeline(context, trace, error instanceof Error ? error.message : "agent failed");
  }
}

const agentTools: AgentTool[] = [
  {
    name: "inspect_uploaded_video",
    description: "Return sanitized metadata for the uploaded video. In single-video mode, the same upload is used for structure analysis and available visual assessment.",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["sample", "material"] }
      },
      required: ["role"],
      additionalProperties: false
    },
    async execute(input, context) {
      const parsed = z.object({ role: z.enum(["sample", "material"]) }).parse(input);
      return publicVideo(parsed.role === "sample" ? context.sampleVideo : context.materialVideo);
    }
  },
  {
    name: "analyze_sample_video",
    description: "Analyze the sample video with multimodal understanding when available, then normalize it into SampleAnalysis.",
    parameters: {
      type: "object",
      properties: {
        videoId: { type: "string" }
      },
      required: ["videoId"],
      additionalProperties: false
    },
    async execute(input, context) {
      z.object({ videoId: z.string() }).parse(input);
      const result = await analyzeSampleWithVision(context.sampleVideo, context.source);
      context.sample = result.analysis;
      context.sampleVision = result.model;
      return {
        sample: result.analysis,
        model: safeModelStatus(result.model)
      };
    }
  },
  {
    name: "retrieve_structure_knowledge",
    description: "Retrieve reusable structure atoms and editing patterns for the target vertical and prompt.",
    parameters: {
      type: "object",
      properties: {
        vertical: { type: "string", enum: ["marketing", "vlog", "talking_head", "cutting", "motion_graph"] },
        prompt: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 5 }
      },
      required: ["vertical", "prompt"],
      additionalProperties: false
    },
    async execute(input, context) {
      const parsed = z
        .object({
          vertical: z.enum(["marketing", "vlog", "talking_head", "cutting", "motion_graph"]).default("marketing"),
          prompt: z.string().default(context.source.prompt),
          limit: z.number().min(1).max(5).default(3)
        })
        .parse(input);
      context.knowledge = knowledgeStore.retrieve({ vertical: parsed.vertical, prompt: parsed.prompt, limit: parsed.limit });
      return { entries: context.knowledge };
    }
  },
  {
    name: "evaluate_uploaded_video_segments",
    description: "Segment and classify available frames or visual sections from the uploaded video into candidate segments for gap diagnosis.",
    parameters: {
      type: "object",
      properties: {
        videoId: { type: "string" },
        prompt: { type: "string" }
      },
      required: ["videoId", "prompt"],
      additionalProperties: false
    },
    async execute(input, context) {
      const parsed = z.object({ videoId: z.string(), prompt: z.string() }).parse(input);
      void parsed.videoId;
      context.materialSegments = segmentLongVideo(context.materialVideo, parsed.prompt, context.source.targetDurationSec);
      return { video: publicVideo(context.materialVideo), segments: context.materialSegments };
    }
  },
  {
    name: "compose_video_plan",
    description: "Compose script, storyboard, timeline, slot matches, gap plans, packaging suggestions, and rationale.",
    parameters: {
      type: "object",
      properties: {
        strategy: { type: "string", enum: ["balanced", "high_click", "high_conversion", "high_rhythm", "premium"] }
      },
      required: [],
      additionalProperties: false
    },
    async execute(input, context) {
      const parsed = z.object({ strategy: creativeStrategySchema.optional() }).parse(input);
      let sample = context.sample;
      if (!sample) {
        const sampleResult = await analyzeSampleWithVision(context.sampleVideo, context.source);
        sample = sampleResult.analysis;
        context.sample = sample;
        context.sampleVision = sampleResult.model;
      }
      const knowledge = context.knowledge ?? knowledgeStore.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
      const materialSegments = context.materialSegments ?? segmentLongVideo(context.materialVideo, context.source.prompt, context.source.targetDurationSec);
      context.sample = sample;
      context.knowledge = knowledge;
      context.materialSegments = materialSegments;
      const source = parsed.strategy ? { ...context.source, strategy: parsed.strategy } : context.source;
      context.generated = await composeModelGeneratedPlan(context, source, sample, knowledge, materialSegments);
      context.source = source;
      return { generated: context.generated };
    }
  },
  {
    name: "enhance_creative_plan",
    description: "Optionally ask the configured model to improve captions, script, timeline packaging, and rationale.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    async execute(_input, context) {
      if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
        throw new Error("compose_video_plan must run before enhance_creative_plan.");
      }
      const modelResult = await modelCreativeAdapter.run({
        source: context.source,
        sample: context.sample,
        knowledge: context.knowledge,
        materialSegments: context.materialSegments,
        plan: context.generated
      });
      applyModelEnhancement(context.generated, modelResult.enhancement);
      if (modelResult.provider === "ark" && modelResult.enhancement) {
        context.generated.compositionPlan.rationale = ["已完成在线模型创意增强。", ...context.generated.compositionPlan.rationale].slice(0, 5);
      }
      return {
        enhanced: Boolean(modelResult.enhancement),
        generated: context.generated
      };
    }
  },
  {
    name: "render_preview",
    description: "Render or create the preview output for the generated video plan.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    async execute(_input, context) {
      if (!context.generated) throw new Error("compose_video_plan must run before render_preview.");
      addAnalysisRationale(context);
      const preview = await remotionStoryboardAdapter.run({
        plan: context.generated,
        outputDir: context.outputDir,
        materialVideo: context.materialVideo,
        materialSegments: context.materialSegments
      });
      context.generated.demo = {
        status: "rendered",
        url: preview.url,
        note: preview.url.endsWith(".mp4") ? "已自动生成 MP4 成片草稿。" : "已生成 HTML 预览；MP4 渲染不可用时使用该兜底。"
      };
      return { demo: context.generated.demo };
    }
  }
];

function toolsForModel() {
  return agentTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

async function runFallbackPipeline(context: AgentContext, trace: AgentTraceItem[], reason: string): Promise<AgentRunResult> {
  const sampleResult = await analyzeSampleWithVision(context.sampleVideo, context.source);
  context.sample = sampleResult.analysis;
  context.sampleVision = sampleResult.model;
  if (sampleResult.model.analysis) {
    trace.push({
      tool: "vision_model",
      ok: true,
      input: { videoId: context.sampleVideo.id },
      observation: safeModelStatus(sampleResult.model)
    });
  } else if (sampleResult.model.error) {
    trace.push({
      tool: "vision_model",
      ok: false,
      input: { videoId: context.sampleVideo.id },
      observation: safeModelStatus(sampleResult.model)
    });
  }
  context.knowledge = knowledgeStore.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
  context.materialSegments = segmentLongVideo(context.materialVideo, context.source.prompt, context.source.targetDurationSec);
  try {
    context.generated = await composeModelGeneratedPlan(context, context.source, context.sample, context.knowledge, context.materialSegments);
    trace.push({
      tool: "model_plan_composer",
      ok: true,
      input: { source: context.source.prompt },
      observation: {
        status: "ok",
        timelineItems: context.generated.timeline.length,
        slotMatches: context.generated.compositionPlan.slotMatches.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "model plan generation failed";
    context.generated = buildModelRequiredFailurePlan(context.source, publicModelFailureReason(message));
    trace.push({
      tool: "model_plan_composer",
      ok: false,
      input: { source: context.source.prompt },
      observation: {
        status: "failed",
        error: publicModelFailureReason(message)
      }
    });
    return buildRunResult(context, trace, "fallback");
  }
  const modelResult = await modelCreativeAdapter.run({
    source: context.source,
    sample: context.sample,
    knowledge: context.knowledge,
    materialSegments: context.materialSegments,
    plan: context.generated
  });
  applyModelEnhancement(context.generated, modelResult.enhancement);
  if (!modelResult.enhancement && modelResult.error) {
    trace.push({
      tool: "creative_model",
      ok: false,
      input: { planId: context.generated.id },
      observation: {
        provider: modelResult.provider,
        status: "fallback",
        error: publicModelFailureReason(modelResult.error)
      }
    });
  }
  context.generated.compositionPlan.rationale = [
    `Agent 工具调用暂未完成，已切换到确定性编排：${publicFallbackReason(reason)}`,
    ...context.generated.compositionPlan.rationale
  ].slice(0, 5);
  addAnalysisRationale(context);
  const preview = await remotionStoryboardAdapter.run({
    plan: context.generated,
    outputDir: context.outputDir,
    materialVideo: context.materialVideo,
    materialSegments: context.materialSegments
  });
  context.generated.demo = {
    status: "rendered",
    url: preview.url,
    note: preview.url.endsWith(".mp4") ? "已自动生成 MP4 成片草稿。" : "已生成 HTML 预览；MP4 渲染不可用时使用该兜底。"
  };
  trace.push({
    tool: "fallback_pipeline",
    ok: true,
    input: { reason: publicFallbackReason(reason) },
    observation: {
      sampleSlots: context.sample.slots.length,
      materialSegments: context.materialSegments.length,
      timelineItems: context.generated.timeline.length
    }
  });
  return buildRunResult(context, trace, "fallback");
}

export async function analyzeSampleWithVision(
  video: VideoMetadata,
  source: Pick<SourceInput, "prompt" | "productName" | "sellingPoints" | "targetAudience" | "tone" | "targetDurationSec">
): Promise<{
  analysis: SampleAnalysis;
  model: Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>;
}> {
  const model = await modelVideoUnderstandingAdapter.run({
    video,
    role: "sample",
    prompt: source.prompt,
    productName: source.productName,
    targetDurationSec: source.targetDurationSec
  });

  if (!model.analysis) {
    return {
      analysis: createModelMissingSampleAnalysis(video, source, model),
      model
    };
  }

  const transcript = model.analysis.transcript?.length ? model.analysis.transcript : createBriefDrivenTranscript(source, video);
  const analysis = analyzeSampleVideo(video, transcript);
  return {
    analysis: {
      ...analysis,
      summary: model.analysis.summary || analysis.summary,
      rhythmPattern: model.analysis.rhythmPattern || analysis.rhythmPattern,
      packagingPattern: model.analysis.packagingPattern?.length ? model.analysis.packagingPattern : analysis.packagingPattern,
      shotCount: model.analysis.shotCount || analysis.shotCount,
      slots: mergeVisionSlots(analysis.slots, model.analysis.slots)
    },
    model
  };
}

function createModelMissingSampleAnalysis(
  video: VideoMetadata,
  source: Pick<SourceInput, "prompt" | "productName" | "sellingPoints" | "targetAudience" | "tone" | "targetDurationSec">,
  model: Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>
): SampleAnalysis {
  void source;
  return {
    video,
    transcript: [],
    summary: `等待模型从 ${video.fileName} 的抽帧里识别结构槽位；没有视觉分析结果时不生成预设结构。`,
    slots: [],
    atoms: [],
    rhythmPattern: "未生成：需要模型视觉分析。",
    packagingPattern: [],
    shotCount: getFrameCount(video, model)
  };
}

function mergeVisionSlots(baseSlots: StructureSlot[], visionSlots?: NonNullable<Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>["analysis"]>["slots"]): StructureSlot[] {
  if (!visionSlots?.length) return baseSlots;
  void baseSlots;
  return visionSlots.map((vision, index) => {
    const segment = vision.segment ?? segmentOrder[Math.min(index, segmentOrder.length - 1)];
    return {
      id: `vision-${segment}-${index + 1}`,
      segment,
      intent: vision.intent || `模型识别结构 ${index + 1}`,
      requiredAssetTypes: vision.requiredAssetTypes?.length ? vision.requiredAssetTypes : [],
      durationSec: vision.durationSec || normalizeVisionSlotDuration(index),
      importance: index === 0 ? "high" : "medium",
      rhythmHint: vision.rhythmHint || "medium",
      packagingHints: vision.packagingHints?.length ? vision.packagingHints : []
    };
  });
}

const segmentOrder: SegmentKind[] = ["hook", "body", "proof", "offer", "cta"];

function normalizeVisionSlotDuration(index: number) {
  return [2.4, 3.6, 4.8, 3.2, 2][Math.min(index, 4)];
}

function applyModelEnhancement(generated: GeneratedPlan, enhancement: Awaited<ReturnType<typeof modelCreativeAdapter.run>>["enhancement"]) {
  if (!enhancement) return;

  if (enhancement.script) generated.script = enhancement.script;
  if (enhancement.rendererPrompt) generated.rendererPrompt = enhancement.rendererPrompt;
  if (enhancement.packagingSuggestions?.length) generated.packagingSuggestions = enhancement.packagingSuggestions;
  if (enhancement.rationale?.length) generated.compositionPlan.rationale = enhancement.rationale;

  if (enhancement.timeline?.length) {
    const timelineById = new Map(enhancement.timeline.filter((item) => item.id).map((item) => [item.id!, item]));
    const timelineBySlot = new Map(enhancement.timeline.filter((item) => item.slotId).map((item) => [item.slotId!, item]));
    generated.timeline = generated.timeline.map((item) => {
      const update = timelineById.get(item.id) ?? timelineBySlot.get(item.slotId);
      if (!update) return item;
      return {
        ...item,
        caption: update.caption || item.caption,
        packaging: update.packaging?.length ? update.packaging : item.packaging,
        transition: update.transition || item.transition,
        beatHint: update.beatHint || item.beatHint
      };
    });
  }

  if (enhancement.storyboard?.length) {
    const storyboardBySlot = new Map(enhancement.storyboard.filter((item) => item.slotId).map((item) => [item.slotId!, item]));
    generated.storyboard = generated.storyboard.map((item) => {
      const update = storyboardBySlot.get(item.slotId);
      if (!update) return item;
      return {
        ...item,
        title: update.title || item.title,
        visual: update.visual || item.visual,
        caption: update.caption || item.caption,
        reason: update.reason || item.reason
      };
    });
  }
}

async function composeModelGeneratedPlan(
  context: AgentContext,
  source: SourceInput,
  sample: SampleAnalysis,
  knowledge: KnowledgeEntry[],
  materialSegments: MaterialSegment[]
): Promise<GeneratedPlan> {
  if (!context.sampleVision?.analysis?.slots?.length || !sample.slots.length) {
    throw new Error("Model video understanding with structure slots is required before composing a production plan.");
  }

  const result = await modelPlanComposerAdapter.run({
    source,
    sample,
    knowledge,
    materialSegments
  });

  if (!result.plan) {
    throw new Error(result.error || "Model did not return a production plan.");
  }

  const generated = buildGeneratedPlanFromModel(source, sample, materialSegments, result.plan);
  return generated;
}

function buildGeneratedPlanFromModel(
  source: SourceInput,
  sample: SampleAnalysis,
  materialSegments: MaterialSegment[],
  plan: NonNullable<Awaited<ReturnType<typeof modelPlanComposerAdapter.run>>["plan"]>
): GeneratedPlan {
  if (!plan.timeline?.length) throw new Error("Model plan did not include a timeline.");
  if (!plan.slotMatches?.length) throw new Error("Model plan did not include slotMatches.");

  const slotIds = new Set(sample.slots.map((slot) => slot.id));
  const materialIds = new Set(materialSegments.map((segment) => segment.id));
  const slotMatches = plan.slotMatches
    .filter((match) => match.slotId && slotIds.has(match.slotId))
    .map((match) => ({
      slotId: match.slotId!,
      status: match.status ?? (match.assetIds?.length ? "matched" : "missing"),
      assetIds: (match.assetIds ?? []).filter((id) => materialIds.has(id)),
      confidence: match.confidence ?? 0.5,
      reason: match.reason ?? "Model-selected slot match.",
      gapPlan: match.gapPlan?.strategy
        ? {
            strategy: match.gapPlan.strategy,
            output: match.gapPlan.output ?? "Complete this slot with model-planned packaging."
          }
        : undefined
    }));

  const timeline = plan.timeline
    .filter((item) => item.slotId && slotIds.has(item.slotId) && typeof item.startSec === "number" && typeof item.endSec === "number" && item.endSec > item.startSec)
    .map((item, index) => ({
      id: item.id || `timeline-${index + 1}`,
      startSec: Number(item.startSec!.toFixed(2)),
      endSec: Number(item.endSec!.toFixed(2)),
      slotId: item.slotId!,
      assetIds: (item.assetIds ?? []).filter((id) => materialIds.has(id)),
      caption: item.caption || "",
      packaging: item.packaging?.length ? item.packaging : [],
      transition: item.transition,
      beatHint: item.beatHint
    }));

  if (!timeline.length) throw new Error("Model timeline did not contain valid timed items.");

  const storyboard = (plan.storyboard ?? []).filter((item) => item.slotId && slotIds.has(item.slotId)).map((item, index) => ({
    id: item.id || `storyboard-${index + 1}`,
    slotId: item.slotId!,
    title: item.title || `镜头 ${index + 1}`,
    visual: item.visual || "",
    caption: item.caption || timeline.find((candidate) => candidate.slotId === item.slotId)?.caption || "",
    reason: item.reason || ""
  }));

  const previewVariants = buildPreviewVariants(source, timeline);

  return {
    id: `plan-${Date.now()}`,
    script: plan.script || timeline.map((item) => item.caption).join("\n"),
    storyboard,
    timeline,
    compositionPlan: {
      id: `composition-${Date.now()}`,
      strategy: source.strategy,
      selectedAtomIds: sample.atoms.slice(0, 6).map((atom) => atom.id),
      slotMatches,
      rationale: [
        "Model generated the structure transfer recipe and timeline.",
        ...(plan.rationale ?? [])
      ].slice(0, 5)
    },
    packagingSuggestions: plan.packagingSuggestions ?? [],
    rendererPrompt: plan.rendererPrompt || "Render the model-generated timeline as a vertical MP4.",
    previewVariants,
    demo: {
      status: "mock_ready",
      note: "Model-generated production recipe is ready for rendering."
    }
  };
}

function buildPreviewVariants(source: SourceInput, timeline: TimelineItem[]): PreviewVariant[] {
  const targetDurationSec = Math.max(10, Math.min(60, timeline.at(-1)?.endSec ?? source.targetDurationSec ?? 18));
  return previewTracks.map((track, index) => ({
    id: `preview-${index + 1}-${track.track}`,
    ...track,
    targetDurationSec,
    frameBudget: { ...FRAME_BUDGET },
    promptHint: [
      `Render a ${track.title} local preview with ${track.renderer}.`,
      `Keep the result within ${targetDurationSec}s and use a ${FRAME_BUDGET.minFrames}-${FRAME_BUDGET.maxFrames} frame analysis budget.`,
      "Use the transferred structure and new brief only; do not copy sample visuals, sample subtitles, or original copy.",
      `Focus: ${track.description}`
    ].join(" ")
  }));
}

function buildModelRequiredFailurePlan(source: SourceInput, reason: string): GeneratedPlan {
  return {
    id: `plan-${Date.now()}`,
    script: "",
    storyboard: [],
    timeline: [],
    compositionPlan: {
      id: `composition-${Date.now()}`,
      strategy: source.strategy,
      selectedAtomIds: [],
      slotMatches: [],
      rationale: [`Model video planning failed: ${reason}`]
    },
    packagingSuggestions: [],
    rendererPrompt: "",
    previewVariants: [],
    demo: {
      status: "failed",
      note: "Model planning is required, so no local heuristic video was generated."
    }
  };
}

function buildRunResult(context: AgentContext, trace: AgentTraceItem[], mode: AgentRunResult["agentMode"]): AgentRunResult {
  if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
    throw new Error("Agent context is incomplete.");
  }
  return {
    mode: hasUploadedVideo(context.sampleVideo) ? "real" : "mock",
    source: context.source,
    samples: [publicSampleAnalysis(context.sample)],
    knowledge: context.knowledge,
    material: {
      video: publicVideo(context.materialVideo),
      segments: context.materialSegments
    },
    generated: context.generated,
    agentTrace: trace,
    agentMode: mode
  };
}

function addAnalysisRationale(context: AgentContext) {
  if (!context.generated) return;
  const frameCount = getFrameCount(context.sampleVideo, context.sampleVision);
  if (!context.sampleVision?.analysis) {
    context.generated.compositionPlan.rationale = [
      `模型没有返回视频结构分析 slots；本轮不应输出预设方案。已抽取关键帧数量：${frameCount}。`,
      ...context.generated.compositionPlan.rationale
    ].slice(0, 5);
    return;
  }
  context.generated.compositionPlan.rationale = [
    `已对样例视频抽取 ${context.sampleVision.frameCount ?? 0} 张关键帧，并完成真实视觉结构拆解。`,
    ...context.generated.compositionPlan.rationale
  ].slice(0, 5);
}

async function callToolCallingModel(messages: ChatMessage[], tools: ReturnType<typeof toolsForModel>) {
  const baseUrl = normalizeBaseUrl(process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3");
  const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
  const apiKey = process.env.ARK_API_KEY;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    throw new Error(`tool-calling request failed with ${response.status}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
  };
}

function canUseToolCallingModel() {
  if (process.env.ENABLE_AGENT_TOOL_CALLING === "false") return false;
  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL;
  return Boolean(apiKey && apiKey !== "replace_me" && model && model !== "replace_me");
}

function parseToolArguments(value: string) {
  if (!value.trim()) return {};
  return JSON.parse(value) as unknown;
}

function toolMessage(toolCall: ToolCall, observation: unknown): ChatMessage {
  return {
    role: "tool",
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
    content: JSON.stringify(observation)
  };
}

function summarizeObservation(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if ("sample" in value) {
    const sample = (value as { sample: SampleAnalysis; model?: unknown }).sample;
    return {
      sample: {
        summary: sample.summary,
        slotCount: sample.slots.length,
        shotCount: sample.shotCount,
        rhythmPattern: sample.rhythmPattern
      },
      model: (value as { model?: unknown }).model
    };
  }
  if ("entries" in value) {
    const entries = (value as { entries: KnowledgeEntry[] }).entries;
    return { entries: entries.map((entry) => ({ id: entry.id, title: entry.title, atoms: entry.atoms.length })) };
  }
  if ("segments" in value) {
    const segments = (value as { segments: MaterialSegment[] }).segments;
    return { segmentCount: segments.length, segments: segments.slice(0, 5) };
  }
  if ("generated" in value) {
    const generated = (value as { generated: GeneratedPlan }).generated;
    return {
      generated: {
        id: generated.id,
        timelineItems: generated.timeline.length,
        slotMatches: generated.compositionPlan.slotMatches.length,
        demo: generated.demo.status
      }
    };
  }
  return value;
}

export function publicVideo(video: VideoMetadata): VideoMetadata {
  return {
    id: video.id,
    role: video.role,
    fileName: video.fileName,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    fps: video.fps,
    sizeBytes: video.sizeBytes,
    coverUrl: video.coverUrl,
    previewFrameCount: video.previewFrameCount ?? video.previewFrameDataUrls?.length
  };
}

export function publicSampleAnalysis(sample: SampleAnalysis): SampleAnalysis {
  return {
    ...sample,
    video: publicVideo(sample.video)
  };
}

export function safeModelStatus(model: Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>) {
  return {
    provider: model.provider,
    usedVision: Boolean(model.analysis),
    frameCount: model.frameCount ?? 0,
    status: model.analysis ? "ok" : "fallback",
    error: model.analysis ? undefined : publicModelFailureReason(model.error)
  };
}

function publicFallbackReason(reason: string) {
  if (/401|api key|authentication|bearer|credential|not configured/i.test(reason)) return "在线工具调用鉴权失败";
  if (/endpoint/i.test(reason)) return "在线模型 endpoint 配置不可用";
  if (/fetch failed|network|ENOTFOUND|ECONN/i.test(reason)) return "在线模型网络请求失败";
  if (/ark/i.test(reason)) return "在线工具调用暂不可用";
  return reason.slice(0, 120);
}

function publicModelFailureReason(error: string | undefined) {
  if (!error) return "在线模型未返回有效视觉结果";
  if (/401|api key|authentication|bearer/i.test(error)) return "在线模型鉴权失败，未生成预设兜底结果";
  if (/credential|not configured|replace_me/i.test(error)) return "在线模型凭证未配置，未生成预设兜底结果";
  if (/endpoint/i.test(error)) return "在线模型 endpoint 配置不可用";
  if (/fetch failed|network|ENOTFOUND|ECONN/i.test(error)) return "在线模型网络请求失败";
  if (/No frames|spawn|ffmpeg|frame/i.test(error)) return "视频关键帧抽取失败";
  return "在线模型暂不可用";
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveOutputDir(value?: string) {
  return resolve(value ?? process.env.OUTPUT_DIR ?? "data/outputs");
}

function getFrameCount(video: VideoMetadata, model?: Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>) {
  return model?.frameCount ?? video.previewFrameDataUrls?.length ?? 0;
}

function hasUploadedVideo(video: VideoMetadata) {
  return Boolean(video.localPath || video.previewFrameDataUrls?.length || video.sizeBytes > 0);
}
