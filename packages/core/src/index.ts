import { knowledgeStore } from "@byteproject/knowledge";
import type {
  AssetType,
  CompositionPlan,
  GeneratedPlan,
  GapStrategy,
  KnowledgeEntry,
  MaterialSegment,
  RunResult,
  SampleAnalysis,
  SlotMatch,
  SourceInput,
  StoryboardItem,
  StructureSlot,
  TechniqueAtom,
  TimelineItem,
  TranscriptLine,
  VideoMetadata
} from "@byteproject/shared";

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

export function analyzeSampleVideo(video: VideoMetadata, transcript = createMockTranscript()): SampleAnalysis {
  const seed = knowledgeStore.retrieve({ vertical: "marketing", limit: 1 })[0];
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
  knowledgeStore.add(entry);

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

export function segmentLongVideo(video: VideoMetadata, prompt: string): MaterialSegment[] {
  const duration = Math.max(video.durationSec, 18);
  const segmentCount = Math.min(8, Math.max(5, Math.ceil(duration / 8)));
  const segmentDuration = duration / segmentCount;

  return Array.from({ length: segmentCount }, (_, index) => {
    const startSec = Number((index * segmentDuration).toFixed(1));
    const endSec = Number(Math.min(duration, (index + 1) * segmentDuration).toFixed(1));
    const assetTypes = inferSegmentAssetTypes(index, segmentCount, prompt);
    return {
      id: `seg-${index + 1}`,
      startSec,
      endSec,
      label: `${startSec}s-${endSec}s 候选片段`,
      assetTypes,
      confidence: Number((0.62 + Math.min(0.28, index * 0.04)).toFixed(2)),
      notes: `适合用作${assetTypes.map((type) => assetLabels[type]).join("、")}。`
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
    const status: SlotMatch["status"] = exactTypes.length > 0 ? "matched" : slot.requiredAssetTypes.includes("text_card") ? "weak_match" : "missing";
    const confidence = status === "matched" ? Math.min(0.95, best.score / 2) : status === "weak_match" ? 0.48 : 0.18;

    return {
      slotId: slot.id,
      status,
      assetIds: status === "missing" ? [] : [best.segment.id],
      confidence: Number(confidence.toFixed(2)),
      reason:
        status === "matched"
          ? `匹配到 ${best.segment.label}，覆盖 ${exactTypes.map((type) => assetLabels[type]).join("、")}。`
          : status === "weak_match"
            ? "没有直接镜头，但可用文案卡片或包装层承接表达。"
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
      "长视频素材先粗切成候选片段，再按槽位匹配。",
      "缺口使用文案、包装卡片和素材复用补全。"
    ]
  };

  const timeline = buildTimeline(slots, matches, input.source, selectedAtoms);
  const storyboard = buildStoryboard(slots, timeline, matches);
  const script = buildScript(input.source, slots, matches);

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
    demo: {
      status: "mock_ready",
      note: "已生成 Remotion timeline 草案；无渲染器时使用前端低保真预览。"
    }
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
  const total = clamp(source.targetDurationSec || 18, 10, 24);
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
  const materialVideo = createMockVideo("material", "评测长视频素材.mp4");
  const fullSource: SourceInput = {
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

  const sample = analyzeSampleVideo(sampleVideo, createMockTranscript(fullSource.productName));
  const knowledge = knowledgeStore.retrieve({ vertical: "marketing", prompt: fullSource.prompt, limit: 2 });
  const segments = segmentLongVideo(materialVideo, fullSource.prompt);
  const generated = composePlan({ source: fullSource, samples: [sample], knowledge, materialSegments: segments });

  return {
    mode: "mock",
    source: fullSource,
    samples: [sample],
    knowledge,
    material: {
      video: materialVideo,
      segments
    },
    generated
  };
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

