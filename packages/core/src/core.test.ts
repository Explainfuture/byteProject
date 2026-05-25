import { describe, expect, it } from "vitest";
import { runMockPipeline } from "./index";

describe("mock P0 pipeline", () => {
  it("generates structure, gaps, composition plan, and timeline", () => {
    const result = runMockPipeline({ prompt: "生成一个高转化随行杯短视频" });

    expect(result.samples[0].slots.length).toBeGreaterThanOrEqual(5);
    expect(result.samples[0].atoms.length).toBeGreaterThanOrEqual(3);
    expect(result.knowledge.length).toBeGreaterThanOrEqual(1);
    expect(result.material.segments.length).toBeGreaterThanOrEqual(5);
    expect(result.generated.compositionPlan.selectedAtomIds.length).toBeGreaterThan(0);
    expect(result.generated.timeline.length).toBe(result.samples[0].slots.length);
    expect(result.generated.demo.status).toBe("mock_ready");
  });
});

