import { describe, expect, it } from "vitest";
import { buildGeneratePayload, buildGenerationPrompt, defaultForm, splitSellingPoints, validateStartInputs } from "./workbenchConfig";
import type { AppForm, UploadedVideo } from "./workbenchTypes";

describe("workbench config", () => {
  const form: AppForm = {
    ...defaultForm,
    prompt: "迁移这条发布会视频的结构",
    productName: "横屏演示装置",
    sellingPoints: " 空间感强 \n\n产品亮相明确\n适合发布会开场 ",
    targetAudience: "科技新品观众",
    aspectRatio: "16:9 横屏",
    strategy: "high_rhythm"
  };

  const sampleVideo: UploadedVideo = {
    id: "sample-upload-1",
    name: "launch-demo.webm",
    previewUrl: "blob:sample"
  };

  it("validates the actual start requirements", () => {
    expect(validateStartInputs(defaultForm, null)).toEqual({
      sampleVideo: "先上传一条样例视频。",
      prompt: "写一句迁移目标，智能体才能生成新视频方向。"
    });

    expect(validateStartInputs(form, sampleVideo)).toEqual({});
  });

  it("builds a generation prompt from user intent and controller-owned settings", () => {
    const prompt = buildGenerationPrompt(form, "把卖点提前");

    expect(prompt).toContain("迁移这条发布会视频的结构");
    expect(prompt).toContain("画幅：16:9 横屏");
    expect(prompt).toContain("SKU 与工具：由主智能体在读取上传视频与 prompt 后自动选择");
    expect(prompt).toContain("改片指令：把卖点提前");
  });

  it("turns form state into the API payload without leaking UI-only fields", () => {
    const payload = buildGeneratePayload(form, sampleVideo, "减少字幕");

    expect(payload.sampleVideoIds).toEqual(["sample-upload-1"]);
    expect(payload.materialVideoId).toBe("sample-upload-1");
    expect(payload.productName).toBe("横屏演示装置");
    expect(payload.sellingPoints).toEqual(["空间感强", "产品亮相明确", "适合发布会开场"]);
    expect(payload.prompt).toContain("改片指令：减少字幕");
    expect(payload).not.toHaveProperty("hookStyle");
    expect(payload).not.toHaveProperty("subtitleStyle");
  });

  it("uses the mock ids only when no upload exists", () => {
    expect(buildGeneratePayload(form, null).sampleVideoIds).toEqual(["sample-mock"]);
    expect(buildGeneratePayload(form, null).materialVideoId).toBe("sample-mock");
  });

  it("normalizes multiline selling points", () => {
    expect(splitSellingPoints(" A \n\nB\n C ")).toEqual(["A", "B", "C"]);
  });
});
