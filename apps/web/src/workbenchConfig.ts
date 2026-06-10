import type { AppForm, GeneratePayload, StartValidationErrors, UploadedVideo } from "./workbenchTypes";

export const aspectRatioOptions = ["9:16 竖屏", "1:1 方屏", "16:9 横屏"];
export const defaultResultTab = "demo" as const;

export const defaultForm: AppForm = {
  prompt: "",
  productName: "",
  sellingPoints: "",
  targetAudience: "",
  tone: "专业、清晰、有节奏",
  targetDurationSec: 18,
  strategy: "balanced",
  hookStyle: "痛点提问",
  aspectRatio: "9:16 竖屏",
  subtitleStyle: "大字重点字幕",
  rhythm: "跟随样例节奏",
  ctaStyle: "强转化收口",
  visualStyle: "清爽产品感"
};

export function validateStartInputs(form: AppForm, sampleVideo: UploadedVideo | null): StartValidationErrors {
  const errors: StartValidationErrors = {};
  if (!sampleVideo?.id) errors.sampleVideo = "先上传一条样例视频。";
  if (!form.prompt.trim()) errors.prompt = "写一句迁移目标，智能体才能生成新视频方向。";
  return errors;
}

export function buildGenerationPrompt(form: AppForm, extraInstruction?: string) {
  const settingPrompt = [
    `画幅：${form.aspectRatio}`,
    "SKU 与工具：由主智能体在读取上传视频与 prompt 后自动选择",
    "成片预览：渲染模型从上传视频分析出的 Remotion 方案，保持本次结构一致"
  ].join("\n");
  const basePrompt = `${form.prompt}\n\n视频期望参数：\n${settingPrompt}`;
  return extraInstruction ? `${basePrompt}\n\n改片指令：${extraInstruction}` : basePrompt;
}

export function buildGeneratePayload(form: AppForm, sampleVideo: UploadedVideo | null, extraInstruction?: string): GeneratePayload {
  return {
    sampleVideoIds: [sampleVideo?.id ?? "sample-mock"],
    materialVideoId: sampleVideo?.id ?? "sample-mock",
    prompt: buildGenerationPrompt(form, extraInstruction),
    productName: form.productName,
    sellingPoints: splitSellingPoints(form.sellingPoints),
    targetAudience: form.targetAudience,
    tone: form.tone,
    targetDurationSec: form.targetDurationSec,
    strategy: form.strategy
  };
}

export function splitSellingPoints(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
