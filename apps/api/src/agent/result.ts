import type { BenchmarkScore, GeneratedPlan, KnowledgeEntry, MaterialSegment, SampleAnalysis } from "@byteproject/shared";
import { hasUploadedVideo, publicSampleAnalysis, publicVideo } from "./publicContracts";
import type { AgentContext, AgentRunResult, AgentTraceItem } from "./types";

export function buildRunResult(context: AgentContext, trace: AgentTraceItem[], mode: AgentRunResult["agentMode"]): AgentRunResult {
  if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated || !context.benchmarkScore) {
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
    benchmarkScore: context.benchmarkScore,
    iterations: context.iterations ?? [],
    agentTrace: trace,
    agentMode: mode
  };
}

export function summarizeObservation(value: unknown): unknown {
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
  if ("benchmarkScore" in value) {
    const benchmarkScore = (value as { benchmarkScore?: BenchmarkScore }).benchmarkScore;
    return benchmarkScore
      ? {
          benchmarkScore: {
            totalScore: benchmarkScore.totalScore,
            grade: benchmarkScore.grade,
            accepted: benchmarkScore.accepted,
            hardFailures: benchmarkScore.hardFailures.map((failure) => failure.code),
            topFixes: benchmarkScore.topFixes
          }
        }
      : value;
  }
  return value;
}
