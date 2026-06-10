import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "./runtime";
import { normalizeSourceInput, runStructureTransferAgent } from "../structureAgent";
import type { KnowledgeEntry, MaterialSegment, SourceInput, StructureSlot, VideoMetadata } from "@byteproject/shared";

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
