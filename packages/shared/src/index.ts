export type CreativeStrategy = "balanced" | "high_click" | "high_conversion" | "high_rhythm" | "premium";

export type FrameBudget = {
  minFrames: number;
  maxFrames: number;
  secondsPerFrame: number;
};

export const DEFAULT_FRAME_BUDGET: FrameBudget = {
  minFrames: 4,
  maxFrames: 16,
  secondsPerFrame: 4
};

export function normalizeFrameBudget(input: Partial<FrameBudget> = {}): FrameBudget {
  const minFrames = normalizePositiveInteger(input.minFrames, DEFAULT_FRAME_BUDGET.minFrames);
  const maxFrames = Math.max(minFrames, normalizePositiveInteger(input.maxFrames, DEFAULT_FRAME_BUDGET.maxFrames));
  const secondsPerFrame = normalizePositiveNumber(input.secondsPerFrame, DEFAULT_FRAME_BUDGET.secondsPerFrame);
  return { minFrames, maxFrames, secondsPerFrame };
}

export function frameSampleCountForDuration(durationSec: number | undefined, budget: FrameBudget = DEFAULT_FRAME_BUDGET) {
  const normalizedBudget = normalizeFrameBudget(budget);
  const safeDuration = Number.isFinite(durationSec) && Number(durationSec) > 0 ? Number(durationSec) : 18;
  return Math.max(
    normalizedBudget.minFrames,
    Math.min(normalizedBudget.maxFrames, Math.ceil(safeDuration / normalizedBudget.secondsPerFrame))
  );
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.round(Number(value)) : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

export type CreativeReconstructionSkillId =
  | "structural_visual_copy_trading"
  | "ctr_threshold_creative_mining"
  | "zero_inventory_affiliate_engine"
  | "semantically_aligned_agentic_interviewing"
  | "non_destructive_frame_reconstruction";

export type CreativeReconstructionSkill = {
  id: CreativeReconstructionSkillId;
  name: string;
  shortName: string;
  description: string;
  remotionUse: string;
  hyperframesUse: string;
  guardrail: string;
};

export const creativeReconstructionSkills: CreativeReconstructionSkill[] = [
  {
    id: "structural_visual_copy_trading",
    name: "Structural Visual Copy-Trading",
    shortName: "结构代理",
    description: "拆解参考视频的节奏、光线、镜头角度、情绪触发和 CTA 行为机制，再围绕新产品重建。",
    remotionUse: "把参考结构转成时间线、字幕卡、镜头节奏和包装层。",
    hyperframesUse: "把镜头构图、转场节拍和视觉层级转成可复用 frame recipe。",
    guardrail: "只迁移结构，不复制竞品画面、脚本、品牌、人物、声音或字幕原文。"
  },
  {
    id: "ctr_threshold_creative_mining",
    name: "CTR-Threshold Creative Mining",
    shortName: "CTR 采矿",
    description: "从广告库或内部样例中按市场、垂类、时间窗和点击表现筛选可复用创意模式。",
    remotionUse: "把高表现模式映射成多个 Remotion 预览赛道和 hook 变体。",
    hyperframesUse: "把指标筛选出的素材风格转成结构模板候选。",
    guardrail: "只记录创意模式和指标线索，不下载或搬运未授权广告素材。"
  },
  {
    id: "zero_inventory_affiliate_engine",
    name: "Zero-Inventory Affiliate Engine",
    shortName: "联盟样片",
    description: "用授权商品图、商品 URL 信息和卖点生成产品评测/演示短视频。",
    remotionUse: "用商品图、卖点卡、使用场景卡和 CTA 拼出本地预览。",
    hyperframesUse: "生成商品评测镜头 recipe、标题条和 affiliate disclosure 层。",
    guardrail: "必须保留联盟营销披露，不能虚构亲测、收益、评价或库存信息。"
  },
  {
    id: "semantically_aligned_agentic_interviewing",
    name: "Semantically Aligned Agentic Interviewing",
    shortName: "语义访谈",
    description: "渲染前通过多步访谈锁定商品名、买家人群、三大卖点、语言市场和合规要求。",
    remotionUse: "把确认后的 brief 写入脚本、字幕和 CTA，减少 one-shot 偏题。",
    hyperframesUse: "先生成结构化 brief，再让 HyperFrames 生成稳定画面组合。",
    guardrail: "缺少关键信息时先提问或标注假设，不让模型自由猜品牌语气。"
  },
  {
    id: "non_destructive_frame_reconstruction",
    name: "Non-Destructive Frame Reconstruction",
    shortName: "非破坏重构",
    description: "按参考画面的构图和运动逻辑重建新场景，而不是把产品粗暴贴到原视频上。",
    remotionUse: "用独立字幕层、卖点卡、背景和镜头运动重建画面表达。",
    hyperframesUse: "生成从零重建的 frame recipe，包括背景、手部、阴影、反光和品牌色。",
    guardrail: "不做未授权 face swap、voice clone、静态遮罩贴图或源帧直接复用。"
  }
];

type CreativeSkillSignalInput = Partial<{
  prompt: string;
  productName: string;
  sellingPoints: string[];
  targetAudience: string;
  tone: string;
  strategy: CreativeStrategy;
}>;

export function inferCreativeSkillIds(input: CreativeSkillSignalInput): CreativeReconstructionSkillId[] {
  const text = [
    input.prompt,
    input.productName,
    input.targetAudience,
    input.tone,
    ...(input.sellingPoints ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  const hasProductBrief = Boolean(input.productName?.trim() || input.sellingPoints?.some((item) => item.trim()));
  const missingBriefDetail = !input.productName?.trim() || !input.sellingPoints?.length || !input.targetAudience?.trim();
  const scores: Record<CreativeReconstructionSkillId, number> = {
    structural_visual_copy_trading: 3,
    ctr_threshold_creative_mining: 0,
    zero_inventory_affiliate_engine: 0,
    semantically_aligned_agentic_interviewing: 0,
    non_destructive_frame_reconstruction: 2.5
  };

  if (hasAny(["迁移", "重构", "参考", "样例", "不复制", "原片", "画面", "构图", "镜头", "运动"])) {
    scores.non_destructive_frame_reconstruction += 1;
  }
  if (hasProductBrief || hasAny(["商品", "产品", "卖点", "电商", "种草", "测评", "带货", "affiliate", "联盟", "购买", "cta"])) {
    scores.zero_inventory_affiliate_engine += 2.5;
  }
  if (hasAny(["爆款", "高点击", "ctr", "点击", "hook", "开头", "快切", "卡点", "节奏", "广告", "投放", "转化"])) {
    scores.ctr_threshold_creative_mining += 2.5;
  }
  if (missingBriefDetail || hasAny(["不确定", "帮我", "自动", "一句话", "需求", "brief", "用户"])) {
    scores.semantically_aligned_agentic_interviewing += 2.25;
  }

  if (input.strategy === "high_click" || input.strategy === "high_rhythm") {
    scores.ctr_threshold_creative_mining += 1.5;
  }
  if (input.strategy === "high_conversion") {
    scores.ctr_threshold_creative_mining += 1;
    scores.zero_inventory_affiliate_engine += 1;
  }
  if (input.strategy === "premium") {
    scores.non_destructive_frame_reconstruction += 1;
    scores.semantically_aligned_agentic_interviewing += 0.75;
  }

  const priority = creativeReconstructionSkills.map((skill) => skill.id);
  const ranked = priority
    .slice()
    .sort((a, b) => scores[b] - scores[a] || priority.indexOf(a) - priority.indexOf(b));
  const selected = ranked.filter((id) => scores[id] >= 2).slice(0, 4);
  return selected.length >= 3 ? selected : ranked.slice(0, 3);
}

export type VideoStyleTrack =
  | "ecommerce_burst"
  | "review_contrast"
  | "b2b_marketing"
  | "talking_head_knowledge"
  | "vlog_lifestyle"
  | "motion_graph_explainer"
  | "event_promo"
  | "tutorial_steps"
  | "premium_brand"
  | "cutting_beat";

export type SegmentKind = "hook" | "body" | "proof" | "offer" | "cta";

export type AssetType =
  | "product_closeup"
  | "usage"
  | "comparison"
  | "person"
  | "scene"
  | "text_card"
  | "cover";

export type MatchStatus = "matched" | "weak_match" | "missing";

export type GapStrategy = "copy" | "packaging" | "reorder" | "reuse" | "aigc";

export type SourceInput = {
  sampleVideoIds: string[];
  materialVideoId: string;
  prompt: string;
  productName: string;
  sellingPoints: string[];
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  creativeSkillIds: CreativeReconstructionSkillId[];
  auxiliaryAssetIds: string[];
  strategy: CreativeStrategy;
};

export type VideoMetadata = {
  id: string;
  fileName: string;
  role: "sample" | "material";
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  coverUrl?: string;
  localPath?: string;
  previewFrameDataUrls?: string[];
  previewFrameCount?: number;
};

export type TranscriptLine = {
  startSec: number;
  endSec: number;
  text: string;
};

export type StructureSlot = {
  id: string;
  segment: SegmentKind;
  intent: string;
  requiredAssetTypes: AssetType[];
  durationSec: number;
  importance: "high" | "medium" | "low";
  rhythmHint: "fast" | "medium" | "slow";
  packagingHints: string[];
};

export type TechniqueAtom = {
  id: string;
  kind: "hook" | "rhythm" | "slot" | "packaging" | "transition" | "cta" | "gap_fill";
  name: string;
  intent: string;
  applicableWhen: string[];
  constraints: string[];
  outputHint: string;
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  source: "seed" | "sample_video" | "material_video";
  vertical: "marketing" | "vlog" | "talking_head" | "cutting" | "motion_graph";
  atoms: TechniqueAtom[];
  structureSlots: StructureSlot[];
  rhythmPattern: string;
  packagingPattern: string[];
  applicableWhen: string[];
};

export type SampleAnalysis = {
  video: VideoMetadata;
  transcript: TranscriptLine[];
  summary: string;
  slots: StructureSlot[];
  atoms: TechniqueAtom[];
  rhythmPattern: string;
  packagingPattern: string[];
  shotCount: number;
};

export type MaterialSegment = {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  assetTypes: AssetType[];
  confidence: number;
  notes: string;
};

export type SlotMatch = {
  slotId: string;
  status: MatchStatus;
  assetIds: string[];
  confidence: number;
  reason: string;
  gapPlan?: {
    strategy: GapStrategy;
    output: string;
  };
};

export type CompositionPlan = {
  id: string;
  strategy: CreativeStrategy;
  selectedAtomIds: string[];
  slotMatches: SlotMatch[];
  rationale: string[];
};

export type TimelineItem = {
  id: string;
  startSec: number;
  endSec: number;
  slotId: string;
  assetIds: string[];
  caption: string;
  packaging: string[];
  transition?: string;
  beatHint?: string;
};

export type PreviewVariant = {
  id: string;
  track: VideoStyleTrack;
  title: string;
  description: string;
  renderer: "remotion" | "hyperframes";
  targetDurationSec: number;
  frameBudget: FrameBudget;
  promptHint: string;
};

export type RemotionSceneDsl = {
  id: string;
  startSec: number;
  endSec: number;
  layout: "centered_caption" | "split_reveal" | "product_card" | "media_clip" | "cta";
  caption: string;
  assetIds: string[];
  motion: "slow_push" | "snap_zoom" | "pan" | "cut" | "hold";
};

export type RemotionCompositionDsl = {
  version: 1;
  candidateName: string;
  scenes: RemotionSceneDsl[];
};

export type CandidateRemotionArtifact = {
  provider: "seedance" | "mock";
  model?: string;
  mockMode: boolean;
  baseDir?: string;
  inputJsonPath?: string;
  dslPath?: string;
  codePath?: string;
  outputPath?: string;
  outputUrl?: string;
  framePaths: string[];
  frameUrls: string[];
  codeHash: string;
  dsl: RemotionCompositionDsl;
  remotionCode: string;
  notes: string[];
};

export type VisualFrameEvidence = {
  frameUrl: string;
  framePath?: string;
  timestampSec: number;
  observation: string;
};

export type StoryboardItem = {
  id: string;
  slotId: string;
  title: string;
  visual: string;
  caption: string;
  reason: string;
};

export type GeneratedPlan = {
  id: string;
  script: string;
  storyboard: StoryboardItem[];
  timeline: TimelineItem[];
  compositionPlan: CompositionPlan;
  packagingSuggestions: string[];
  rendererPrompt: string;
  previewVariants: PreviewVariant[];
  demo: {
    status: "mock_ready" | "rendered" | "failed";
    url?: string;
    note: string;
  };
};

export type BenchmarkDimensionId =
  | "hook_attraction"
  | "brief_copy_adaptation"
  | "reference_structure_transfer"
  | "retention_rhythm"
  | "visual_packaging_watchability"
  | "asset_gap_handling"
  | "safety_explainability"
  | "user_brief_alignment"
  | "uploaded_video_usage"
  | "hook_retention"
  | "visual_packaging"
  | "remotion_code_delta"
  | "safety_compliance";

export type BenchmarkDimensionScore = {
  id: BenchmarkDimensionId;
  label: string;
  score: number;
  maxScore: number;
  evidence: string[];
  deductions: string[];
  fixInstruction: string;
};

export type BenchmarkRevisionBrief = {
  task: "revise_video_plan_from_benchmark";
  targetScore: number;
  currentScore: number;
  failedDimensions: Array<{
    dimension: BenchmarkDimensionId;
    score: number;
    reason: string;
    instruction: string;
  }>;
  mustKeep: string[];
  mustAvoid: string[];
  rewriteScope: Array<"script" | "timeline captions" | "packaging" | "transition" | "beatHint" | "rendererPrompt">;
};

export type BenchmarkScore = {
  candidateId: string;
  iterationIndex: number;
  totalScore: number;
  grade: "excellent" | "pass" | "needs_iteration" | "fail";
  accepted: boolean;
  threshold: {
    regenerateBelow: 60;
    targetScore: number;
    excellentFrom: number;
    maxIterations: number;
  };
  dimensionScores: BenchmarkDimensionScore[];
  hardFailures: Array<{
    code:
      | "missing_real_slots"
      | "empty_preview"
      | "copied_sample_content"
      | "brief_mismatch"
      | "sensitive_leak"
      | "render_failed"
      | "invalid_video"
      | "missing_required_material_use"
      | "no_remotion_code_delta"
      | "unsafe_content"
      | "stagnant_iteration"
      | "mock_mode";
    maxAllowedScore: number;
    reason: string;
  }>;
  topFixes: string[];
  revisionBrief?: BenchmarkRevisionBrief;
};

export type VisualBenchmarkReport = {
  provider: "ark" | "mock";
  model?: string;
  mockMode: boolean;
  score: BenchmarkScore;
  frameEvidence: VisualFrameEvidence[];
  reasons: string[];
  nextRewriteBrief?: string;
};

export type CandidateIteration = {
  candidateId: string;
  parentCandidateId?: string;
  iterationIndex: number;
  script: string;
  storyboard: StoryboardItem[];
  compositionPlan: CompositionPlan;
  timeline: TimelineItem[];
  previewVariants: PreviewVariant[];
  demo: GeneratedPlan["demo"];
  benchmarkScore: BenchmarkScore;
  remotionArtifact?: CandidateRemotionArtifact;
  visualBenchmark?: VisualBenchmarkReport;
  rewriteBrief?: string;
  isBest?: boolean;
};

export type RunResult = {
  mode: "mock" | "real";
  source: SourceInput;
  samples: SampleAnalysis[];
  knowledge: KnowledgeEntry[];
  material: {
    video: VideoMetadata;
    segments: MaterialSegment[];
  };
  generated: GeneratedPlan;
  benchmarkScore: BenchmarkScore;
  iterations: CandidateIteration[];
};
