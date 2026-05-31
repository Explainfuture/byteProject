import type { KnowledgeEntry, TechniqueAtom } from "@byteproject/shared";

const marketingAtoms: TechniqueAtom[] = [
  {
    id: "atom-hook-painpoint",
    kind: "hook",
    name: "痛点反问 Hook",
    intent: "在 2 秒内用用户痛点建立注意力",
    applicableWhen: ["营销类商品", "用户有明确问题", "素材缺少强视觉开场"],
    constraints: ["首句不超过 16 个中文字符", "必须指向目标人群"],
    outputHint: "用一句反问或反差句开场，并配标题条"
  },
  {
    id: "atom-slot-product-reveal",
    kind: "slot",
    name: "商品亮相槽位",
    intent: "让观众快速知道视频卖的是什么",
    applicableWhen: ["商品有特写素材", "需要转化导向"],
    constraints: ["出现在 3-6 秒内", "避免只露包装不露核心卖点"],
    outputHint: "安排商品特写或局部放大镜头，叠加产品名"
  },
  {
    id: "atom-proof-compare",
    kind: "slot",
    name: "对比证明",
    intent: "用前后对比或替代方案强化可信度",
    applicableWhen: ["存在对比素材", "卖点需要证明"],
    constraints: ["对比表达不能夸大", "弱素材时用文案卡片替代"],
    outputHint: "把旧问题与新效果放在连续两个镜头中"
  },
  {
    id: "atom-rhythm-accelerate",
    kind: "rhythm",
    name: "中段节奏加速",
    intent: "用短镜头和卡点推进卖点密度",
    applicableWhen: ["卖点超过 2 个", "视频目标 10-20 秒"],
    constraints: ["单个卖点镜头 1.5-3 秒", "字幕不能遮挡主体"],
    outputHint: "中段用 3 个短块推进卖点，每块一个核心信息"
  },
  {
    id: "atom-packaging-benefit-card",
    kind: "packaging",
    name: "卖点卡片补位",
    intent: "当素材不足时用图文包装补足表达",
    applicableWhen: ["缺少商品特写", "缺少使用过程", "素材画面信息弱"],
    constraints: ["每张卡片只讲一个卖点", "卡片停留不少于 1.2 秒"],
    outputHint: "生成标题条 + 卖点卡片 + 强调贴纸"
  },
  {
    id: "atom-cta-urgency",
    kind: "cta",
    name: "明确行动 CTA",
    intent: "结尾给出购买、咨询或收藏动作",
    applicableWhen: ["营销类商品", "需要转化"],
    constraints: ["不虚假承诺", "CTA 不超过 2 秒"],
    outputHint: "用短句 CTA 和按钮式包装结束"
  },
  {
    id: "atom-gap-reuse-zoom",
    kind: "gap_fill",
    name: "局部放大复用",
    intent: "把单一素材拆成多个视觉变化",
    applicableWhen: ["素材少", "只有一段长视频或单个商品镜头"],
    constraints: ["不要连续重复超过 2 次", "放大后仍需清晰"],
    outputHint: "裁切、局部放大、重复利用同一镜头生成多个片段"
  },
  {
    id: "atom-pattern-interruption-hook",
    kind: "hook",
    name: "Pattern interruption hook",
    intent: "Break the scroll in the first second with a visual contradiction, result-first claim, or problem reveal before explaining the product.",
    applicableWhen: ["template preset has no real footage", "the opening looks like a static title card", "the product benefit is abstract"],
    constraints: ["first caption should be concrete and curiosity-driven", "avoid generic slogans", "show a moving layout cue within the first 0.8s"],
    outputHint: "Use a moving headline, snap zoom, contrast stripe, countdown chip, or split-screen proof teaser instead of one centered sentence."
  },
  {
    id: "atom-proof-before-after-stack",
    kind: "slot",
    name: "Before-after proof stack",
    intent: "Turn a selling point into believable evidence by showing problem, action, and result as three quick visual states.",
    applicableWhen: ["needs purchase persuasion", "comparison footage is missing", "the claim needs proof"],
    constraints: ["do not invent measurable claims", "label weak evidence as scenario or expected effect", "keep each state under 2s"],
    outputHint: "Render problem card -> action/process card -> result card with a clear before/after divider and a fast beat cut."
  },
  {
    id: "atom-motion-packaging-system",
    kind: "packaging",
    name: "Motion packaging system",
    intent: "Make low-material videos feel edited by combining kinetic subtitles, cards, progress bars, sticker chips, and CTA buttons.",
    applicableWhen: ["only text_card assets are available", "template rendering needs more energy", "video feels like slide playback"],
    constraints: ["every slot must have a different layout", "no more than one centered-only caption in a row", "motion should support the message"],
    outputHint: "Use animated benefit cards, moving accent bars, progress indicators, sticky labels, and bottom CTA plates across the timeline."
  },
  {
    id: "atom-cta-specific-action",
    kind: "cta",
    name: "Specific action CTA",
    intent: "End with a concrete next action tied to the strongest benefit instead of a generic call to buy.",
    applicableWhen: ["conversion is the goal", "viewer needs a final push", "the offer slot is weak"],
    constraints: ["CTA must fit one short line", "avoid fake urgency or unsupported discounts"],
    outputHint: "Use a button-like CTA plate plus one benefit reminder, for example try it today, compare your old workflow, or save this checklist."
  }
];

export const seedKnowledge: KnowledgeEntry[] = [
  {
    id: "knowledge-marketing-seed",
    title: "营销类商品短视频基础结构",
    source: "seed",
    vertical: "marketing",
    atoms: marketingAtoms,
    rhythmPattern: "0-1s pattern interruption + 2s problem/result hook + fast proof stack + benefit card sequence + concrete CTA",
    packagingPattern: ["moving headline", "benefit card stack", "before-after divider", "progress bar", "sticker chip", "button-like CTA plate"],
    applicableWhen: ["商品推广", "电商种草", "素材可从长视频重构"],
    structureSlots: [
      {
        id: "slot-hook",
        segment: "hook",
        intent: "用痛点或反差抓住注意力",
        requiredAssetTypes: ["scene", "text_card", "person"],
        durationSec: 2,
        importance: "high",
        rhythmHint: "fast",
        packagingHints: ["大字标题条", "问题式字幕"]
      },
      {
        id: "slot-product",
        segment: "body",
        intent: "商品亮相并说明核心卖点",
        requiredAssetTypes: ["product_closeup", "cover"],
        durationSec: 3,
        importance: "high",
        rhythmHint: "medium",
        packagingHints: ["产品名标签", "局部放大"]
      },
      {
        id: "slot-proof",
        segment: "proof",
        intent: "展示使用过程或对比证明",
        requiredAssetTypes: ["usage", "comparison", "scene"],
        durationSec: 8,
        importance: "high",
        rhythmHint: "fast",
        packagingHints: ["卖点三连卡片", "卡点切换"]
      },
      {
        id: "slot-offer",
        segment: "offer",
        intent: "补充利益点或适用场景",
        requiredAssetTypes: ["text_card", "scene"],
        durationSec: 3,
        importance: "medium",
        rhythmHint: "medium",
        packagingHints: ["利益点卡片", "场景标签"]
      },
      {
        id: "slot-cta",
        segment: "cta",
        intent: "明确行动引导",
        requiredAssetTypes: ["product_closeup", "text_card"],
        durationSec: 2,
        importance: "high",
        rhythmHint: "fast",
        packagingHints: ["CTA 按钮", "收尾定格"]
      }
    ]
  }
];

export class KnowledgeStore {
  private entries = [...seedKnowledge];

  list() {
    return this.entries;
  }

  add(entry: KnowledgeEntry) {
    this.entries = [entry, ...this.entries.filter((item) => item.id !== entry.id)];
    return entry;
  }

  retrieve(query: { vertical?: KnowledgeEntry["vertical"]; prompt?: string; limit?: number }) {
    const limit = query.limit ?? 3;
    const normalizedPrompt = (query.prompt ?? "").toLowerCase();

    return this.entries
      .map((entry) => {
        const verticalScore = query.vertical && entry.vertical === query.vertical ? 3 : 0;
        const text = [entry.title, entry.rhythmPattern, entry.applicableWhen.join(" "), entry.atoms.map((atom) => atom.name).join(" ")].join(" ").toLowerCase();
        const promptScore = normalizedPrompt
          .split(/\s+/)
          .filter(Boolean)
          .reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);

        return { entry, score: verticalScore + promptScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.entry);
  }
}

export const knowledgeStore = new KnowledgeStore();
