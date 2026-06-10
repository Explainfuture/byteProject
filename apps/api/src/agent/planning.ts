import type { GeneratedPlan, KnowledgeEntry, MaterialSegment, PreviewVariant, SampleAnalysis, SourceInput, TimelineItem } from "@byteproject/shared";
import { FRAME_BUDGET, previewTracks } from "./constants";
import { getFrameCount } from "./publicContracts";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import type { AgentContext } from "./types";

type ModelPlan = NonNullable<Awaited<ReturnType<AgentRuntime["planComposer"]["run"]>>["plan"]>;
type ModelEnhancement = Awaited<ReturnType<AgentRuntime["creativeModel"]["run"]>>["enhancement"];

export function applyModelEnhancement(generated: GeneratedPlan, enhancement: ModelEnhancement) {
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

export async function composeModelGeneratedPlan(
  context: AgentContext,
  source: SourceInput,
  sample: SampleAnalysis,
  knowledge: KnowledgeEntry[],
  materialSegments: MaterialSegment[],
  runtime: AgentRuntime = defaultAgentRuntime
): Promise<GeneratedPlan> {
  if (!context.sampleVision?.analysis?.slots?.length || !sample.slots.length) {
    throw new Error("Model video understanding with structure slots is required before composing a production plan.");
  }

  const result = await runtime.planComposer.run({
    source,
    sample,
    knowledge,
    materialSegments
  });

  if (!result.plan) {
    throw new Error(result.error || "Model did not return a production plan.");
  }

  return buildGeneratedPlanFromModel(source, sample, materialSegments, result.plan);
}

function buildGeneratedPlanFromModel(
  source: SourceInput,
  sample: SampleAnalysis,
  materialSegments: MaterialSegment[],
  plan: ModelPlan
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
      rationale: ["Model generated the structure transfer recipe and timeline.", ...(plan.rationale ?? [])].slice(0, 5)
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

export function buildModelRequiredFailurePlan(source: SourceInput, reason: string): GeneratedPlan {
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

export function addAnalysisRationale(context: AgentContext) {
  if (!context.generated) return;
  const frameCount = getFrameCount(context.sampleVideo, context.sampleVision);
  if (!context.sampleVision?.analysis) {
    context.generated.compositionPlan.rationale = [
      `本轮已抽取 ${frameCount} 张关键帧，但模型还没给出结构 slots；我会先补齐视觉结构判断，再生成迁移方案。`,
      ...context.generated.compositionPlan.rationale
    ].slice(0, 5);
    return;
  }
  context.generated.compositionPlan.rationale = [
    `已对样例视频抽取 ${context.sampleVision.frameCount ?? 0} 张关键帧，并完成真实视觉结构拆解。`,
    ...context.generated.compositionPlan.rationale
  ].slice(0, 5);
}
