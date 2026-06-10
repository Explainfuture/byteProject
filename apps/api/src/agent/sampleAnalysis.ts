import { analyzeSampleVideo, createBriefDrivenTranscript } from "@byteproject/core";
import type { KnowledgeEntry, SampleAnalysis, SegmentKind, SourceInput, StructureSlot, VideoMetadata } from "@byteproject/shared";
import { getFrameCount } from "./publicContracts";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import type { VideoUnderstandingResult } from "./types";

type AnalysisSource = Pick<SourceInput, "prompt" | "productName" | "sellingPoints" | "targetAudience" | "tone" | "targetDurationSec">;
type VisionSlots = NonNullable<VideoUnderstandingResult["analysis"]>["slots"];

export async function analyzeSampleWithVision(
  video: VideoMetadata,
  source: AnalysisSource,
  runtime: AgentRuntime = defaultAgentRuntime
): Promise<{
  analysis: SampleAnalysis;
  model: VideoUnderstandingResult;
}> {
  const model = await runtime.videoUnderstanding.run({
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
  const analysis = analyzeSampleVideo(video, transcript, {
    baseKnowledge: baseMarketingKnowledge(runtime),
    onKnowledgeEntry: (entry) => runtime.knowledge.add(entry)
  });
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

function baseMarketingKnowledge(runtime: AgentRuntime): KnowledgeEntry {
  const entry = runtime.seedKnowledge.find((candidate) => candidate.vertical === "marketing") ?? runtime.seedKnowledge[0];
  if (!entry) throw new Error("Marketing seed knowledge is not configured.");
  return entry;
}

function createModelMissingSampleAnalysis(video: VideoMetadata, source: AnalysisSource, model: VideoUnderstandingResult): SampleAnalysis {
  void source;
  return {
    video,
    transcript: [],
    summary: `正在从 ${video.fileName} 的抽帧里确认结构槽位；视觉证据回来后再生成迁移方案。`,
    slots: [],
    atoms: [],
    rhythmPattern: "未生成：需要模型视觉分析。",
    packagingPattern: [],
    shotCount: getFrameCount(video, model)
  };
}

function mergeVisionSlots(baseSlots: StructureSlot[], visionSlots?: VisionSlots): StructureSlot[] {
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
