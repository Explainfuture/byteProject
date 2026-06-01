import { knowledgeStore, seedKnowledge } from "@byteproject/knowledge";
import { creativeReconstructionSkills, inferCreativeSkillIds } from "@byteproject/shared";
import type {
  AssetType,
  BenchmarkDimensionId,
  BenchmarkDimensionScore,
  BenchmarkScore,
  CompositionPlan,
  GeneratedPlan,
  GapStrategy,
  KnowledgeEntry,
  MaterialSegment,
  PreviewVariant,
  RunResult,
  SampleAnalysis,
  SegmentKind,
  SlotMatch,
  SourceInput,
  StoryboardItem,
  StructureSlot,
  TechniqueAtom,
  TimelineItem,
  TranscriptLine,
  VideoMetadata
} from "@byteproject/shared";

const FRAME_BUDGET = {
  minFrames: 4,
  maxFrames: 16,
  secondsPerFrame: 4
} as const;

const previewTracks: Array<Omit<PreviewVariant, "id" | "targetDurationSec" | "frameBudget" | "promptHint">> = [
  {
    track: "ecommerce_burst",
    title: "电商爆品快切",
    description: "强 Hook、商品亮相、卖点三连和 CTA 收口。",
    renderer: "remotion"
  },
  {
    track: "review_contrast",
    title: "测评对比",
    description: "问题开场、对照证明、真实感字幕和推荐收口。",
    renderer: "remotion"
  },
  {
    track: "b2b_marketing",
    title: "B 端营销",
    description: "痛点场景、能力拆解、价值证明和咨询引导。",
    renderer: "remotion"
  },
  {
    track: "talking_head_knowledge",
    title: "口播知识",
    description: "观点 Hook、三段解释、关键词强调和互动结尾。",
    renderer: "remotion"
  },
  {
    track: "vlog_lifestyle",
    title: "生活方式 Vlog",
    description: "场景代入、轻字幕、节奏转场和自然 CTA。",
    renderer: "remotion"
  },
  {
    track: "motion_graph_explainer",
    title: "MG 信息流",
    description: "标题卡、图文模块、卡点转场和流程化表达。",
    renderer: "remotion"
  },
  {
    track: "event_promo",
    title: "活动促销",
    description: "优惠前置、倒计时包装、利益点堆叠和强行动。",
    renderer: "remotion"
  },
  {
    track: "tutorial_steps",
    title: "教程步骤",
    description: "步骤拆解、操作镜头、字幕序号和总结卡片。",
    renderer: "remotion"
  },
  {
    track: "premium_brand",
    title: "品牌质感",
    description: "慢节奏镜头、留白字幕、质感包装和品牌收束。",
    renderer: "remotion"
  },
  {
    track: "cutting_beat",
    title: "剪辑卡点",
    description: "高密度切点、音乐节拍、转场组合和情绪递进。",
    renderer: "remotion"
  }
];

const segmentNames: Record<StructureSlot["segment"], string> = {
  hook: "开头吸引",
  body: "商品亮相",
  proof: "卖点证明",
  offer: "利益补充",
  cta: "结尾行动"
};

const assetLabels: Record<AssetType, string> = {
  product_closeup: "商品特写",
  usage: "使用过程",
  comparison: "对比镜头",
  person: "人物表达",
  scene: "场景镜头",
  text_card: "文案卡片",
  cover: "封面候选"
};

export function createMockVideo(role: "sample" | "material", fileName = role === "sample" ? "sample.mp4" : "material.mp4"): VideoMetadata {
  return {
    id: `${role}-${Date.now()}`,
    role,
    fileName,
    durationSec: role === "sample" ? 18 : 48,
    width: 1080,
    height: 1920,
    fps: 30,
    sizeBytes: 24_000_000
  };
}

export function createMockTranscript(productName = "智能随行杯"): TranscriptLine[] {
  return [
    { startSec: 0, endSec: 2, text: "出门总是忘记喝水吗" },
    { startSec: 2, endSec: 5, text: `${productName} 一眼看见余量` },
    { startSec: 5, endSec: 11, text: "三种提醒模式 运动办公都能用" },
    { startSec: 11, endSec: 15, text: "杯身轻巧 放包里也不占空间" },
    { startSec: 15, endSec: 18, text: "现在收藏 对照清单直接选" }
  ];
}

type AnalysisOptions = {
  persist?: boolean;
};

type BriefDrivenTranscriptSource = Pick<SourceInput, "prompt" | "productName" | "sellingPoints" | "targetAudience" | "tone" | "targetDurationSec">;

export function createBriefDrivenTranscript(source: Partial<BriefDrivenTranscriptSource>, video?: Pick<VideoMetadata, "fileName" | "durationSec" | "width" | "height">): TranscriptLine[] {
  const total = clamp(source.targetDurationSec || video?.durationSec || 18, 6, 60);
  const cuts = [0, total * 0.12, total * 0.3, total * 0.7, total * 0.86, total].map((value) => Number(value.toFixed(1)));
  const productName = cleanBriefText(source.productName) || "待定商品";
  const targetAudience = cleanBriefText(source.targetAudience) || "目标用户";
  const tone = cleanBriefText(source.tone) || "清晰、有节奏";
  const prompt = cleanBriefText(source.prompt) || `围绕 ${productName} 生成短视频方案`;
  const sellingPoints = (source.sellingPoints ?? []).map(cleanBriefText).filter(Boolean);
  const primaryPoint = sellingPoints[0] ?? "核心卖点";
  const supportingPoints = sellingPoints.slice(1, 3).join(" / ") || "补充卖点与使用场景";
  const videoBasis = video ? `${video.fileName}${video.width && video.height ? ` ${inferOrientation(video.width, video.height)}` : ""}` : "上传视频";

  return [
    { startSec: cuts[0], endSec: cuts[1], text: `结构依据：${videoBasis}，迁移开头吸引方式` },
    { startSec: cuts[1], endSec: cuts[2], text: `${productName}：${primaryPoint}` },
    { startSec: cuts[2], endSec: cuts[3], text: `卖点推进：${supportingPoints}` },
    { startSec: cuts[3], endSec: cuts[4], text: `${targetAudience}场景：${tone}表达` },
    { startSec: cuts[4], endSec: cuts[5], text: `收口：${shortText(prompt, 28)}` }
  ];
}

export function analyzeSampleVideo(video: VideoMetadata, transcript = createMockTranscript(), options: AnalysisOptions = {}): SampleAnalysis {
  const seed = seedKnowledge.find((entry) => entry.vertical === "marketing") ?? seedKnowledge[0];
  const atoms = deriveAtomsFromTranscript(transcript, seed.atoms);
  const slots = seed.structureSlots.map((slot, index) => ({
    ...slot,
    id: `${video.id}-${slot.id}`,
    intent: enrichIntent(slot.intent, transcript[index]?.text)
  }));

  const entry: KnowledgeEntry = {
    id: `knowledge-${video.id}`,
    title: `样例拆解：${video.fileName}`,
    source: "sample_video",
    vertical: "marketing",
    atoms,
    structureSlots: slots,
    rhythmPattern: "前 2 秒强 hook，中段 3 段卖点快切，结尾短 CTA",
    packagingPattern: ["标题条开场", "卖点卡片补足信息", "CTA 按钮式收尾"],
    applicableWhen: ["商品推广", "素材需要重构", "目标 10-20 秒短视频"]
  };
  if (options.persist !== false) knowledgeStore.add(entry);

  return {
    video,
    transcript,
    summary: `样例 ${video.fileName} 被拆成 ${slots.length} 个结构槽位和 ${atoms.length} 个原子技巧。`,
    slots,
    atoms,
    rhythmPattern: entry.rhythmPattern,
    packagingPattern: entry.packagingPattern,
    shotCount: Math.max(6, Math.round(video.durationSec / 2))
  };
}

function deriveAtomsFromTranscript(transcript: TranscriptLine[], seedAtoms: TechniqueAtom[]): TechniqueAtom[] {
  const transcriptText = transcript.map((line) => line.text).join(" ");
  const generated: TechniqueAtom[] = [
    {
      id: `atom-sample-hook-${hashText(transcriptText)}`,
      kind: "hook",
      name: transcriptText.includes("吗") ? "问题式 Hook" : "利益前置 Hook",
      intent: "把样例开头的吸引方式抽象成可复用句式",
      applicableWhen: ["需要快速建立注意力", "开头素材不够强"],
      constraints: ["不复制样例原句", "只迁移句式结构"],
      outputHint: "使用问题句或利益句，并叠加短标题条"
    },
    {
      id: `atom-sample-rhythm-${hashText(transcriptText)}`,
      kind: "rhythm",
      name: "三段卖点快切",
      intent: "把中段拆成多个短镜头提升信息密度",
      applicableWhen: ["卖点数量大于 2", "目标视频小于 20 秒"],
      constraints: ["每段只讲一个卖点"],
      outputHint: "每 2-3 秒切换一个卖点槽位"
    }
  ];

  return [...generated, ...seedAtoms.slice(0, 5)];
}

function enrichIntent(intent: string, line?: string) {
  return line ? `${intent}；样例表达抽象为“${line.replace(/[。！？!?]/g, "")}”这一类功能。` : intent;
}

export function segmentLongVideo(video: VideoMetadata, prompt: string, targetDurationSec?: number): MaterialSegment[] {
  const duration = Math.max(video.durationSec, 1);
  const segmentCount = Math.min(8, Math.max(3, Math.ceil(duration / 2)));
  const segmentDuration = duration / segmentCount;
  const coverageRatio = targetDurationSec ? Math.min(1, duration / Math.max(targetDurationSec, 1)) : 1;
  const coveragePenalty = coverageRatio < 0.5 ? 0.28 : coverageRatio < 0.75 ? 0.14 : 0;

  return Array.from({ length: segmentCount }, (_, index) => {
    const startSec = Number((index * segmentDuration).toFixed(1));
    const endSec = Number(Math.min(duration, (index + 1) * segmentDuration).toFixed(1));
    const assetTypes = inferSegmentAssetTypes(index, segmentCount, prompt);
    const confidence = Math.max(0.22, 0.62 + Math.min(0.28, index * 0.04) - coveragePenalty);
    return {
      id: `seg-${index + 1}`,
      startSec,
      endSec,
      label: `${startSec}s-${endSec}s 候选片段`,
      assetTypes,
      confidence: Number(confidence.toFixed(2)),
      notes:
        coveragePenalty > 0
          ? `原视频短于目标成片，${assetTypes.map((type) => assetLabels[type]).join("、")}只能弱支撑，需要包装或复用补全。`
          : `适合用作${assetTypes.map((type) => assetLabels[type]).join("、")}。`
    };
  });
}

function inferSegmentAssetTypes(index: number, total: number, prompt: string): AssetType[] {
  const lowerPrompt = prompt.toLowerCase();
  if (index === 0) return ["scene", "cover", "text_card"];
  if (index === total - 1) return ["product_closeup", "text_card"];
  if (lowerPrompt.includes("对比") || index === 2) return ["comparison", "scene"];
  if (index % 2 === 0) return ["usage", "scene"];
  return ["product_closeup", "person"];
}

export function matchSlots(slots: StructureSlot[], segments: MaterialSegment[]): SlotMatch[] {
  return slots.map((slot) => {
    const ranked = segments
      .map((segment) => ({
        segment,
        score: segment.assetTypes.filter((type) => slot.requiredAssetTypes.includes(type)).length + segment.confidence
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const exactTypes = best?.segment.assetTypes.filter((type) => slot.requiredAssetTypes.includes(type)) ?? [];
    const hasExactType = exactTypes.length > 0;
    const isLowConfidence = (best?.segment.confidence ?? 0) < 0.55;
    const status: SlotMatch["status"] = hasExactType && !isLowConfidence ? "matched" : hasExactType || slot.requiredAssetTypes.includes("text_card") ? "weak_match" : "missing";
    const confidence = status === "matched" ? Math.min(0.95, best.score / 2) : status === "weak_match" ? Math.max(0.34, Math.min(0.54, best?.segment.confidence ?? 0.42)) : 0.18;

    return {
      slotId: slot.id,
      status,
      assetIds: status === "missing" ? [] : [best.segment.id],
      confidence: Number(confidence.toFixed(2)),
      reason:
        status === "matched"
          ? `匹配到 ${best.segment.label}，覆盖 ${exactTypes.map((type) => assetLabels[type]).join("、")}。`
          : status === "weak_match"
            ? hasExactType
              ? `仅弱匹配 ${best.segment.label}，原素材时长或画面覆盖不足，需要用包装层、裁切复用或文案补强。`
              : "没有直接镜头，但可用文案卡片或包装层承接表达。"
            : `缺少 ${slot.requiredAssetTypes.map((type) => assetLabels[type]).join("、")}。`
    };
  });
}

export function planGaps(matches: SlotMatch[], slots: StructureSlot[]): SlotMatch[] {
  return matches.map((match) => {
    if (match.status === "matched") return match;

    const slot = slots.find((item) => item.id === match.slotId);
    const strategy: GapStrategy = chooseGapStrategy(slot, match.status);
    return {
      ...match,
      gapPlan: {
        strategy,
        output: describeGapStrategy(strategy, slot)
      }
    };
  });
}

function chooseGapStrategy(slot: StructureSlot | undefined, status: SlotMatch["status"]): GapStrategy {
  if (!slot) return "copy";
  if (slot.segment === "hook") return "packaging";
  if (slot.segment === "proof" && status === "missing") return "reuse";
  if (slot.segment === "cta") return "copy";
  return "reorder";
}

function describeGapStrategy(strategy: GapStrategy, slot?: StructureSlot) {
  const segment = slot ? segmentNames[slot.segment] : "该槽位";
  const descriptions: Record<GapStrategy, string> = {
    copy: `${segment}缺素材时，用短字幕和旁白补足表达。`,
    packaging: `${segment}使用标题条、卖点卡片和强调贴纸补足视觉信息。`,
    reorder: `${segment}降低镜头依赖，把信息前移到已有素材片段。`,
    reuse: `${segment}通过局部放大、裁切和重复利用已有片段补齐。`,
    aigc: `${segment}预留 AIGC 静态图或配音补全。`
  };
  return descriptions[strategy];
}

export function composePlan(input: {
  source: SourceInput;
  samples: SampleAnalysis[];
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
}): GeneratedPlan {
  const primaryKnowledge = input.knowledge[0] ?? knowledgeStore.retrieve({ vertical: "marketing", limit: 1 })[0];
  const slots = primaryKnowledge.structureSlots;
  const selectedAtoms = selectAtoms(primaryKnowledge.atoms, input.source.strategy);
  const matches = planGaps(matchSlots(slots, input.materialSegments), slots);
  const compositionPlan: CompositionPlan = {
    id: `composition-${Date.now()}`,
    strategy: input.source.strategy,
    selectedAtomIds: selectedAtoms.map((atom) => atom.id),
    slotMatches: matches,
    rationale: [
      "从样例中迁移结构原子，而不是复用样例内容。",
      `可用创意技能：${selectedCreativeSkills(input.source).map((skill) => skill.shortName).join(" / ") || "未指定，按基础结构迁移执行"}。`,
      "上传视频会先抽帧并粗分成候选画面，再评估各结构槽位的支撑度。",
      "缺口使用文案、包装卡片和素材复用补全。"
    ]
  };

  const timeline = buildTimeline(slots, matches, input.source, selectedAtoms);
  const storyboard = buildStoryboard(slots, timeline, matches);
  const script = buildScript(input.source, slots, matches);
  const previewVariants = buildPreviewVariants(input.source, timeline);
  const rendererPrompt = buildRendererPrompt(input.source, script, timeline, previewVariants);

  return {
    id: `plan-${Date.now()}`,
    script,
    storyboard,
    timeline,
    compositionPlan,
    packagingSuggestions: [
      "开头使用大字标题条，不复用样例原文案。",
      "中段每个卖点配一张卖点卡片，弱素材片段用局部放大。",
      "结尾使用按钮式 CTA 和 0.5 秒定格。"
    ],
    rendererPrompt,
    previewVariants,
    demo: {
      status: "mock_ready",
      note: "已生成 Remotion timeline 草案；无渲染器时使用前端低保真预览。"
    }
  };
}

const BENCHMARK_THRESHOLD = {
  regenerateBelow: 60,
  targetScore: 80,
  excellentFrom: 85,
  maxIterations: 3
} as const;

const dimensionLabels: Record<BenchmarkDimensionId, string> = {
  hook_attraction: "开头吸引力与停留动机",
  brief_copy_adaptation: "用户需求与文案适配",
  reference_structure_transfer: "样例结构迁移质量",
  retention_rhythm: "叙事推进与留存节奏",
  visual_packaging_watchability: "画面包装与可观看性",
  asset_gap_handling: "素材利用与缺口处理",
  safety_explainability: "合规、安全与可解释性"
};

export function scoreCandidate(input: {
  candidateId?: string;
  iterationIndex?: number;
  source: SourceInput;
  sample?: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
  generated: GeneratedPlan;
  usedVision?: boolean;
}): BenchmarkScore {
  const generatedText = collectGeneratedText(input.generated);
  const timeline = input.generated.timeline;
  const matches = input.generated.compositionPlan.slotMatches;
  const sampleSlots = input.sample?.slots ?? [];
  const hardFailures: BenchmarkScore["hardFailures"] = [];
  const firstItem = timeline[0];
  const timelineDuration = timeline.at(-1)?.endSec ?? 0;
  const expectedOrder: SegmentKind[] = ["hook", "body", "proof", "offer", "cta"];
  const sampleSlotById = new Map(sampleSlots.map((slot) => [slot.id, slot]));
  const timelineSegments = timeline.map((item) => sampleSlotById.get(item.slotId)?.segment).filter(Boolean) as SegmentKind[];
  const briefFacts = [input.source.productName, ...input.source.sellingPoints].map(cleanBriefText).filter((item) => item.length >= 2);
  const briefHitCount = briefFacts.filter((fact) => generatedText.includes(fact)).length;
  const copiedLines = (input.sample?.transcript ?? [])
    .map((line) => cleanBriefText(line.text))
    .filter((line) => line.length >= 8 && generatedText.includes(line));
  const hasSensitiveLeak = /([A-Z]:\\|\/Users\/|\/home\/|localPath|ARK_API_KEY|Bearer\s+|endpoint id|stack trace)/i.test(generatedText);

  if (!sampleSlots.length || input.usedVision === false) {
    hardFailures.push({
      code: "missing_real_slots",
      maxAllowedScore: 59,
      reason: "没有真实视频结构 slots，不能把 mock 或规则 fallback 包装成真实视频理解结果。"
    });
  }
  if (input.generated.demo.status === "failed" || !timeline.length) {
    hardFailures.push({
      code: "empty_preview",
      maxAllowedScore: 59,
      reason: "没有可播放预览或时间线为空，不能进入交付。"
    });
  }
  if (copiedLines.length) {
    hardFailures.push({
      code: "copied_sample_content",
      maxAllowedScore: 49,
      reason: "生成结果复用了样例原字幕或原文案。"
    });
  }
  if (briefFacts.length && briefHitCount === 0) {
    hardFailures.push({
      code: "brief_mismatch",
      maxAllowedScore: 59,
      reason: "生成结果没有吸收用户提供的商品名或卖点。"
    });
  }
  if (hasSensitiveLeak) {
    hardFailures.push({
      code: "sensitive_leak",
      maxAllowedScore: 40,
      reason: "生成结果包含本地路径、密钥、endpoint 或 provider 细节。"
    });
  }

  const hookScore = clampScore(
    8 +
      (timelineSegments[0] === "hook" ? 4 : 0) +
      (firstItem?.caption && firstItem.caption.length <= 28 ? 3 : 0) +
      (firstItem?.packaging?.length ? 3 : 0) +
      (firstItem?.beatHint || firstItem?.transition ? 2 : 0),
    20
  );

  const briefScore = clampScore(
    5 +
      (briefFacts.length ? Math.min(7, Math.round((briefHitCount / briefFacts.length) * 7)) : 4) +
      (input.source.targetAudience && generatedText.includes(input.source.targetAudience) ? 2 : 0) +
      (input.source.tone && generatedText.includes(input.source.tone.slice(0, 4)) ? 1 : 0),
    15
  );

  const transferScore = clampScore(
    4 +
      (sampleSlots.length >= 5 ? 4 : sampleSlots.length) +
      (input.generated.compositionPlan.selectedAtomIds.length ? 3 : 0) +
      (matches.length >= Math.min(sampleSlots.length, 5) ? 3 : 0) +
      (input.knowledge.length ? 1 : 0),
    15
  );

  const orderedSegments = expectedOrder.filter((segment) => timelineSegments.includes(segment));
  const hasOrderedFlow = orderedSegments.every((segment, index) => expectedOrder.indexOf(segment) >= index);
  const durationVariation = new Set(timeline.map((item) => Number((item.endSec - item.startSec).toFixed(1)))).size;
  const rhythmScore = clampScore(
    4 +
      (timeline.length >= 5 ? 4 : timeline.length) +
      (hasOrderedFlow ? 3 : 0) +
      (timelineDuration >= 10 && timelineDuration <= 60 ? 2 : 0) +
      (durationVariation >= 3 ? 2 : 0),
    15
  );

  const packagedItems = timeline.filter((item) => item.packaging.length || item.transition || item.beatHint).length;
  const watchabilityScore = clampScore(
    4 +
      (input.generated.demo.status === "rendered" || input.generated.demo.status === "mock_ready" ? 3 : 0) +
      Math.min(4, packagedItems) +
      (input.generated.packagingSuggestions.length >= 3 ? 2 : input.generated.packagingSuggestions.length) +
      (timeline.every((item) => item.caption.trim().length > 0) ? 2 : 0),
    15
  );

  const diagnosedMatches = matches.filter((match) => match.status === "matched" || match.gapPlan).length;
  const weakOrMissingWithPlan = matches.filter((match) => match.status !== "matched").every((match) => Boolean(match.gapPlan));
  const gapScore = clampScore(
    2 +
      (matches.length ? Math.round((diagnosedMatches / matches.length) * 4) : 0) +
      (weakOrMissingWithPlan ? 2 : 0) +
      (input.materialSegments.length ? 2 : 0),
    10
  );

  const safetyScore = clampScore(
    4 +
      (hasSensitiveLeak ? 0 : 3) +
      (copiedLines.length ? 0 : 2) +
      (input.generated.compositionPlan.rationale.length ? 1 : 0),
    10
  );

  const dimensionScores: BenchmarkDimensionScore[] = [
    makeDimension("hook_attraction", 20, hookScore, [
      firstItem ? `首段 ${firstItem.startSec}-${firstItem.endSec}s，caption: ${firstItem.caption}` : "缺少首段时间线。"
    ], hookScore >= 16 ? [] : ["首段 hook、短字幕或节奏提示不够强。"], "强化前 3 秒冲突、利益点或反差，并给首段增加明确包装。"),
    makeDimension("brief_copy_adaptation", 15, briefScore, [
      briefFacts.length ? `命中 ${briefHitCount}/${briefFacts.length} 个用户事实。` : "用户未提供商品事实，按 prompt 相关性评分。"
    ], briefScore >= 12 ? [] : ["用户商品名、卖点或人群吸收不足。"], "把用户事实改写成口语化短视频文案，避免只复述表单。"),
    makeDimension("reference_structure_transfer", 15, transferScore, [
      `样例 slots: ${sampleSlots.length}，引用 atoms: ${input.generated.compositionPlan.selectedAtomIds.length}，知识条目: ${input.knowledge.length}。`
    ], transferScore >= 12 ? [] : ["结构槽位、知识 atom 或 slot match 覆盖不足。"], "保留 hook/body/proof/offer/cta 结构，并明确每段迁移了哪个原子技巧。"),
    makeDimension("retention_rhythm", 15, rhythmScore, [
      `时间线 ${timeline.length} 段，总时长 ${timelineDuration}s，节奏段长变化 ${durationVariation} 种。`
    ], rhythmScore >= 12 ? [] : ["推进顺序或段落节奏不够清晰。"], "压缩拖沓段落，增加信息递进、高潮点和 CTA 收口。"),
    makeDimension("visual_packaging_watchability", 15, watchabilityScore, [
      `demo 状态: ${input.generated.demo.status}，有包装/转场/节拍的段落: ${packagedItems}/${timeline.length}。`
    ], watchabilityScore >= 12 ? [] : ["包装密度、可播放状态或非空 caption 需要增强。"], "增加标题条、卖点卡、进度条或卡点转场，并确保预览非空白可播放。"),
    makeDimension("asset_gap_handling", 10, gapScore, [
      `素材候选 ${input.materialSegments.length} 段，诊断 slot match ${diagnosedMatches}/${matches.length}。`
    ], gapScore >= 8 ? [] : ["弱匹配或缺失槽位缺少可执行 gapPlan。"], "给每个 weak/missing slot 补上 reuse/copy/packaging/reorder 等方案。"),
    makeDimension("safety_explainability", 10, safetyScore, [
      input.generated.compositionPlan.rationale[0] ?? "缺少可解释 rationale。"
    ], safetyScore >= 8 ? [] : ["需要更清楚地区分结构迁移、素材复用和降级状态。"], "移除敏感信息，补充抽帧、slot、知识 atom 和主要扣分证据。")
  ];

  const rawScore = dimensionScores.reduce((sum, dimension) => sum + dimension.score, 0);
  const maxAllowedScore = hardFailures.reduce((cap, failure) => Math.min(cap, failure.maxAllowedScore), 100);
  const totalScore = Math.min(rawScore, maxAllowedScore);
  const accepted = totalScore >= BENCHMARK_THRESHOLD.targetScore && hardFailures.length === 0;
  const grade: BenchmarkScore["grade"] =
    totalScore >= BENCHMARK_THRESHOLD.excellentFrom && hardFailures.length === 0
      ? "excellent"
      : accepted
        ? "pass"
        : totalScore >= BENCHMARK_THRESHOLD.regenerateBelow
          ? "needs_iteration"
          : "fail";
  const topFixes = dimensionScores
    .slice()
    .sort((a, b) => b.maxScore - b.score - (a.maxScore - a.score))
    .filter((dimension) => dimension.score < dimension.maxScore)
    .slice(0, 3)
    .map((dimension) => dimension.fixInstruction);

  const score: BenchmarkScore = {
    candidateId: input.candidateId ?? input.generated.id,
    iterationIndex: input.iterationIndex ?? 0,
    totalScore,
    grade,
    accepted,
    threshold: { ...BENCHMARK_THRESHOLD },
    dimensionScores,
    hardFailures,
    topFixes
  };

  if (!accepted) {
    score.revisionBrief = {
      task: "revise_video_plan_from_benchmark",
      targetScore: BENCHMARK_THRESHOLD.targetScore,
      currentScore: totalScore,
      failedDimensions: dimensionScores
        .slice()
        .sort((a, b) => b.maxScore - b.score - (a.maxScore - a.score))
        .slice(0, 3)
        .map((dimension) => ({
          dimension: dimension.id,
          score: dimension.score,
          reason: dimension.deductions[0] ?? `该维度未满分：${dimension.score}/${dimension.maxScore}`,
          instruction: dimension.fixInstruction
        })),
      mustKeep: [
        "继续使用同一轮上传视频、sample slots、material segment ids 和用户事实。",
        "只迁移创作结构，不复制样例原画面、原字幕、原文案、人物或声音。"
      ],
      mustAvoid: [
        "不要虚构未提供的商品能力、测评数据、优惠或库存。",
        "不要泄露本地路径、API key、provider 原始错误或 endpoint。"
      ],
      rewriteScope: ["script", "timeline captions", "packaging", "transition", "beatHint", "rendererPrompt"]
    };
  }

  return score;
}

export function createEmptyBenchmarkScore(candidateId: string, reason: string): BenchmarkScore {
  const dimensionScores: BenchmarkDimensionScore[] = [
    makeDimension("hook_attraction", 20, 0, [], [reason], "上传视频并生成候选后再评估 hook。"),
    makeDimension("brief_copy_adaptation", 15, 0, [], [reason], "补充迁移目标和商品事实。"),
    makeDimension("reference_structure_transfer", 15, 0, [], [reason], "先补齐真实样例结构 slots。"),
    makeDimension("retention_rhythm", 15, 0, [], [reason], "生成时间线后再评估节奏。"),
    makeDimension("visual_packaging_watchability", 15, 0, [], [reason], "生成可播放预览后再评估包装。"),
    makeDimension("asset_gap_handling", 10, 0, [], [reason], "先完成素材槽位匹配。"),
    makeDimension("safety_explainability", 10, 0, [], [reason], "生成结果后再评估安全解释。")
  ];
  return {
    candidateId,
    iterationIndex: 0,
    totalScore: 0,
    grade: "fail",
    accepted: false,
    threshold: { ...BENCHMARK_THRESHOLD },
    dimensionScores,
    hardFailures: [
      {
        code: "empty_preview",
        maxAllowedScore: 59,
        reason
      }
    ],
    topFixes: ["上传视频并让 Agent 完成生成后再打分。"]
  };
}

function selectAtoms(atoms: TechniqueAtom[], strategy: SourceInput["strategy"]) {
  const priorityKinds = strategy === "high_conversion" ? ["cta", "slot", "gap_fill"] : strategy === "high_rhythm" ? ["rhythm", "transition"] : ["hook", "slot", "packaging", "cta"];
  return atoms
    .slice()
    .sort((a, b) => priorityKinds.indexOf(b.kind) - priorityKinds.indexOf(a.kind))
    .slice(0, 6);
}

function buildTimeline(slots: StructureSlot[], matches: SlotMatch[], source: SourceInput, atoms: TechniqueAtom[]): TimelineItem[] {
  const total = clamp(source.targetDurationSec || 18, 10, 60);
  const slotDurationSum = slots.reduce((sum, slot) => sum + slot.durationSec, 0);
  let cursor = 0;

  return slots.map((slot, index) => {
    const duration = index === slots.length - 1 ? total - cursor : Number(((slot.durationSec / slotDurationSum) * total).toFixed(1));
    const startSec = Number(cursor.toFixed(1));
    const endSec = Number(Math.min(total, cursor + duration).toFixed(1));
    cursor = endSec;
    const match = matches.find((item) => item.slotId === slot.id);
    const atom = atoms[index % atoms.length];

    return {
      id: `timeline-${index + 1}`,
      startSec,
      endSec,
      slotId: slot.id,
      assetIds: match?.assetIds ?? [],
      caption: captionForSlot(slot, source, match),
      packaging: [...slot.packagingHints, atom?.name ? `原子技巧：${atom.name}` : ""].filter(Boolean),
      transition: slot.rhythmHint === "fast" ? "快速切换/轻微推近" : "顺切",
      beatHint: slot.rhythmHint === "fast" ? "卡点" : "平稳"
    };
  });
}

function buildPreviewVariants(source: SourceInput, timeline: TimelineItem[]): PreviewVariant[] {
  const targetDurationSec = clamp(timeline.at(-1)?.endSec ?? source.targetDurationSec ?? 18, 10, 60);
  return previewTracks.map((track, index) => ({
    id: `preview-${index + 1}-${track.track}`,
    ...track,
    targetDurationSec,
    frameBudget: { ...FRAME_BUDGET },
    promptHint: [
      `使用 ${track.renderer} 生成「${track.title}」预览。`,
      `总时长控制在 ${targetDurationSec} 秒内，抽帧预算 ${FRAME_BUDGET.minFrames}-${FRAME_BUDGET.maxFrames} 张，约每 ${FRAME_BUDGET.secondsPerFrame} 秒一帧。`,
      `输入脚本来自结构迁移结果，禁止复用样例视频原画面、原字幕和原文案。`,
      `重点表达：${track.description}`
    ].join(" ")
  }));
}

function buildRendererPrompt(source: SourceInput, script: string, timeline: TimelineItem[], variants: PreviewVariant[]) {
  const skills = selectedCreativeSkills(source);
  return JSON.stringify({
    task: "Generate local Remotion preview compositions from the transferred structure.",
    constraints: {
      maxDurationSec: 60,
      frameBudget: FRAME_BUDGET,
      preserveTimelineTiming: true,
      doNotCopySampleContent: true,
      output: "playable local Remotion preview first; MP4 export is optional"
    },
    brief: {
      prompt: source.prompt,
      productName: source.productName,
      sellingPoints: source.sellingPoints,
      targetAudience: source.targetAudience,
      tone: source.tone,
      strategy: source.strategy
    },
    creativeSkills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      remotionUse: skill.remotionUse,
      guardrail: skill.guardrail
    })),
    script,
    timeline,
    previewVariants: variants.map((variant) => ({
      track: variant.track,
      title: variant.title,
      renderer: variant.renderer,
      promptHint: variant.promptHint
    }))
  });
}

function selectedCreativeSkills(source: SourceInput) {
  const selected = new Set(source.creativeSkillIds ?? []);
  return creativeReconstructionSkills.filter((skill) => selected.has(skill.id));
}

function captionForSlot(slot: StructureSlot, source: SourceInput, match?: SlotMatch) {
  const point = source.sellingPoints[0] ?? "核心卖点";
  const captions: Record<StructureSlot["segment"], string> = {
    hook: `${source.targetAudience || "你"}也遇到过这个问题吗？`,
    body: `${source.productName || "这款产品"}：${point}`,
    proof: source.sellingPoints.slice(0, 3).join(" / ") || "把使用过程讲清楚",
    offer: match?.gapPlan?.output ?? "适合日常高频使用",
    cta: "收藏对照，直接按需求选择"
  };
  return captions[slot.segment];
}

function buildStoryboard(slots: StructureSlot[], timeline: TimelineItem[], matches: SlotMatch[]): StoryboardItem[] {
  return slots.map((slot, index) => {
    const item = timeline[index];
    const match = matches.find((candidate) => candidate.slotId === slot.id);
    return {
      id: `storyboard-${index + 1}`,
      slotId: slot.id,
      title: segmentNames[slot.segment],
      visual: match?.status === "matched" ? `使用素材片段 ${match.assetIds.join(", ")}` : match?.gapPlan?.output ?? "用包装层补足",
      caption: item.caption,
      reason: match?.reason ?? slot.intent
    };
  });
}

function buildScript(source: SourceInput, slots: StructureSlot[], matches: SlotMatch[]) {
  const lines = slots.map((slot) => {
    const match = matches.find((item) => item.slotId === slot.id);
    return `【${segmentNames[slot.segment]}】${captionForSlot(slot, source, match)}${match?.gapPlan ? `（补全：${match.gapPlan.output}）` : ""}`;
  });

  return [`主题：${source.prompt || "营销短视频重构"}`, `商品：${source.productName || "待填写商品"}`, ...lines].join("\n");
}

export function runMockPipeline(source?: Partial<SourceInput>): RunResult {
  const sampleVideo = createMockVideo("sample", "爆款样例.mp4");
  const materialVideo: VideoMetadata = { ...sampleVideo, role: "material" };
  const sourceWithDefaults = {
    sampleVideoIds: [sampleVideo.id],
    materialVideoId: materialVideo.id,
    prompt: source?.prompt ?? "把这段素材重构成高转化商品短视频",
    productName: source?.productName ?? "智能随行杯",
    sellingPoints: source?.sellingPoints ?? ["一眼看见余量", "三种提醒模式", "轻巧不占包"],
    targetAudience: source?.targetAudience ?? "通勤和运动人群",
    tone: source?.tone ?? "清晰、有节奏、偏转化",
    targetDurationSec: source?.targetDurationSec ?? 18,
    auxiliaryAssetIds: source?.auxiliaryAssetIds ?? [],
    strategy: source?.strategy ?? "balanced"
  };
  const fullSource: SourceInput = {
    ...sourceWithDefaults,
    creativeSkillIds: source?.creativeSkillIds ?? inferCreativeSkillIds(sourceWithDefaults)
  };

  const sample = analyzeSampleVideo(sampleVideo, createMockTranscript(fullSource.productName), { persist: false });
  const knowledge = knowledgeStore.retrieve({ vertical: "marketing", prompt: fullSource.prompt, limit: 2 });
  const segments = segmentLongVideo(materialVideo, fullSource.prompt, fullSource.targetDurationSec);
  const generated = composePlan({ source: fullSource, samples: [sample], knowledge, materialSegments: segments });
  const benchmarkScore = scoreCandidate({
    source: fullSource,
    sample,
    knowledge,
    materialSegments: segments,
    generated,
    usedVision: true
  });

  return {
    mode: "mock",
    source: fullSource,
    samples: [sample],
    knowledge,
    material: {
      video: materialVideo,
      segments
    },
    generated,
    benchmarkScore,
    iterations: [
      {
        candidateId: generated.id,
        iterationIndex: 0,
        compositionPlan: generated.compositionPlan,
        timeline: generated.timeline,
        benchmarkScore
      }
    ]
  };
}

function makeDimension(
  id: BenchmarkDimensionId,
  maxScore: number,
  score: number,
  evidence: string[],
  deductions: string[],
  fixInstruction: string
): BenchmarkDimensionScore {
  return {
    id,
    label: dimensionLabels[id],
    score: clampScore(score, maxScore),
    maxScore,
    evidence: evidence.filter(Boolean).slice(0, 4),
    deductions: deductions.filter(Boolean).slice(0, 4),
    fixInstruction
  };
}

function collectGeneratedText(plan: GeneratedPlan) {
  return [
    plan.id,
    plan.script,
    plan.rendererPrompt,
    plan.demo.note,
    ...plan.storyboard.flatMap((item) => [item.title, item.visual, item.caption, item.reason]),
    ...plan.timeline.flatMap((item) => [item.caption, item.packaging.join(" "), item.transition ?? "", item.beatHint ?? ""]),
    ...plan.compositionPlan.rationale,
    ...plan.packagingSuggestions
  ].join("\n");
}

function clampScore(value: number, maxScore: number) {
  return Math.max(0, Math.min(maxScore, Math.round(value)));
}

function hashText(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cleanBriefText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function shortText(value: string, maxLength: number) {
  const text = cleanBriefText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function inferOrientation(width: number, height: number) {
  if (Math.abs(width - height) < 2) return "方屏";
  return width > height ? "横屏" : "竖屏";
}
