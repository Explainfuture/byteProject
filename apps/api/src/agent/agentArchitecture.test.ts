import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "./runtime";
import { normalizeSourceInput, runStructureTransferAgent } from "../structureAgent";
import type { KnowledgeEntry, MaterialSegment, RemotionCompositionDsl, SourceInput, StructureSlot, VideoMetadata } from "@byteproject/shared";

const testSlots: StructureSlot[] = [
  {
    id: "slot-hook",
    segment: "hook",
    intent: "Open with a problem",
    requiredAssetTypes: ["scene", "text_card"],
    durationSec: 2,
    importance: "high",
    rhythmHint: "fast",
    packagingHints: ["headline"]
  },
  {
    id: "slot-proof",
    segment: "proof",
    intent: "Prove the product value",
    requiredAssetTypes: ["usage", "comparison"],
    durationSec: 5,
    importance: "high",
    rhythmHint: "fast",
    packagingHints: ["benefit cards"]
  },
  {
    id: "slot-cta",
    segment: "cta",
    intent: "Close with action",
    requiredAssetTypes: ["text_card"],
    durationSec: 2,
    importance: "high",
    rhythmHint: "fast",
    packagingHints: ["cta"]
  }
];

const seedKnowledge: KnowledgeEntry = {
  id: "seed-test-marketing",
  title: "Test marketing seed",
  source: "seed",
  vertical: "marketing",
  rhythmPattern: "hook -> proof -> cta",
  packagingPattern: ["headline", "benefit cards", "cta"],
  applicableWhen: ["test"],
  atoms: [
    {
      id: "atom-hook",
      kind: "hook",
      name: "Problem hook",
      intent: "Open with a concise problem",
      applicableWhen: ["opening"],
      constraints: ["no source copy"],
      outputHint: "Use a short question"
    },
    {
      id: "atom-proof",
      kind: "slot",
      name: "Proof stack",
      intent: "Show result evidence",
      applicableWhen: ["proof"],
      constraints: ["no unsupported claims"],
      outputHint: "Show problem/action/result"
    },
    {
      id: "atom-cta",
      kind: "cta",
      name: "Button CTA",
      intent: "Close with action",
      applicableWhen: ["ending"],
      constraints: ["short"],
      outputHint: "Use button-like copy"
    }
  ],
  structureSlots: testSlots
};

describe("agent architecture seams", () => {
  it("iterates persisted Seedance Remotion candidates until visual benchmark passes", async () => {
    const addedKnowledge: KnowledgeEntry[] = [];
    const renderedPlanIds: string[] = [];
    const runtime = createVisualIterationRuntime(addedKnowledge, renderedPlanIds);
    const source = normalizeSourceInput({
      prompt: "Turn this launch walkthrough into a high-energy product video",
      productName: "Spatial Launch Deck",
      sellingPoints: ["immersive walkthrough", "clear product reveal"],
      targetAudience: "launch viewers",
      targetDurationSec: 14
    });

    const result = await runStructureTransferAgent(
      {
        source,
        sampleVideo: createVideo("seedance-sample", "sample"),
        materialVideo: createVideo("seedance-material", "material"),
        outputDir: "data/outputs"
      },
      runtime
    );

    expect(result.iterations).toHaveLength(2);
    expect(result.benchmarkScore.threshold.targetScore).toBe(90);
    expect(result.benchmarkScore.totalScore).toBe(94);
    expect(result.benchmarkScore.accepted).toBe(true);
    expect(result.benchmarkScore.hardFailures).toEqual([]);
    expect(result.generated.id).toBe(result.iterations[1].candidateId);
    expect(result.iterations[1].isBest).toBe(true);
    expect(result.iterations[0].visualBenchmark?.score.totalScore).toBe(72);
    expect(result.iterations[0].visualBenchmark?.score.accepted).toBe(false);
    expect(result.iterations[0].visualBenchmark?.nextRewriteBrief).toContain("opening hook");
    expect(result.iterations[1].visualBenchmark?.frameEvidence.length).toBeGreaterThan(0);
    expect(result.iterations[0].remotionArtifact?.provider).toBe("seedance");
    expect(result.iterations[0].remotionArtifact?.remotionCode).toContain("Candidate_0");
    expect(result.iterations[1].remotionArtifact?.remotionCode).toContain("Candidate_1");
    expect(result.iterations[0].remotionArtifact?.codeHash).not.toBe(result.iterations[1].remotionArtifact?.codeHash);
    expect(result.iterations[0].remotionArtifact?.outputUrl).toBe("/outputs/seedance-0.mp4");
    expect(result.iterations[1].remotionArtifact?.frameUrls).toEqual(expect.arrayContaining(["/outputs/seedance-1-frame-001.jpg"]));
    expect(renderedPlanIds).toEqual(expect.arrayContaining([result.iterations[0].candidateId, result.iterations[1].candidateId]));
  });

  it("hard-fails consecutive Seedance candidates that only change copy", async () => {
    const addedKnowledge: KnowledgeEntry[] = [];
    const renderedPlanIds: string[] = [];
    const runtime = createVisualIterationRuntime(addedKnowledge, renderedPlanIds, { repeatStructuralSignature: true });
    const source = normalizeSourceInput({
      prompt: "Turn this launch walkthrough into a high-energy product video",
      productName: "Spatial Launch Deck",
      sellingPoints: ["immersive walkthrough", "clear product reveal"],
      targetAudience: "launch viewers",
      targetDurationSec: 14
    });

    const result = await runStructureTransferAgent(
      {
        source,
        sampleVideo: createVideo("stagnant-sample", "sample"),
        materialVideo: createVideo("stagnant-material", "material"),
        outputDir: "data/outputs"
      },
      runtime
    );

    expect(result.iterations).toHaveLength(3);
    expect(result.benchmarkScore.totalScore).toBe(94);
    expect(result.benchmarkScore.accepted).toBe(false);
    expect(result.benchmarkScore.hardFailures.map((failure) => failure.code)).toEqual(
      expect.arrayContaining(["no_remotion_code_delta", "stagnant_iteration"])
    );
    expect(result.iterations[1].visualBenchmark?.score.accepted).toBe(false);
    expect(result.iterations[1].visualBenchmark?.score.hardFailures.map((failure) => failure.code)).toContain("no_remotion_code_delta");
    expect(renderedPlanIds).toEqual(expect.arrayContaining([
      result.iterations[0].candidateId,
      result.iterations[1].candidateId,
      result.iterations[2].candidateId
    ]));
  });

  it("runs fallback orchestration with an injected runtime instead of concrete adapters", async () => {
    const addedKnowledge: KnowledgeEntry[] = [];
    const renderedPlanIds: string[] = [];
    const runtime = createFakeRuntime(addedKnowledge, renderedPlanIds);
    const source = normalizeSourceInput({
      prompt: "Create a high-conversion bottle video",
      productName: "Focus Bottle",
      sellingPoints: ["keeps drinks cold", "fits in a small bag"],
      targetAudience: "commuters",
      targetDurationSec: 12
    });

    const result = await runStructureTransferAgent(
      {
        source,
        sampleVideo: createVideo("sample-test", "sample"),
        materialVideo: createVideo("material-test", "material"),
        outputDir: "data/outputs"
      },
      runtime
    );

    expect(result.agentMode).toBe("fallback");
    expect(result.generated.demo.status).toBe("rendered");
    expect(result.generated.demo.url).toBe("/outputs/fake.mp4");
    expect(result.samples[0].video.localPath).toBeUndefined();
    expect(result.agentTrace.map((item) => item.tool)).toEqual(expect.arrayContaining(["vision_model", "model_plan_composer", "fallback_pipeline"]));
    expect(addedKnowledge.map((entry) => entry.id)).toContain("knowledge-sample-test");
    expect(renderedPlanIds.length).toBeGreaterThanOrEqual(1);
  });
});

function createFakeRuntime(addedKnowledge: KnowledgeEntry[], renderedPlanIds: string[]): AgentRuntime {
  return {
    videoUnderstanding: {
      async run(input) {
        return {
          provider: "mock",
          frameCount: 4,
          analysis: {
            summary: `Fake analysis for ${input.video.id}`,
            transcript: [
              { startSec: 0, endSec: 2, text: "Problem hook" },
              { startSec: 2, endSec: 7, text: "Proof of benefit" },
              { startSec: 7, endSec: 10, text: "Action close" }
            ],
            slots: testSlots.map((slot) => ({
              segment: slot.segment,
              intent: slot.intent,
              requiredAssetTypes: slot.requiredAssetTypes,
              durationSec: slot.durationSec,
              rhythmHint: slot.rhythmHint,
              packagingHints: slot.packagingHints
            })),
            rhythmPattern: seedKnowledge.rhythmPattern,
            packagingPattern: seedKnowledge.packagingPattern,
            shotCount: 4
          }
        };
      }
    },
    creativeModel: {
      async run() {
        return { provider: "mock", error: "creative model disabled in test" };
      }
    },
    planComposer: {
      async run(input) {
        return {
          provider: "mock",
          plan: buildFakePlan(input.source, input.sample.slots, input.materialSegments)
        };
      }
    },
    renderer: {
      async run(input) {
        renderedPlanIds.push(input.plan.id);
        return { url: "/outputs/fake.mp4", path: "data/outputs/fake.mp4" };
      }
    },
    remotionCoder: {
      async run() {
        return {
          provider: "mock",
          error: "seedance remotion coder disabled in legacy architecture test"
        };
      }
    },
    visualJudge: {
      async run() {
        return {
          provider: "mock",
          error: "visual benchmark judge disabled in legacy architecture test"
        };
      }
    },
    knowledge: {
      add(entry) {
        addedKnowledge.push(entry);
        return entry;
      },
      retrieve() {
        return [seedKnowledge, ...addedKnowledge].slice(0, 3);
      },
      list() {
        return [seedKnowledge, ...addedKnowledge];
      }
    },
    seedKnowledge: [seedKnowledge],
    canUseToolCallingModel() {
      return false;
    },
    async callToolModel() {
      throw new Error("The fallback architecture test must not call the online tool model.");
    }
  };
}

function createVisualIterationRuntime(
  addedKnowledge: KnowledgeEntry[],
  renderedPlanIds: string[],
  options: { repeatStructuralSignature?: boolean } = {}
): AgentRuntime {
  let coderCallCount = 0;
  let judgeCallCount = 0;
  return {
    ...createFakeRuntime(addedKnowledge, renderedPlanIds),
    remotionCoder: {
      async run(input) {
        const index = coderCallCount;
        coderCallCount += 1;
        const dsl: RemotionCompositionDsl = {
          version: 1 as const,
          candidateName: `Candidate_${index}`,
          scenes: [
            {
              id: `scene-${index}-hook`,
              startSec: 0,
              endSec: 3,
              layout: options.repeatStructuralSignature ? "centered_caption" : index === 0 ? "centered_caption" : "split_reveal",
              caption: index === 0 ? "Soft opening" : "Sharper opening hook",
              assetIds: input.materialSegments.slice(0, 1).map((segment) => segment.id),
              motion: options.repeatStructuralSignature ? "slow_push" : index === 0 ? "slow_push" : "snap_zoom"
            }
          ]
        };
        return {
          provider: "seedance" as const,
          model: "Seedance 2.0 Lite",
          dsl,
          remotionCode: `export function Candidate_${index}() { return <Scene name="${dsl.scenes[0].layout}" />; }`,
          notes: [`iteration ${index} generated from ${input.rewriteBrief ?? "initial brief"}`]
        };
      }
    },
    renderer: {
      async run(input) {
        renderedPlanIds.push(input.plan.id);
        const index = Number(input.plan.id.match(/candidate-(\d+)/)?.[1] ?? renderedPlanIds.length - 1);
        return { url: `/outputs/seedance-${index}.mp4`, path: `data/outputs/seedance-${index}.mp4` };
      }
    },
    visualJudge: {
      async run(input) {
        const index = judgeCallCount;
        judgeCallCount += 1;
        const totalScore = index === 0 ? 72 : 94;
        return {
          provider: "ark" as const,
          model: "Visual Benchmark Judge",
          frameEvidence: [
            {
              frameUrl: `/outputs/seedance-${index}-frame-001.jpg`,
              timestampSec: 1.2,
              observation: index === 0 ? "Opening hook is too soft." : "Opening hook is clear and visually distinct."
            }
          ],
          reasons: index === 0 ? ["opening hook is too soft", "visual layout changed too little"] : ["passes visual benchmark"],
          nextRewriteBrief: index === 0 ? "Strengthen opening hook, change scene layout, and make product reveal clearer." : undefined,
          score: {
            candidateId: input.candidateId,
            iterationIndex: index,
            totalScore,
            grade: "pass" as const,
            accepted: true,
            threshold: {
              regenerateBelow: 60 as const,
              targetScore: 90 as const,
              excellentFrom: 95 as const,
              maxIterations: 5 as const
            },
            dimensionScores: [],
            hardFailures: [],
            topFixes: index === 0 ? ["Strengthen opening hook"] : []
          }
        };
      }
    }
  };
}

function buildFakePlan(source: SourceInput, slots: StructureSlot[], segments: MaterialSegment[]) {
  const fallbackSegmentId = segments[0]?.id;
  const timeline = slots.map((slot, index) => ({
    id: `timeline-${index + 1}`,
    slotId: slot.id,
    startSec: index * 3,
    endSec: index * 3 + Math.max(2, slot.durationSec),
    assetIds: fallbackSegmentId ? [fallbackSegmentId] : [],
    caption: index === 0 ? `${source.productName} solves the cold drink problem` : `${source.sellingPoints[index - 1] ?? "Clear benefit"}`,
    packaging: ["headline", "benefit card"],
    transition: "cut",
    beatHint: "fast"
  }));
  return {
    script: timeline.map((item) => item.caption).join("\n"),
    slotMatches: slots.map((slot) => ({
      slotId: slot.id,
      status: fallbackSegmentId ? "matched" as const : "missing" as const,
      assetIds: fallbackSegmentId ? [fallbackSegmentId] : [],
      confidence: 0.82,
      reason: "Fake runtime matched the slot for architecture testing."
    })),
    timeline,
    storyboard: timeline.map((item, index) => ({
      id: `storyboard-${index + 1}`,
      slotId: item.slotId,
      title: `Shot ${index + 1}`,
      visual: "Use uploaded material with packaging overlays.",
      caption: item.caption,
      reason: "Preserve structure while changing the brief."
    })),
    packagingSuggestions: ["Large opening headline", "Benefit card stack", "Button CTA"],
    rationale: ["Fake runtime generated a test plan through the adapter seam."],
    rendererPrompt: "Render the fake architecture test plan."
  };
}

function createVideo(id: string, role: "sample" | "material"): VideoMetadata {
  return {
    id,
    role,
    fileName: `${id}.mp4`,
    durationSec: role === "sample" ? 12 : 30,
    width: 1080,
    height: 1920,
    fps: 30,
    sizeBytes: 1,
    localPath: `data/uploads/${id}.mp4`
  };
}
