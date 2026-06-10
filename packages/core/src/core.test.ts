import { describe, expect, it } from "vitest";
import type { KnowledgeEntry, SourceInput, VideoMetadata } from "@byteproject/shared";
import { inferCreativeSkillIds } from "@byteproject/shared";
import { analyzeSampleVideo, createBriefDrivenTranscript, matchSlots, runMockPipeline, segmentLongVideo } from "./index";

describe("mock P0 pipeline", () => {
  const baseKnowledge: KnowledgeEntry = {
    id: "test-marketing-knowledge",
    title: "Test marketing structure",
    source: "seed",
    vertical: "marketing",
    rhythmPattern: "hook -> product -> proof -> offer -> cta",
    packagingPattern: ["headline", "benefit card", "cta"],
    applicableWhen: ["product marketing"],
    atoms: [
      {
        id: "atom-test-hook",
        kind: "hook",
        name: "Problem hook",
        intent: "Catch attention",
        applicableWhen: ["opening"],
        constraints: ["do not copy source copy"],
        outputHint: "Use a short question"
      },
      {
        id: "atom-test-proof",
        kind: "slot",
        name: "Proof stack",
        intent: "Show evidence",
        applicableWhen: ["selling point"],
        constraints: ["avoid unsupported claims"],
        outputHint: "Show problem/action/result"
      },
      {
        id: "atom-test-cta",
        kind: "cta",
        name: "Specific CTA",
        intent: "Close with action",
        applicableWhen: ["ending"],
        constraints: ["short line"],
        outputHint: "Use button-like CTA"
      }
    ],
    structureSlots: [
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
        id: "slot-product",
        segment: "body",
        intent: "Show product",
        requiredAssetTypes: ["product_closeup", "cover"],
        durationSec: 3,
        importance: "high",
        rhythmHint: "medium",
        packagingHints: ["product label"]
      },
      {
        id: "slot-proof",
        segment: "proof",
        intent: "Prove benefit",
        requiredAssetTypes: ["usage", "comparison", "scene"],
        durationSec: 8,
        importance: "high",
        rhythmHint: "fast",
        packagingHints: ["benefit cards"]
      },
      {
        id: "slot-offer",
        segment: "offer",
        intent: "Explain fit",
        requiredAssetTypes: ["text_card", "scene"],
        durationSec: 3,
        importance: "medium",
        rhythmHint: "medium",
        packagingHints: ["scenario tag"]
      },
      {
        id: "slot-cta",
        segment: "cta",
        intent: "Close with action",
        requiredAssetTypes: ["product_closeup", "text_card"],
        durationSec: 2,
        importance: "high",
        rhythmHint: "fast",
        packagingHints: ["cta button"]
      }
    ]
  };

  it("generates structure, gaps, composition plan, and timeline", () => {
    const result = runMockPipeline({ prompt: "生成一个高转化随行杯短视频" }, { knowledge: [baseKnowledge] });

    expect(result.samples[0].slots.length).toBeGreaterThanOrEqual(5);
    expect(result.samples[0].atoms.length).toBeGreaterThanOrEqual(3);
    expect(result.knowledge.length).toBeGreaterThanOrEqual(1);
    expect(result.material.segments.length).toBeGreaterThanOrEqual(5);
    expect(result.generated.compositionPlan.selectedAtomIds.length).toBeGreaterThan(0);
    expect(result.generated.timeline.length).toBe(result.samples[0].slots.length);
    expect(result.generated.previewVariants.length).toBeGreaterThanOrEqual(1);
    expect(result.generated.previewVariants.every((variant) => variant.targetDurationSec <= 60)).toBe(true);
    expect(result.generated.demo.status).toBe("mock_ready");
    expect(result.benchmarkScore.totalScore).toBeGreaterThanOrEqual(80);
    expect(result.benchmarkScore.dimensionScores).toHaveLength(7);
    expect(result.iterations[0].demo).toEqual(result.generated.demo);
    expect(result.iterations[0].script).toBe(result.generated.script);
  });

  it("builds uploaded-video fallback analysis from the user brief instead of default mock copy", () => {
    const source: Partial<SourceInput> = {
      prompt: "把横屏科技展示视频迁移成新品发布短视频方案",
      productName: "横屏演示装置",
      sellingPoints: ["空间感强", "产品亮相明确", "适合发布会开场"],
      targetAudience: "科技新品观众",
      tone: "专业、清晰、有节奏",
      targetDurationSec: 18
    };
    const video: VideoMetadata = {
      id: "sample-landscape",
      role: "sample",
      fileName: "landscape-fixture.webm",
      durationSec: 18,
      width: 1280,
      height: 720,
      fps: 24,
      sizeBytes: 1024
    };

    const transcript = createBriefDrivenTranscript(source, video);
    const analysis = analyzeSampleVideo(video, transcript, { persist: false, baseKnowledge });
    const output = JSON.stringify({ transcript, analysis });

    expect(output).toContain("横屏演示装置");
    expect(output).toContain("空间感强");
    expect(output).not.toContain("智能随行杯");
    expect(output).not.toContain("出门总是忘记喝水吗");
  });

  it("adapts material segmentation and gap confidence to the actual uploaded video duration", () => {
    const prompt = "生成一个参赛演示短视频";
    const targetDurationSec = 18;
    const baseVideo: VideoMetadata = {
      id: "sample-dynamic-duration",
      role: "sample",
      fileName: "dynamic.mp4",
      durationSec: 18,
      width: 1280,
      height: 720,
      fps: 24,
      sizeBytes: 1024
    };

    const shortSegments = segmentLongVideo({ ...baseVideo, durationSec: 4.1 }, prompt, targetDurationSec);
    const mediumSegments = segmentLongVideo({ ...baseVideo, durationSec: 12 }, prompt, targetDurationSec);
    const longSegments = segmentLongVideo({ ...baseVideo, durationSec: 60 }, prompt, targetDurationSec);

    expect(shortSegments.at(-1)?.endSec).toBeLessThanOrEqual(4.1);
    expect(mediumSegments.at(-1)?.endSec).toBeLessThanOrEqual(12);
    expect(longSegments.at(-1)?.endSec).toBeLessThanOrEqual(60);
    expect(shortSegments.length).toBeLessThan(longSegments.length);

    const sample = analyzeSampleVideo(baseVideo, createBriefDrivenTranscript({ productName: "参赛 Agent", targetDurationSec }, baseVideo), { persist: false, baseKnowledge });
    const shortMatches = matchSlots(sample.slots, shortSegments);
    const longMatches = matchSlots(sample.slots, longSegments);

    expect(shortMatches.some((match) => match.status !== "matched")).toBe(true);
    expect(longMatches.some((match) => match.status === "matched")).toBe(true);
  });

  it("keeps sample slot ids stable across repeated analyses and emits knowledge explicitly", () => {
    const baseVideo: VideoMetadata = {
      id: "template-regression-a",
      role: "sample",
      fileName: "template-a.mp4",
      durationSec: 18,
      width: 1080,
      height: 1920,
      fps: 30,
      sizeBytes: 0
    };
    const emittedKnowledgeIds: string[] = [];
    const first = analyzeSampleVideo(baseVideo, createBriefDrivenTranscript({ productName: "A" }, baseVideo), {
      baseKnowledge,
      onKnowledgeEntry: (entry) => emittedKnowledgeIds.push(entry.id)
    });
    const second = analyzeSampleVideo(
      { ...baseVideo, id: "template-regression-b", fileName: "template-b.mp4" },
      createBriefDrivenTranscript({ productName: "B" }, baseVideo),
      {
        baseKnowledge,
        onKnowledgeEntry: (entry) => emittedKnowledgeIds.push(entry.id)
      }
    );

    expect(first.slots[0].id).toBe("template-regression-a-slot-hook");
    expect(second.slots[0].id).toBe("template-regression-b-slot-hook");
    expect(second.slots.some((slot) => slot.id.includes("template-regression-a"))).toBe(false);
    expect(emittedKnowledgeIds).toEqual(["knowledge-template-regression-a", "knowledge-template-regression-b"]);
  });

  it("infers creative SKU choices from the user brief instead of requiring manual selection", () => {
    const ids = inferCreativeSkillIds({
      prompt: "把样例迁移成高转化电商测评短视频，开头要更快更抓人",
      productName: "智能随行杯",
      sellingPoints: ["保温一整天", "单手开合", "通勤健身都能用"],
      targetAudience: "通勤和运动人群",
      strategy: "high_conversion"
    });

    expect(ids).toContain("structural_visual_copy_trading");
    expect(ids).toContain("zero_inventory_affiliate_engine");
    expect(ids).toContain("ctr_threshold_creative_mining");
    expect(ids).toContain("non_destructive_frame_reconstruction");
  });
});
