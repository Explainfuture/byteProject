import { segmentLongVideo } from "@byteproject/core";
import { ensureBenchmarkScore, renderCurrentCandidate } from "./benchmarkIteration";
import { addAnalysisRationale, applyModelEnhancement, buildModelRequiredFailurePlan, composeModelGeneratedPlan } from "./planning";
import { publicFallbackReason, publicModelFailureReason, safeModelStatus } from "./publicContracts";
import { buildRunResult } from "./result";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import { analyzeSampleWithVision } from "./sampleAnalysis";
import type { AgentContext, AgentRunResult, AgentTraceItem } from "./types";

export async function runFallbackPipeline(context: AgentContext, trace: AgentTraceItem[], reason: string, runtime: AgentRuntime = defaultAgentRuntime): Promise<AgentRunResult> {
  const sampleResult = await analyzeSampleWithVision(context.sampleVideo, context.source, runtime);
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
  context.knowledge = runtime.knowledge.retrieve({ vertical: "marketing", prompt: context.source.prompt, limit: 3 });
  context.materialSegments = segmentLongVideo(context.materialVideo, context.source.prompt, context.source.targetDurationSec);
  try {
    context.generated = await composeModelGeneratedPlan(context, context.source, context.sample, context.knowledge, context.materialSegments, runtime);
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
    await ensureBenchmarkScore(context, trace, runtime);
    return buildRunResult(context, trace, "fallback");
  }
  const modelResult = await runtime.creativeModel.run({
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
  await renderCurrentCandidate(context, "已自动生成 MP4 成片草稿。", runtime);
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
