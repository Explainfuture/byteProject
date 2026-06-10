import { segmentLongVideo } from "@byteproject/core";
import { ensureBenchmarkScore, renderCurrentCandidate } from "./benchmarkIteration";
import { startToolUse } from "./events";
import { addAnalysisRationale, applyModelEnhancement, buildModelRequiredFailurePlan, composeModelGeneratedPlan } from "./planning";
import { publicFallbackReason, publicModelFailureReason, safeModelStatus } from "./publicContracts";
import { buildRunResult } from "./result";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import { analyzeSampleWithVision } from "./sampleAnalysis";
import type { AgentContext, AgentRunResult, AgentTraceItem } from "./types";

export async function runFallbackPipeline(context: AgentContext, trace: AgentTraceItem[], reason: string, runtime: AgentRuntime = defaultAgentRuntime): Promise<AgentRunResult> {
  const visionEvent = startToolUse(context, "vision_model", { videoId: context.sampleVideo.id });
  const sampleResult = await analyzeSampleWithVision(context.sampleVideo, context.source, runtime).catch((error) => {
    visionEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "vision analysis failed") });
    throw error;
  });
  context.sample = sampleResult.analysis;
  context.sampleVision = sampleResult.model;
  if (sampleResult.model.analysis) {
    visionEvent.end(safeModelStatus(sampleResult.model));
    trace.push({
      tool: "vision_model",
      ok: true,
      input: { videoId: context.sampleVideo.id },
      observation: safeModelStatus(sampleResult.model)
    });
  } else if (sampleResult.model.error) {
    visionEvent.error(safeModelStatus(sampleResult.model));
    trace.push({
      tool: "vision_model",
      ok: false,
      input: { videoId: context.sampleVideo.id },
      observation: safeModelStatus(sampleResult.model)
    });
  } else {
    visionEvent.end(safeModelStatus(sampleResult.model));
  }
  const knowledgeEvent = startToolUse(context, "retrieve_structure_knowledge", { vertical: "marketing", prompt: context.source.prompt, limit: 3 });
  context.knowledge = runtime.knowledge.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
  knowledgeEvent.end({ entries: context.knowledge.map((entry) => ({ id: entry.id, title: entry.title })) });
  const segmentEvent = startToolUse(context, "evaluate_uploaded_video_segments", { videoId: context.materialVideo.id, prompt: context.source.prompt });
  context.materialSegments = segmentLongVideo(context.materialVideo, context.source.prompt, context.source.targetDurationSec);
  segmentEvent.end({ segmentCount: context.materialSegments.length });
  const composeEvent = startToolUse(context, "model_plan_composer", { source: context.source.prompt });
  try {
    context.generated = await composeModelGeneratedPlan(context, context.source, context.sample, context.knowledge, context.materialSegments, runtime);
    composeEvent.end({
      status: "ok",
      timelineItems: context.generated.timeline.length,
      slotMatches: context.generated.compositionPlan.slotMatches.length
    });
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
    composeEvent.error({
      status: "failed",
      error: publicModelFailureReason(message)
    });
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
    await ensureBenchmarkScore(context, trace, runtime);
    return buildRunResult(context, trace, "fallback");
  }
  const creativeEvent = startToolUse(context, "creative_model", { planId: context.generated.id });
  const modelResult = await runtime.creativeModel.run({
    source: context.source,
    sample: context.sample,
    knowledge: context.knowledge,
    materialSegments: context.materialSegments,
    plan: context.generated
  }).catch((error) => {
    creativeEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "creative model failed") });
    throw error;
  });
  applyModelEnhancement(context.generated, modelResult.enhancement);
  if (!modelResult.enhancement && modelResult.error) {
    creativeEvent.error({
      provider: modelResult.provider,
      status: "fallback",
      error: publicModelFailureReason(modelResult.error)
    });
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
  } else {
    creativeEvent.end({ provider: modelResult.provider, enhanced: Boolean(modelResult.enhancement) });
  }
  context.generated.compositionPlan.rationale = [
    `Agent 工具调用暂未完成，已切换到确定性编排：${publicFallbackReason(reason)}`,
    ...context.generated.compositionPlan.rationale
  ].slice(0, 5);
  addAnalysisRationale(context);
  await renderCurrentCandidate(context, "已自动生成 MP4 成片草稿。", runtime);
  const fallbackEvent = startToolUse(context, "fallback_pipeline", { reason: publicFallbackReason(reason) });
  fallbackEvent.end({
    sampleSlots: context.sample.slots.length,
    materialSegments: context.materialSegments.length,
    timelineItems: context.generated.timeline.length
  });
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
  await ensureBenchmarkScore(context, trace, runtime);
  return buildRunResult(context, trace, "fallback");
}
