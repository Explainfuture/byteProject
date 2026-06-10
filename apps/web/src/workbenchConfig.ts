import type { AppForm, GeneratePayload, StartValidationErrors, StructureSkillPreset, UploadedVideo } from "./workbenchTypes";

export const hookStyleOptions = ["痛点提问", "结果前置", "反差开场", "场景代入"];
export const aspectRatioOptions = ["9:16 竖屏", "1:1 方屏", "16:9 横屏"];
export const subtitleStyleOptions = ["大字重点字幕", "口播逐字字幕", "卖点卡片字幕", "少字幕更干净"];
export const rhythmOptions = ["跟随样例节奏", "更快切", "更稳重", "前 3 秒加速"];
export const ctaStyleOptions = ["强转化收口", "轻提示收口", "福利引导", "评论互动"];
export const visualStyleOptions = ["清爽产品感", "生活方式感", "科技质感", "促销信息流"];
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

export const structureSkillPresets: StructureSkillPreset[] = [
  {
    id: "ecommerce-burst",
    name: "爆品快切",
    kind: "营销类",
    decision: "快节奏，高转化",
    detail: "AI 会重点分析开头 Hook、镜头切换频率、字幕密度、卖点推进和缺口补全方式。",
    track: "ecommerce_burst",
    form: {
      prompt:
        "迁移样例的开头吸引、镜头切换频率、字幕密度和卖点推进方式，生成一条电商爆品短视频。优先拆出商品特写、使用过程、对比证明、结尾 CTA 这些结构槽位；素材不足时，用标题条、卖点卡片、局部放大、重复裁切和字幕补全完成表达，不复制原片内容。",
      productName: "新品智能随行杯",
      sellingPoints: "3 秒看见核心卖点\n保温保冷一整天\n单手开合不漏水\n通勤、健身、露营都能用",
      targetAudience: "短视频电商用户、通勤人群、礼品消费人群",
      tone: "直接、有冲击力、强转化",
      targetDurationSec: 18,
      strategy: "high_click",
      hookStyle: "结果前置",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "大字重点字幕",
      rhythm: "前 3 秒加速",
      ctaStyle: "强转化收口",
      visualStyle: "促销信息流"
    }
  },
  {
    id: "review-contrast",
    name: "测评对比",
    kind: "剪辑类",
    decision: "适合种草和评测",
    detail: "AI 会重点分析反差开场、问题展示、对比证明、卖点总结和结尾推荐。",
    track: "review_contrast",
    form: {
      prompt:
        "把样例拆成测评短视频结构：反差开场、问题展示、对比证明、卖点总结、行动引导。新视频要优先匹配开箱、细节、使用、对比、结尾推荐这些镜头；缺少对比画面时，用分屏卡片、字幕对照、局部放大和时间线重排补全。",
      productName: "桌面降噪麦克风",
      sellingPoints: "嘈杂环境人声更清楚\n即插即用不用调参\n小桌面也放得下\n适合直播、会议、录课",
      targetAudience: "直播新人、远程办公用户、知识博主",
      tone: "可信、克制、像真实测评",
      targetDurationSec: 20,
      strategy: "high_conversion",
      hookStyle: "反差开场",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "卖点卡片字幕",
      rhythm: "更快切",
      ctaStyle: "轻提示收口",
      visualStyle: "生活方式感"
    }
  },
  {
    id: "talking-head-knowledge",
    name: "口播知识",
    kind: "剪辑类",
    decision: "适合讲解和口播",
    detail: "AI 会重点分析 Hook-Body-CTA、逐字字幕、关键词强调和自然语言改片空间。",
    track: "talking_head_knowledge",
    form: {
      prompt:
        "迁移样例的口播逻辑，而不是照搬内容：先提出痛点问题，再用 3 个层次解释方法，中段用字幕强调关键词，结尾给出评论互动或行动建议。素材不足时，用字幕、标题条、强调贴纸和轻量转场补足信息。",
      productName: "AI 短视频结构迁移工具",
      sellingPoints: "自动拆解爆款结构\n识别素材缺口\n生成脚本、分镜和时间线\n支持一句话改片",
      targetAudience: "参赛评委、短视频创作者、运营团队",
      tone: "清楚、专业、像产品讲解",
      targetDurationSec: 18,
      strategy: "balanced",
      hookStyle: "痛点提问",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "口播逐字字幕",
      rhythm: "跟随样例节奏",
      ctaStyle: "评论互动",
      visualStyle: "清爽产品感"
    }
  },
  {
    id: "motion-graph-explainer",
    name: "MG 信息流",
    kind: "Motion Graph",
    decision: "低素材也能成片",
    detail: "AI 会重点分析图文包装、卡点转场、标题条、卖点卡片和可解释的工具调用过程。",
    track: "motion_graph_explainer",
    form: {
      prompt:
        "把样例抽象成 MG 信息流结构：概念开场、流程拆解、能力分层、结果对比、结尾 CTA。新视频允许用标题条、卖点卡片、图标贴纸、背景图和转场补全画面，重点展示结构迁移过程和工具调用可解释性。",
      productName: "Doubao-Seed 视频智能体",
      sellingPoints: "样例理解\n结构抽取\n素材适配\n缺口补全\n时间线草案",
      targetAudience: "AI 全栈挑战赛评委、产品经理、视频创作者",
      tone: "科技感、清晰、演示友好",
      targetDurationSec: 16,
      strategy: "high_rhythm",
      hookStyle: "结果前置",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "大字重点字幕",
      rhythm: "前 3 秒加速",
      ctaStyle: "轻提示收口",
      visualStyle: "科技质感"
    }
  }
];

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
