import { describe, expect, it } from "vitest";
import type { SourceInput, VideoMetadata } from "@byteproject/shared";
import { inferCreativeSkillIds } from "@byteproject/shared";
import { analyzeSampleVideo, createBriefDrivenTranscript, matchSlots, runMockPipeline, segmentLongVideo } from "./index";

describe("mock P0 pipeline", () => {
  it("generates structure, gaps, composition plan, and timeline", () => {
    const result = runMockPipeline({ prompt: "生成一个高转化随行杯短视频" });

    expect(result.samples[0].slots.length).toBeGreaterThanOrEqual(5);
    expect(result.samples[0].atoms.length).toBeGreaterThanOrEqual(3);
    expect(result.knowledge.length).toBeGreaterThanOrEqual(1);
    expect(result.material.segments.length).toBeGreaterThanOrEqual(5);
    expect(result.generated.compositionPlan.selectedAtomIds.length).toBeGreaterThan(0);
    expect(result.generated.timeline.length).toBe(result.samples[0].slots.length);
    expect(result.generated.previewVariants).toHaveLength(10);
    expect(result.generated.previewVariants.every((variant) => variant.targetDurationSec <= 60)).toBe(true);
    expect(result.generated.demo.status).toBe("mock_ready");
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
    const analysis = analyzeSampleVideo(video, transcript, { persist: false });
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

    const sample = analyzeSampleVideo(baseVideo, createBriefDrivenTranscript({ productName: "参赛 Agent", targetDurationSec }, baseVideo), { persist: false });
    const shortMatches = matchSlots(sample.slots, shortSegments);
    const longMatches = matchSlots(sample.slots, longSegments);

    expect(shortMatches.some((match) => match.status !== "matched")).toBe(true);
    expect(longMatches.some((match) => match.status === "matched")).toBe(true);
  });

  it("keeps sample slot ids stable across repeated persisted analyses", () => {
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
    const first = analyzeSampleVideo(baseVideo, createBriefDrivenTranscript({ productName: "A" }, baseVideo));
    const second = analyzeSampleVideo(
      { ...baseVideo, id: "template-regression-b", fileName: "template-b.mp4" },
      createBriefDrivenTranscript({ productName: "B" }, baseVideo)
    );

    expect(first.slots[0].id).toBe("template-regression-a-slot-hook");
    expect(second.slots[0].id).toBe("template-regression-b-slot-hook");
    expect(second.slots.some((slot) => slot.id.includes("template-regression-a"))).toBe(false);
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
