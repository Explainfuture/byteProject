import { z } from "zod";
import { segmentLongVideo } from "@byteproject/core";
import { inferCreativeSkillIds } from "@byteproject/shared";
import { ensureBenchmarkScore, renderCurrentCandidate } from "./benchmarkIteration";
import { FRAME_BUDGET } from "./constants";
import { composeModelGeneratedPlan, addAnalysisRationale, applyModelEnhancement } from "./planning";
import { publicVideo, safeModelStatus } from "./publicContracts";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import { analyzeSampleWithVision } from "./sampleAnalysis";
import { creativeStrategySchema } from "./schemas";
import type { AgentTool } from "./types";

export function createAgentTools(runtime: AgentRuntime = defaultAgentRuntime): AgentTool[] {
  return [
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
    name: "select_creative_sku_and_tools",
    description: "Choose creative reconstruction SKUs and concrete tool path after a real upload and brief are available. Do not run before inspecting the uploaded video.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" }
      },
      required: [],
      additionalProperties: false
    },
    async execute(input, context) {
      const parsed = z.object({ prompt: z.string().optional() }).parse(input);
      const source = parsed.prompt ? { ...context.source, prompt: parsed.prompt } : context.source;
      const creativeSkillIds = inferCreativeSkillIds(source);
      context.source = { ...source, creativeSkillIds };
      return {
        model: process.env.ARK_ENDPOINT_ID || process.env.ARK_MODEL || "Doubao-Seed-2.0-lite-compatible",
        creativeSkillIds,
        toolPath: [
          "analyze_sample_video",
          "evaluate_uploaded_video_segments",
          "compose_video_plan",
          "render_preview",
          "score_candidate"
        ],
        framePlan: {
          strategy: "middle-budget",
          minFrames: FRAME_BUDGET.minFrames,
          maxFrames: FRAME_BUDGET.maxFrames,
          secondsPerFrame: FRAME_BUDGET.secondsPerFrame
        }
      };
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
      const result = await analyzeSampleWithVision(context.sampleVideo, context.source, runtime);
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
      context.knowledge = runtime.knowledge.retrieve({ vertical: parsed.vertical, prompt: parsed.prompt, limit: parsed.limit });
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
        const sampleResult = await analyzeSampleWithVision(context.sampleVideo, context.source, runtime);
        sample = sampleResult.analysis;
        context.sample = sample;
        context.sampleVision = sampleResult.model;
      }
      const knowledge = context.knowledge ?? runtime.knowledge.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
      const materialSegments = context.materialSegments ?? segmentLongVideo(context.materialVideo, context.source.prompt, context.source.targetDurationSec);
      context.sample = sample;
      context.knowledge = knowledge;
      context.materialSegments = materialSegments;
      const source = parsed.strategy ? { ...context.source, strategy: parsed.strategy } : context.source;
      context.generated = await composeModelGeneratedPlan(context, source, sample, knowledge, materialSegments, runtime);
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
      const modelResult = await runtime.creativeModel.run({
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
      await renderCurrentCandidate(context, "已自动生成 MP4 成片草稿。", runtime);
      return { demo: context.generated.demo };
    }
  },
  {
    name: "score_candidate",
    description: "Score the rendered candidate with the 100-point viral quality benchmark and return revisionBrief when score is below target.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    },
    async execute(_input, context) {
      await ensureBenchmarkScore(context, undefined, runtime);
      return {
        benchmarkScore: context.benchmarkScore,
        accepted: context.benchmarkScore?.accepted,
        topFixes: context.benchmarkScore?.topFixes
      };
    }
  }
  ];
}

export const agentTools = createAgentTools();

export function toolsForModel(tools: AgentTool[] = agentTools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}
