import { resolve } from "node:path";
import { z } from "zod";
import { modelCreativeAdapter, modelVideoUnderstandingAdapter, remotionStoryboardAdapter } from "@byteproject/adapters";
import { analyzeSampleVideo, composePlan, createMockTranscript, segmentLongVideo } from "@byteproject/core";
import { knowledgeStore } from "@byteproject/knowledge";
import type { GeneratedPlan, KnowledgeEntry, MaterialSegment, RunResult, SampleAnalysis, SourceInput, StructureSlot, VideoMetadata } from "@byteproject/shared";

const creativeStrategySchema = z.enum(["balanced", "high_click", "high_conversion", "high_rhythm", "premium"]);

export const sourceInputSchema = z
  .object({
    sampleVideoIds: z.array(z.string()).optional(),
    materialVideoId: z.string().optional(),
    prompt: z.string().trim().optional(),
    productName: z.string().trim().optional(),
    sellingPoints: z.array(z.string()).optional(),
    targetAudience: z.string().trim().optional(),
    tone: z.string().trim().optional(),
    targetDurationSec: z.coerce.number().min(6).max(180).optional(),
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
  return {
    sampleVideoIds: parsed.sampleVideoIds?.length ? parsed.sampleVideoIds : ["sample-mock"],
    materialVideoId: parsed.materialVideoId || "material-mock",
    prompt: parsed.prompt || "把这段素材重构成一个高转化商品短视频",
    productName: parsed.productName || "智能随行杯",
    sellingPoints: parsed.sellingPoints?.length ? parsed.sellingPoints : ["一眼看见余量", "三种提醒模式", "轻巧不占包"],
    targetAudience: parsed.targetAudience || "通勤和运动人群",
    tone: parsed.tone || "清爽、有节奏、偏转化",
    targetDurationSec: parsed.targetDurationSec || 18,
    auxiliaryAssetIds: parsed.auxiliaryAssetIds ?? [],
    strategy: parsed.strategy || "balanced"
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
          "You are the orchestrator for a short-video structure-transfer agent. Use tools to inspect videos, analyze the sample, retrieve knowledge, segment material, compose the plan, and render preview. Do not answer from memory. Call tools until a preview has been rendered. Final answer must be short JSON with status and calledTools."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Run the full PRD workflow. Transfer creative structure, not sample content.",
          source: input.source,
          availableVideos: {
            sample: publicVideo(input.sampleVideo),
            material: publicVideo(input.materialVideo)
          },
          requiredToolPath: [
            "inspect_uploaded_video",
            "analyze_sample_video",
            "retrieve_structure_knowledge",
            "segment_material_video",
            "compose_video_plan",
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
    description: "Return sanitized metadata for the uploaded sample or material video.",
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
    name: "segment_material_video",
    description: "Segment and classify the new long material video into candidate segments.",
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
      context.materialSegments = segmentLongVideo(context.materialVideo, parsed.prompt);
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
      const sample = context.sample ?? (await analyzeSampleWithVision(context.sampleVideo, context.source)).analysis;
      const knowledge = context.knowledge ?? knowledgeStore.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
      const materialSegments = context.materialSegments ?? segmentLongVideo(context.materialVideo, context.source.prompt);
      context.sample = sample;
      context.knowledge = knowledge;
      context.materialSegments = materialSegments;
      const source = parsed.strategy ? { ...context.source, strategy: parsed.strategy } : context.source;
      context.generated = composePlan({ source, samples: [sample], knowledge, materialSegments });
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
      const preview = await remotionStoryboardAdapter.run({ plan: context.generated, outputDir: context.outputDir });
      context.generated.demo = {
        status: "rendered",
        url: preview.url,
        note: "已生成 Remotion/HTML 预览；可继续接入服务端 MP4 渲染。"
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
  if (!sampleResult.model.analysis && sampleResult.model.error) {
    trace.push({
      tool: "vision_model",
      ok: false,
      input: { videoId: context.sampleVideo.id },
      observation: safeModelStatus(sampleResult.model)
    });
  }
  context.knowledge = knowledgeStore.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
  context.materialSegments = segmentLongVideo(context.materialVideo, context.source.prompt);
  context.generated = composePlan({
    source: context.source,
    samples: [context.sample],
    knowledge: context.knowledge,
    materialSegments: context.materialSegments
  });
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
  const preview = await remotionStoryboardAdapter.run({ plan: context.generated, outputDir: context.outputDir });
  context.generated.demo = {
    status: "rendered",
    url: preview.url,
    note: "已生成 Remotion/HTML 预览；可继续接入服务端 MP4 渲染。"
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
  source: Pick<SourceInput, "prompt" | "productName" | "targetDurationSec">
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
      analysis: analyzeSampleVideo(video, createMockTranscript(source.productName)),
      model
    };
  }

  const transcript = model.analysis.transcript?.length ? model.analysis.transcript : createMockTranscript(source.productName);
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

function mergeVisionSlots(baseSlots: StructureSlot[], visionSlots?: NonNullable<Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>["analysis"]>["slots"]) {
  if (!visionSlots?.length) return baseSlots;
  const bySegment = new Map(visionSlots.filter((slot) => slot.segment).map((slot) => [slot.segment!, slot]));
  return baseSlots.map((slot) => {
    const vision = bySegment.get(slot.segment);
    if (!vision) return slot;
    return {
      ...slot,
      intent: vision.intent || slot.intent,
      durationSec: vision.durationSec || slot.durationSec,
      rhythmHint: vision.rhythmHint || slot.rhythmHint,
      packagingHints: vision.packagingHints?.length ? vision.packagingHints : slot.packagingHints
    };
  });
}

function applyModelEnhancement(generated: GeneratedPlan, enhancement: Awaited<ReturnType<typeof modelCreativeAdapter.run>>["enhancement"]) {
  if (!enhancement) return;

  if (enhancement.script) generated.script = enhancement.script;
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

function buildRunResult(context: AgentContext, trace: AgentTraceItem[], mode: AgentRunResult["agentMode"]): AgentRunResult {
  if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
    throw new Error("Agent context is incomplete.");
  }
  return {
    mode: process.env.ENABLE_MOCK_GENERATION === "false" ? "real" : "mock",
    source: context.source,
    samples: [context.sample],
    knowledge: context.knowledge,
    material: {
      video: context.materialVideo,
      segments: context.materialSegments
    },
    generated: context.generated,
    agentTrace: trace,
    agentMode: mode
  };
}

function addAnalysisRationale(context: AgentContext) {
  if (!context.generated) return;
  context.generated.compositionPlan.rationale = [
    context.sampleVision?.analysis
      ? `已对样例视频抽取 ${context.sampleVision.frameCount ?? 0} 张关键帧，并完成真实视觉结构拆解。`
      : `真实视觉拆解暂不可用：${publicModelFailureReason(context.sampleVision?.error)}，已使用本地结构规则完成样例分析。`,
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

function publicVideo(video: VideoMetadata) {
  return {
    id: video.id,
    role: video.role,
    fileName: video.fileName,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    fps: video.fps,
    sizeBytes: video.sizeBytes
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
  if (/401|api key|authentication|bearer/i.test(reason)) return "在线工具调用鉴权失败";
  if (/endpoint/i.test(reason)) return "在线模型 endpoint 配置不可用";
  if (/fetch failed|network|ENOTFOUND|ECONN/i.test(reason)) return "在线模型网络请求失败";
  if (/ark/i.test(reason)) return "在线工具调用暂不可用";
  return reason.slice(0, 120);
}

function publicModelFailureReason(error: string | undefined) {
  if (!error) return "在线模型未返回有效视觉结果";
  if (/401|api key|authentication|bearer/i.test(error)) return "在线模型鉴权失败，请检查 ARK_API_KEY";
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
