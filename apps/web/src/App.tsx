import { useEffect, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clapperboard,
  Cpu,
  Download,
  FileVideo2,
  Layers3,
  Loader2,
  MessageSquareText,
  PackageCheck,
  PlayCircle,
  RefreshCcw,
  ScanSearch,
  Send,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import { Player } from "@remotion/player";
import type { CreativeStrategy, RunResult, SlotMatch, StructureSlot, TimelineItem, VideoStyleTrack } from "@byteproject/shared";
import {
  MarketingFakeVideo,
  REMOTION_FAKE_VIDEO_FPS,
  REMOTION_FAKE_VIDEO_HEIGHT,
  REMOTION_FAKE_VIDEO_WIDTH,
  type FakeVideoVariant
} from "./remotion/FakeStructureVideos";

type UploadRole = "sample";
type AppScreen = "start" | "result" | "history";
type ResultTab = "demo" | "benchmark" | "structure" | "gaps" | "timeline" | "packaging" | "versions";
type UploadedVideo = { id: string; name: string; previewUrl?: string; posterUrl?: string; templateTrack?: VideoStyleTrack };
type VideoOrientation = "landscape" | "portrait" | "square" | "unknown";
type AgentTraceItem = { tool: string; ok: boolean; input: unknown; observation: unknown };
type AgentRunResult = RunResult & { agentTrace?: AgentTraceItem[]; agentMode?: "tool-calling" | "fallback" };
type AgentTurn = { id: string; prompt: string; status: "running" | "done"; startedAt: number; result?: AgentRunResult };
type HistoryEntry = {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  score: number;
  accepted: boolean;
  grade: RunResult["benchmarkScore"]["grade"];
  videoName?: string;
  result: AgentRunResult;
  turns: AgentTurn[];
};
type AgentToolStep = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  status: "pending" | "running" | "done" | "fallback";
};
type BenchmarkScoreView = RunResult["benchmarkScore"];
type BenchmarkDimensionView = BenchmarkScoreView["dimensionScores"][number];

type AppForm = {
  prompt: string;
  productName: string;
  sellingPoints: string;
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  strategy: CreativeStrategy;
  hookStyle: string;
  aspectRatio: string;
  subtitleStyle: string;
  rhythm: string;
  ctaStyle: string;
  visualStyle: string;
};

type StartValidationErrors = {
  sampleVideo?: string;
  prompt?: string;
};

type StructureSkillPreset = {
  id: string;
  name: string;
  kind: string;
  decision: string;
  detail: string;
  track: VideoStyleTrack;
  form: AppForm;
};

const resultTabs: Array<{ value: ResultTab; label: string; icon: ReactNode }> = [
  { value: "demo", label: "成片", icon: <FileVideo2 size={17} aria-hidden="true" /> },
  { value: "benchmark", label: "评分", icon: <ScanSearch size={17} aria-hidden="true" /> },
  { value: "structure", label: "结构", icon: <Layers3 size={17} aria-hidden="true" /> },
  { value: "gaps", label: "缺口", icon: <AlertTriangle size={17} aria-hidden="true" /> },
  { value: "timeline", label: "时间线", icon: <Clapperboard size={17} aria-hidden="true" /> },
  { value: "packaging", label: "包装", icon: <PackageCheck size={17} aria-hidden="true" /> },
  { value: "versions", label: "版本", icon: <Sparkles size={17} aria-hidden="true" /> }
];

const hookStyleOptions = ["痛点提问", "结果前置", "反差开场", "场景代入"];
const aspectRatioOptions = ["9:16 竖屏", "1:1 方屏", "16:9 横屏"];
const subtitleStyleOptions = ["大字重点字幕", "口播逐字字幕", "卖点卡片字幕", "少字幕更干净"];
const rhythmOptions = ["跟随样例节奏", "更快切", "更稳重", "前 3 秒加速"];
const ctaStyleOptions = ["强转化收口", "轻提示收口", "福利引导", "评论互动"];
const visualStyleOptions = ["清爽产品感", "生活方式感", "科技质感", "促销信息流"];
const MIN_PREVIEW_FRAME_COUNT = 4;
const MAX_PREVIEW_FRAME_COUNT = 16;
const SECONDS_PER_PREVIEW_FRAME = 4;
const defaultResultTab: ResultTab = "demo";
const HISTORY_STORAGE_KEY = "byteproject:migration-history";
const HISTORY_LIMIT = 20;

const defaultForm: AppForm = {
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

const structureSkillPresets: StructureSkillPreset[] = [
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
      subtitleStyle: "卖点卡片字幕",
      rhythm: "前 3 秒加速",
      ctaStyle: "强转化收口",
      visualStyle: "科技质感"
    }
  },
  {
    id: "b2b-marketing",
    name: "B端营销",
    kind: "营销类",
    decision: "痛点到咨询",
    detail: "AI 会重点分析行业痛点、能力拆解、价值证明、客户收益和咨询 CTA。",
    track: "b2b_marketing",
    form: {
      prompt:
        "把样例迁移成 B 端营销短视频：先指出业务痛点，再拆解解决方案能力，中段用数据感包装和场景证明增强可信度，最后引导咨询。素材不足时，用图文卡片、流程条、局部放大和字幕补全表达。",
      productName: "企业内容自动化平台",
      sellingPoints: "减少人工剪辑成本\n统一品牌视频模板\n自动生成脚本和时间线\n适合营销、培训、销售素材",
      targetAudience: "企业市场团队、运营负责人、内容团队",
      tone: "专业、可信、偏解决方案",
      targetDurationSec: 24,
      strategy: "high_conversion",
      hookStyle: "痛点提问",
      aspectRatio: "16:9 横屏",
      subtitleStyle: "卖点卡片字幕",
      rhythm: "更稳重",
      ctaStyle: "轻提示收口",
      visualStyle: "科技质感"
    }
  },
  {
    id: "vlog-lifestyle",
    name: "生活 Vlog",
    kind: "Vlog",
    decision: "场景代入",
    detail: "AI 会重点分析日常场景、自然转场、轻字幕、情绪递进和生活方式包装。",
    track: "vlog_lifestyle",
    form: {
      prompt:
        "把样例迁移成生活方式 Vlog：从真实场景开场，保留自然节奏，中段用几个生活片段承接卖点，结尾轻提示收藏或互动。不要做硬广，弱素材用字幕卡、场景标签和镜头重排补足。",
      productName: "便携香氛灯",
      sellingPoints: "桌面氛围更柔和\n出差也能带走\n三档亮度适合睡前\n适合卧室、书桌、酒店",
      targetAudience: "租房人群、生活方式博主、礼品消费者",
      tone: "自然、轻松、有生活感",
      targetDurationSec: 22,
      strategy: "balanced",
      hookStyle: "场景代入",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "少字幕更干净",
      rhythm: "跟随样例节奏",
      ctaStyle: "评论互动",
      visualStyle: "生活方式感"
    }
  },
  {
    id: "event-promo",
    name: "活动促销",
    kind: "营销类",
    decision: "强利益点",
    detail: "AI 会重点分析优惠前置、倒计时节奏、利益点卡片和强 CTA 收口。",
    track: "event_promo",
    form: {
      prompt:
        "把样例迁移成活动促销短视频：开头直接给利益点，中段展示商品/服务优势，加入倒计时、限时、福利卡片和明确 CTA。素材不足时，用标题条、价格/福利卡片和重复裁切补全。",
      productName: "夏季清洁套装",
      sellingPoints: "限时组合更划算\n厨房浴室都能用\n一套覆盖日常清洁\n下单前先看适用场景",
      targetAudience: "家庭用户、租房用户、囤货消费者",
      tone: "直接、紧凑、有购买理由",
      targetDurationSec: 18,
      strategy: "high_click",
      hookStyle: "结果前置",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "大字重点字幕",
      rhythm: "前 3 秒加速",
      ctaStyle: "福利引导",
      visualStyle: "促销信息流"
    }
  },
  {
    id: "tutorial-steps",
    name: "教程步骤",
    kind: "教程类",
    decision: "步骤清楚",
    detail: "AI 会重点分析操作步骤、序号字幕、关键帧说明和总结卡片。",
    track: "tutorial_steps",
    form: {
      prompt:
        "把样例迁移成教程步骤短视频：开头说明结果，中段拆成 3-5 个步骤，每步配清晰字幕和操作镜头，结尾总结注意事项。素材不足时，用序号卡片、局部放大和暂停强调补全。",
      productName: "桌面收纳套件",
      sellingPoints: "三步整理桌面\n线材不再外露\n常用物品一眼可见\n适合宿舍和办公桌",
      targetAudience: "学生、办公人群、收纳内容观众",
      tone: "清晰、实用、节奏稳定",
      targetDurationSec: 28,
      strategy: "balanced",
      hookStyle: "结果前置",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "卖点卡片字幕",
      rhythm: "更稳重",
      ctaStyle: "轻提示收口",
      visualStyle: "清爽产品感"
    }
  },
  {
    id: "premium-brand",
    name: "品牌质感",
    kind: "品牌类",
    decision: "慢节奏，高质感",
    detail: "AI 会重点分析留白、慢镜头、少字幕、品牌收束和高质感包装。",
    track: "premium_brand",
    form: {
      prompt:
        "把样例迁移成品牌质感短视频：减少信息堆叠，保留慢节奏镜头和留白，重点展示材质、场景和品牌调性。包装使用少量标题、细线标签和干净转场，不复制原片视觉元素。",
      productName: "高端便携咖啡杯",
      sellingPoints: "陶瓷内胆不串味\n金属杯身更耐用\n适合办公室与通勤\n送礼有质感",
      targetAudience: "品质消费用户、礼品消费者、咖啡爱好者",
      tone: "克制、精致、品牌感",
      targetDurationSec: 30,
      strategy: "premium",
      hookStyle: "场景代入",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "少字幕更干净",
      rhythm: "更稳重",
      ctaStyle: "轻提示收口",
      visualStyle: "清爽产品感"
    }
  },
  {
    id: "cutting-beat",
    name: "剪辑卡点",
    kind: "剪辑类",
    decision: "节拍驱动",
    detail: "AI 会重点分析音乐卡点、转场密度、速度变化、字幕节奏和情绪递进。",
    track: "cutting_beat",
    form: {
      prompt:
        "把样例迁移成剪辑卡点短视频：优先分析切点、转场、节拍、速度变化和字幕出现时机。新视频要用短镜头、卡点字幕、局部放大和节奏递进组合成完整成片。",
      productName: "运动耳机",
      sellingPoints: "佩戴稳\n低延迟\n运动防汗\n通勤运动都能用",
      targetAudience: "运动人群、数码内容观众、短视频用户",
      tone: "有冲击力、节奏强、信息明确",
      targetDurationSec: 20,
      strategy: "high_rhythm",
      hookStyle: "反差开场",
      aspectRatio: "9:16 竖屏",
      subtitleStyle: "大字重点字幕",
      rhythm: "更快切",
      ctaStyle: "强转化收口",
      visualStyle: "科技质感"
    }
  }
];

export function App() {
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [activeTab, setActiveTabState] = useState<ResultTab>(() => readResultTabFromUrl());
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sampleVideo, setSampleVideo] = useState<UploadedVideo | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [form, setForm] = useState<AppForm>(defaultForm);
  const [startValidationErrors, setStartValidationErrors] = useState<StartValidationErrors>({});
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(readHistoryEntries);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void loadDemo();
  }, []);

  useEffect(() => {
    const handlePopState = () => setActiveTabState(readResultTabFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!sampleVideo) return;
    setStartValidationErrors((current) => {
      if (!current.sampleVideo) return current;
      const next = { ...current };
      delete next.sampleVideo;
      return next;
    });
  }, [sampleVideo]);

  useEffect(() => {
    if (!form.prompt.trim()) return;
    setStartValidationErrors((current) => {
      if (!current.prompt) return current;
      const next = { ...current };
      delete next.prompt;
      return next;
    });
  }, [form.prompt]);

  const slots = result?.samples[0]?.slots ?? [];
  const matches = result?.generated.compositionPlan.slotMatches ?? [];
  const totalDuration = result?.generated.timeline.at(-1)?.endSec ?? form.targetDurationSec;
  const hasUploadedInputs = Boolean(sampleVideo?.id);

  function setActiveTab(tab: ResultTab) {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === defaultResultTab) {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function validateStartInputs() {
    const nextErrors: StartValidationErrors = {};
    if (!sampleVideo?.id) nextErrors.sampleVideo = "先上传一条样例视频。";
    if (!form.prompt.trim()) nextErrors.prompt = "写一句迁移目标，智能体才能生成新视频方向。";
    setStartValidationErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  useEffect(() => {
    return () => {
      if (sampleVideo?.previewUrl) URL.revokeObjectURL(sampleVideo.previewUrl);
    };
  }, [sampleVideo?.previewUrl]);

  async function loadDemo() {
    setIsLoading(true);
    const response = await fetch("/api/demo");
    const data = (await response.json()) as AgentRunResult;
    startTransition(() => {
      setResult(data);
      setScreen("start");
      setActiveTab(defaultResultTab);
      setIsLoading(false);
    });
  }

  async function uploadVideo(file: File, role: UploadRole) {
    const body = new FormData();
    body.append("video", file);
    const previewFrames = await extractVideoFrameDataUrls(file);
    if (previewFrames.length) body.append("previewFrames", JSON.stringify(previewFrames));
    const response = await fetch(`/api/upload/${role}`, {
      method: "POST",
      body
    });
    const data = (await response.json()) as { video: { id: string; fileName: string } };
    const uploaded = {
      id: data.video.id,
      name: data.video.fileName || file.name,
      previewUrl: URL.createObjectURL(file),
      posterUrl: previewFrames[Math.min(2, previewFrames.length - 1)]
    };
    setSampleVideo((previous) => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return uploaded;
    });
  }

  async function generate(extraInstruction?: string, options?: { requireStartInputs?: boolean }) {
    if (!result || isGenerating) return;
    if (options?.requireStartInputs && !validateStartInputs()) {
      setScreen("start");
      return;
    }
    setStartValidationErrors({});
    const visiblePrompt = (extraInstruction?.trim() || form.prompt.trim() || "请根据上传视频生成短视频方案").trim();
    const turnId = `${Date.now()}`;
    const nextTurn: AgentTurn = { id: turnId, prompt: visiblePrompt, status: "running", startedAt: Date.now() };
    const runningTurns = extraInstruction?.trim() ? [...agentTurns, nextTurn] : [nextTurn];
    const sourceVideoName = sampleVideo?.name;
    setAgentTurns(runningTurns);
    setIsGenerating(true);
    setScreen("result");
    if (!extraInstruction?.trim()) setActiveTab("demo");

    const sellingPoints = splitSellingPoints(form.sellingPoints);
    const settingPrompt = [
      `画幅：${form.aspectRatio}`,
      "SKU 与工具：由主智能体在读取上传视频和 prompt 后自动选择",
      `本地预览：渲染模型从本次视频分析出的 Remotion 方案，保持本轮证据链一致`
    ].join("\n");
    const basePrompt = `${form.prompt}\n\n视频期望参数：\n${settingPrompt}`;
    const finalPrompt = extraInstruction ? `${basePrompt}\n\n改片指令：${extraInstruction}` : basePrompt;
    const payload = {
      sampleVideoIds: [sampleVideo?.id ?? "sample-mock"],
      materialVideoId: sampleVideo?.id ?? "sample-mock",
      prompt: finalPrompt,
      productName: form.productName,
      sellingPoints,
      targetAudience: form.targetAudience,
      tone: form.tone,
      targetDurationSec: form.targetDurationSec,
      strategy: "balanced"
    };

    const [response] = await Promise.all([
      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
      delay(1800)
    ]);
    const data = (await response.json()) as AgentRunResult;

    startTransition(() => {
      const completedTurns = runningTurns.map((turn) => (turn.id === turnId ? { ...turn, status: "done" as const, result: data } : turn));
      setResult(data);
      setAgentTurns(completedTurns);
      setHistoryEntries((entries) => persistHistoryEntry(createHistoryEntry(data, visiblePrompt, sourceVideoName, completedTurns), entries));
      setScreen("result");
      setIsGenerating(false);
      setRevisionPrompt("");
    });
  }

  function exportResult() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "structure-transfer-result.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setResult(entry.result);
    setAgentTurns([historyTurnFromEntry(entry)]);
    setSampleVideo(null);
    setActiveTab(defaultResultTab);
    setRevisionPrompt("");
    setScreen("result");
  }

  function deleteHistoryEntry(entryId: string) {
    setHistoryEntries((entries) => {
      const next = entries.filter((entry) => entry.id !== entryId);
      writeHistoryEntries(next);
      return next;
    });
  }

  function clearHistoryEntries() {
    setHistoryEntries([]);
    writeHistoryEntries([]);
  }

  if (isLoading || !result) {
    return (
      <main className="loading-screen" aria-live="polite">
        <Loader2 className="spin" aria-hidden="true" />
        <span>正在载入爆款结构迁移引擎…</span>
      </main>
    );
  }

  return (
    <main className={`app-shell screen-${screen}`}>
      <WorkbenchShell
        screen={screen}
        benchmarkScore={result.benchmarkScore.totalScore}
        historyCount={historyEntries.length}
        onShowStart={() => setScreen("start")}
        onShowResult={() => setScreen("result")}
        onShowBenchmark={() => {
          setActiveTab("benchmark");
          setScreen("result");
        }}
        onShowHistory={() => setScreen("history")}
      >
        {screen === "start" ? (
          <StartScreen
            form={form}
            setForm={setForm}
            validationErrors={startValidationErrors}
            sampleVideo={sampleVideo}
            canGenerate={hasUploadedInputs && Boolean(form.prompt.trim())}
            onUpload={uploadVideo}
            onGenerate={() => generate(undefined, { requireStartInputs: true })}
            isGenerating={isGenerating}
          />
        ) : null}

        {screen === "result" ? (
          <ResultWorkspace
            result={result}
            agentTurns={agentTurns}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            totalDuration={totalDuration}
            sampleVideo={sampleVideo}
            slots={slots}
            matches={matches}
            revisionPrompt={revisionPrompt}
            setRevisionPrompt={setRevisionPrompt}
            onRegenerate={() => generate()}
            onNaturalLanguageRegenerate={() => generate(revisionPrompt)}
            onExport={exportResult}
            isGenerating={isGenerating}
          />
        ) : null}

        {screen === "history" ? (
          <HistoryWorkspace
            entries={historyEntries}
            onOpen={openHistoryEntry}
            onDelete={deleteHistoryEntry}
            onClear={clearHistoryEntries}
            onNewMigration={() => setScreen("start")}
          />
        ) : null}
      </WorkbenchShell>
    </main>
  );
}

function WorkbenchShell(props: {
  screen: AppScreen;
  benchmarkScore?: number;
  historyCount: number;
  onShowStart: () => void;
  onShowResult: () => void;
  onShowBenchmark: () => void;
  onShowHistory: () => void;
  children: ReactNode;
}) {
  const navItems = [
    { label: "控制台", icon: <Layers3 size={16} aria-hidden="true" />, active: false, onClick: props.onShowStart },
    { label: "迁移任务", icon: <Clapperboard size={16} aria-hidden="true" />, active: props.screen === "start", onClick: props.onShowStart },
    { label: "智能体日志", icon: <Cpu size={16} aria-hidden="true" />, active: props.screen === "result", onClick: props.onShowResult },
    { label: "历史记录", icon: <RefreshCcw size={16} aria-hidden="true" />, active: props.screen === "history", onClick: props.onShowHistory, badge: props.historyCount },
    { label: "评分基准", icon: <ScanSearch size={16} aria-hidden="true" />, active: false, onClick: props.onShowBenchmark },
    { label: "素材库", icon: <PackageCheck size={16} aria-hidden="true" />, active: false, onClick: props.onShowStart }
  ];
  const statusLabel = props.screen === "history" ? "历史记录" : props.screen === "result" ? "处理完成" : "新建迁移";
  return (
    <div className={`workbench-shell ${props.screen === "result" ? "processing" : "initial"}`}>
      <aside className="workbench-sidenav" aria-label="工作台导航">
        <div className="sidenav-brand">
          <div className="brand-emblem">
            <Cpu size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>爆款迁移</strong>
            <span>演示项目 v6</span>
          </div>
        </div>
        <nav className="sidenav-links">
          {navItems.map((item) => (
            <button key={item.label} type="button" className={item.active ? "active" : ""} onClick={item.onClick}>
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge}</em> : null}
            </button>
          ))}
        </nav>
        <div className="sidenav-footer">
          <a href="#">支持</a>
          <a href="#">设置</a>
          <button type="button">升级方案</button>
        </div>
      </aside>
      <div className="workbench-main">
        <header className="workbench-topnav">
          <div className="job-context">
            <span>作业 ID：MGR-8924</span>
            <strong>{statusLabel}</strong>
          </div>
          <nav>
            <button type="button" className={props.screen === "start" ? "active" : ""} onClick={props.onShowStart}>控制台</button>
            <button type="button" onClick={props.onShowResult}>项目</button>
            <button type="button" className={props.screen === "history" ? "active" : ""} onClick={props.onShowHistory}>历史</button>
            <button type="button" onClick={props.onShowBenchmark}>评分基准</button>
          </nav>
          <div className="topnav-actions">
            {props.screen === "history" ? (
              <span className="score-chip">{props.historyCount} 条历史</span>
            ) : props.screen === "result" ? (
              <span className="score-chip">{props.benchmarkScore ?? "--"}/100</span>
            ) : (
              <span className="score-chip">就绪</span>
            )}
            <button type="button">文档</button>
          </div>
        </header>
        <div className="workbench-content">{props.children}</div>
      </div>
    </div>
  );
}

function HistoryWorkspace(props: {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (entryId: string) => void;
  onClear: () => void;
  onNewMigration: () => void;
}) {
  return (
    <section className="history-shell" aria-labelledby="history-title">
      <header className="history-header">
        <div>
          <span>运行历史</span>
          <h1 id="history-title">迁移历史</h1>
          <p>每次主智能体完成生成和 benchmark 后，会保留这一轮的 prompt、分数和工具流结果。</p>
        </div>
        <div className="history-header-actions">
          <button type="button" className="secondary-button" onClick={props.onClear} disabled={!props.entries.length}>
            清空历史
          </button>
          <button type="button" className="primary-button" onClick={props.onNewMigration}>
            <Send size={17} aria-hidden="true" />
            新建迁移
          </button>
        </div>
      </header>

      {props.entries.length ? (
        <div className="history-grid" aria-label="历史记录列表">
          {props.entries.map((entry) => (
            <article key={entry.id} className={`history-card ${entry.accepted ? "accepted" : "needs-work"}`}>
              <header>
                <span>{formatHistoryTime(entry.createdAt)}</span>
                <strong>{benchmarkGradeLabel(entry.grade)}</strong>
              </header>
              <h2>{entry.title}</h2>
              <p>{entry.prompt}</p>
              <div className="history-meta">
                <span>{entry.videoName ?? entry.result.samples[0]?.video.fileName ?? "参考视频"}</span>
                <span>{historyDuration(entry.result)} 秒</span>
                <span>{entry.result.generated.timeline.length} 段</span>
              </div>
              <div className="history-score">
                <div>
                  <strong>{entry.score}</strong>
                  <span>/100</span>
                </div>
                <i style={{ "--score": `${Math.max(0, Math.min(100, entry.score))}%` } as CSSProperties} />
              </div>
              <div className="history-card-actions">
                <button type="button" className="primary-button" onClick={() => props.onOpen(entry)}>
                  打开结果
                </button>
                <button type="button" className="secondary-button" onClick={() => props.onDelete(entry.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <div className="agent-ready-icon" aria-hidden="true">
            <RefreshCcw size={34} />
          </div>
          <h2>还没有迁移历史</h2>
          <p>完成一次生成后，这里会出现可恢复的结果记录。</p>
          <button type="button" className="primary-button" onClick={props.onNewMigration}>
            去新建迁移
          </button>
        </div>
      )}
    </section>
  );
}

function StartScreen(props: {
  form: AppForm;
  setForm: (form: AppForm) => void;
  validationErrors: StartValidationErrors;
  sampleVideo: UploadedVideo | null;
  canGenerate: boolean;
  onUpload: (file: File, role: UploadRole) => Promise<void>;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="start-screen" aria-labelledby="start-title">
      <div className="studio-shell">
        <header className="studio-topbar">
          <div className="brand-block">
            <span className="product-mark">AI 创作工作台</span>
            <h1 id="start-title">爆款结构迁移引擎</h1>
          </div>
        </header>

        <div className="workflow-rail" aria-label="创作流程">
          <WorkflowStep index={1} label="上传视频" state={props.sampleVideo ? "done" : "active"} />
          <WorkflowStep index={2} label="抽帧拆解" state={props.sampleVideo ? "active" : "idle"} />
          <WorkflowStep index={3} label="迁移方法" state={props.sampleVideo ? "active" : "idle"} />
          <WorkflowStep index={4} label="生成方案" state={props.canGenerate ? "active" : "idle"} />
        </div>

        <div className="studio-workspace">
          <section className={`workspace-panel input-panel ${props.sampleVideo ? "has-video" : ""}`} aria-label="素材输入区">
            <SectionHeading eyebrow="参考素材" title="新建迁移" note="定义结构分析所需的输入参数。" />
            <div className="upload-list">
              <UploadAction role="sample" label="上传视频" hint="选择视频文件" video={props.sampleVideo} onFile={props.onUpload} error={props.validationErrors.sampleVideo} />
            </div>
            <div className="video-preview-grid">
              <VideoPreview
                title="视频预览"
                video={props.sampleVideo}
                emptyText="放入视频后预览"
                hints={["建议 10-60 秒", "中等抽帧 4-16 张"]}
              />
              <div className="frame-insight-card">
                <span className="mini-label">分析状态</span>
                <strong>{props.sampleVideo ? "已上传，AI 可开始分析视频结构。" : "上传后可开始分析视频结构。"}</strong>
                <details className="inline-disclosure">
                  <summary>查看将分析的内容</summary>
                  <ul>
                    <li>开头钩子</li>
                    <li>镜头节奏</li>
                    <li>字幕结构</li>
                    <li>画面包装</li>
                    <li>转场与 BGM 节点</li>
                  </ul>
                </details>
              </div>
            </div>
            <div className="input-status-strip" aria-live="polite">
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "视频已就绪" : "先放入视频"}</span>
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "可开始抽帧拆解" : "准备读帧"}</span>
            </div>
            {!props.sampleVideo ? (
              <div className="analysis-only-note">
                <strong>先给我一条视频</strong>
                <span>视频进来后我先读画面、节奏和字幕证据，再决定 SKU 和工具链。</span>
              </div>
            ) : null}
            <form
              className="agent-start-form migration-start-form"
              onSubmit={(event) => {
                event.preventDefault();
                props.onGenerate();
              }}
            >
              <SettingsPanel form={props.form} setForm={props.setForm} errors={props.validationErrors} />
              <GenerationControls form={props.form} setForm={props.setForm} />
              <button type="submit" className="start-button" aria-label="发送给主智能体" disabled={props.isGenerating || !props.canGenerate}>
                {props.isGenerating ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                发送给主智能体
              </button>
            </form>
          </section>

          <aside className="workspace-panel start-agent-panel" aria-label="智能体对话流">
            <StartAgentPanel
              sampleVideo={props.sampleVideo}
              canGenerate={props.canGenerate}
            />
          </aside>
        </div>
      </div>
    </section>
  );
}

function StartAgentPanel(props: { sampleVideo: UploadedVideo | null; canGenerate: boolean }) {
  return (
    <section className="video-agent-panel start-agent-flow" aria-label="主智能体对话流">
      <header className="agent-panel-header">
        <div className="agent-orb" aria-hidden="true">
          <Cpu size={17} />
        </div>
        <div>
          <span>主智能体</span>
          <strong>Doubao-Seed 2.0 Lite 工具流</strong>
        </div>
      </header>

      <div className="agent-ready-state">
        <div className="agent-ready-icon" aria-hidden="true">
          <Sparkles size={34} />
        </div>
        <h2>智能体就绪</h2>
        <div className="agent-ready-bubble">
          <p>
            {props.sampleVideo
              ? props.canGenerate
                ? "视频和迁移目标都齐了。点击发送后，我会读取视觉证据、节奏和字幕线索，再决定 SKU 和工具链。"
                : "视频已经放进来。再补一句迁移目标，我就能判断结构路线。"
              : "先把视频放进来。我会分析视觉证据、节奏和字幕线索，再判断 SKU 与工具链。"}
          </p>
        </div>
        <div className="agent-ready-signals" aria-label="智能体输入信号">
          <div>
            <ScanSearch size={18} aria-hidden="true" />
            <span>视觉</span>
          </div>
          <div>
            <MessageSquareText size={18} aria-hidden="true" />
            <span>字幕</span>
          </div>
          <div>
            <Clapperboard size={18} aria-hidden="true" />
            <span>节奏</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading(props: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="section-heading">
      <span>{props.eyebrow}</span>
      <div>
        <strong>{props.title}</strong>
        {props.note ? <p>{props.note}</p> : null}
      </div>
    </div>
  );
}

function WorkflowStep(props: { index: number; label: string; state: "done" | "active" | "idle" }) {
  return (
    <div className={`workflow-step ${props.state}`}>
      <span>{props.state === "done" ? <CheckCircle2 size={16} aria-hidden="true" /> : props.index}</span>
      <strong>{props.label}</strong>
    </div>
  );
}

function TemplateVideoLibrary(props: { onSelect: (preset: StructureSkillPreset) => void }) {
  return (
    <section className="template-video-library" aria-label="本地示例视频库">
      <div className="template-library-head">
        <span>没有本地视频？</span>
        <strong>选择一条示例素材进入上传流程</strong>
      </div>
      <div className="skill-preset-deck template-video-deck">
      {structureSkillPresets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.detail}
          data-tooltip={preset.detail}
          onClick={() => props.onSelect(preset)}
        >
          <TemplateSamplePlayer preset={preset} />
          <span>{preset.kind}</span>
          <strong>{preset.name}</strong>
          <small>{preset.decision} · 点击使用</small>
        </button>
      ))}
      </div>
    </section>
  );
}

function TemplateSamplePlayer(props: { preset: StructureSkillPreset }) {
  const points = splitSellingPoints(props.preset.form.sellingPoints);
  return (
    <div className="template-sample-player" aria-hidden="true">
      <Player
        component={MarketingFakeVideo}
        durationInFrames={Math.max(1, Math.round(Math.min(60, props.preset.form.targetDurationSec) * REMOTION_FAKE_VIDEO_FPS))}
        fps={REMOTION_FAKE_VIDEO_FPS}
        compositionWidth={REMOTION_FAKE_VIDEO_WIDTH}
        compositionHeight={REMOTION_FAKE_VIDEO_HEIGHT}
        inputProps={{
          productName: props.preset.form.productName,
          points,
          audience: props.preset.form.targetAudience,
          variant: props.preset.track as FakeVideoVariant
        }}
        loop
        autoPlay
        initialFrame={36}
        initiallyMuted
        style={{ width: "100%" }}
      />
    </div>
  );
}

function SettingsPanel(props: { form: AppForm; setForm: (form: AppForm) => void; errors?: StartValidationErrors }) {
  const { form, setForm } = props;
  const promptError = props.errors?.prompt;
  return (
    <div className="settings-stack">
      <label className="prompt-composer" htmlFor="targetPrompt">
        <span>你想把这个视频结构迁移成什么？</span>
        <textarea
          id="targetPrompt"
          name="targetPrompt"
          autoComplete="off"
          aria-invalid={Boolean(promptError)}
          aria-describedby={promptError ? "targetPrompt-error" : undefined}
          placeholder="例如：把这个机器人飞行视频，改成一条适合智能穿戴新品发布的短视频。"
          value={form.prompt}
          onChange={(event) => setForm({ ...form, prompt: event.target.value })}
        />
        {promptError ? <p id="targetPrompt-error" className="field-error" role="alert">{promptError}</p> : null}
      </label>

      <details className="brief-details">
        <summary>补充商品信息（可选）</summary>
        <div className="brief-grid">
          <label className="field" htmlFor="productName">
            <span>商品名</span>
            <input
              id="productName"
              name="productName"
              autoComplete="off"
              placeholder="例如：新品投影装置"
              value={form.productName}
              onChange={(event) => setForm({ ...form, productName: event.target.value })}
            />
          </label>
          <label className="field" htmlFor="targetAudience">
            <span>目标人群</span>
            <input
              id="targetAudience"
              name="targetAudience"
              autoComplete="off"
              placeholder="例如：科技新品观众"
              value={form.targetAudience}
              onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}
            />
          </label>
          <label className="field wide compact" htmlFor="tone">
            <span>包装语气</span>
            <input id="tone" name="tone" autoComplete="off" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} />
          </label>
          <label className="field wide compact" htmlFor="sellingPoints">
            <span>卖点顺序</span>
            <textarea
              id="sellingPoints"
              name="sellingPoints"
              autoComplete="off"
              placeholder={"每行一个卖点\n例如：空间感强\n产品亮相明确\n适合发布会开场"}
              value={form.sellingPoints}
              onChange={(event) => setForm({ ...form, sellingPoints: event.target.value })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}

function GenerationControls(props: { form: AppForm; setForm: (form: AppForm) => void }) {
  const { form, setForm } = props;
  return (
    <div className="generation-stack">
      <label className="field compact" htmlFor="targetDurationSec">
        <span>目标时长</span>
        <input
          id="targetDurationSec"
          name="targetDurationSec"
          type="number"
          inputMode="numeric"
          min={10}
          max={60}
          autoComplete="off"
          value={form.targetDurationSec}
          onChange={(event) => setForm({ ...form, targetDurationSec: Number(event.target.value) })}
        />
      </label>

      <OptionChips label="画幅" value={form.aspectRatio} options={aspectRatioOptions} onChange={(value) => setForm({ ...form, aspectRatio: value })} />

      <details className="advanced-settings">
        <summary>只保留分析约束</summary>
        <div className="advanced-stack">
          <p className="analysis-only-copy">开头、字幕、节奏、包装和 CTA 都由上传视频的抽帧分析与模型结构槽位决定，这里不提供固定预设。</p>
        </div>
      </details>
    </div>
  );
}

function OptionChips(props: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="option-row">
      <span>{props.label}</span>
      <div className="option-chips" role="radiogroup" aria-label={props.label}>
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={props.value === option ? "active" : ""}
            role="radio"
            aria-checked={props.value === option}
            onClick={() => props.onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadAction(props: { role: UploadRole; label: string; hint: string; video: UploadedVideo | null; onFile: (file: File, role: UploadRole) => Promise<void>; error?: string }) {
  const [busy, setBusy] = useState(false);
  const inputId = `${props.role}-video`;
  const errorId = `${inputId}-error`;
  return (
    <div className="upload-field">
      <label className="upload-action" htmlFor={inputId}>
        <input
          id={inputId}
          name={inputId}
          type="file"
          accept="video/*"
          aria-invalid={Boolean(props.error)}
          aria-describedby={props.error ? errorId : undefined}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            await props.onFile(file, props.role);
            setBusy(false);
          }}
        />
        <span className="upload-action-icon">{busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}</span>
        <span>
          <strong>{props.label}</strong>
          <small>{busy ? "上传分析中…" : props.video?.name ?? props.hint}</small>
        </span>
      </label>
      {props.error ? <p id={errorId} className="field-error" role="alert">{props.error}</p> : null}
    </div>
  );
}

function VideoPreview(props: { title: string; video: UploadedVideo | null; emptyText: string; hints: string[] }) {
  return (
    <article className={`video-preview ${props.video ? "has-video" : ""}`}>
      <div className="preview-title">
        <FileVideo2 size={16} aria-hidden="true" />
        <span>{props.title}</span>
      </div>
      {props.video?.templateTrack ? (
        <TemplatePreviewPlayer video={props.video} />
      ) : hasPreviewUrl(props.video) ? (
        <AdaptiveVideoPlayer video={props.video} title={props.title} variant="inline" />
      ) : (
        <div className="preview-empty">
          <PlayCircle size={26} aria-hidden="true" />
          <strong>{props.emptyText}</strong>
          <ul>
            {props.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      )}
      {props.video ? <p>{props.video.name}</p> : null}
    </article>
  );
}

function TemplatePreviewPlayer(props: { video: UploadedVideo }) {
  return (
    <div className="template-preview-frame">
      <Player
        component={MarketingFakeVideo}
        durationInFrames={Math.round(18 * REMOTION_FAKE_VIDEO_FPS)}
        fps={REMOTION_FAKE_VIDEO_FPS}
        compositionWidth={REMOTION_FAKE_VIDEO_WIDTH}
        compositionHeight={REMOTION_FAKE_VIDEO_HEIGHT}
        inputProps={{
          productName: props.video.name.replace(" 本地示例", ""),
          points: ["本地示例素材", "可直接进入智能体流", "生成 MP4 草稿"],
          audience: "参赛演示",
          variant: props.video.templateTrack as FakeVideoVariant
        }}
        controls
        loop
        initialFrame={36}
        initiallyMuted
        showVolumeControls={false}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function ResultWorkspace(props: {
  result: AgentRunResult;
  agentTurns: AgentTurn[];
  activeTab: ResultTab;
  setActiveTab: (tab: ResultTab) => void;
  totalDuration: number;
  sampleVideo: UploadedVideo | null;
  slots: StructureSlot[];
  matches: SlotMatch[];
  revisionPrompt: string;
  setRevisionPrompt: (value: string) => void;
  onRegenerate: () => void;
  onNaturalLanguageRegenerate: () => void;
  onExport: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="result-shell" aria-labelledby="result-title">
      <header className="result-header">
        <div>
          <h1 id="result-title">爆款结构迁移结果</h1>
        </div>
        <div className="result-actions">
          <button type="button" className="secondary-button" onClick={props.onRegenerate} disabled={props.isGenerating}>
            <RefreshCcw size={17} aria-hidden="true" />
            重新生成
          </button>
          <button type="button" className="primary-button" onClick={props.onExport}>
            <Download size={17} aria-hidden="true" />
            导出结果
          </button>
        </div>
      </header>

      <div className="result-layout">
        <nav className="result-nav" aria-label="结果导航">
          {resultTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={props.activeTab === tab.value ? "active" : ""}
              aria-current={props.activeTab === tab.value ? "page" : undefined}
              onClick={() => props.setActiveTab(tab.value)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <section className="result-stage" aria-label="结果内容">
          {props.activeTab === "demo" ? (
            <DemoPanel result={props.result} totalDuration={props.totalDuration} sampleVideo={props.sampleVideo} setActiveTab={props.setActiveTab} />
          ) : null}
          {props.activeTab === "benchmark" ? <BenchmarkPanel result={props.result} /> : null}
          {props.activeTab === "structure" ? <StructureMapping result={props.result} matches={props.matches} /> : null}
          {props.activeTab === "gaps" ? <GapDiagnosis slots={props.slots} matches={props.matches} /> : null}
          {props.activeTab === "timeline" ? <TimelineEditor items={props.result.generated.timeline} slots={props.slots} /> : null}
          {props.activeTab === "packaging" ? <PackagingPanel result={props.result} /> : null}
          {props.activeTab === "versions" ? <VersionCards result={props.result} /> : null}
        </section>

        <aside className="preview-aside agent-aside">
          <VideoAgentPanel
            result={props.result}
            turns={props.agentTurns}
            sampleVideo={props.sampleVideo}
            value={props.revisionPrompt}
            setValue={props.setRevisionPrompt}
            onSubmit={props.onNaturalLanguageRegenerate}
            disabled={props.isGenerating || !props.revisionPrompt.trim()}
          />
        </aside>
      </div>
    </section>
  );
}

function BenchmarkPanel(props: { result: RunResult }) {
  const score = props.result.benchmarkScore;
  const weakestDimension = weakestBenchmarkDimension(score);
  return (
    <section className="benchmark-panel" aria-labelledby="benchmark-title">
      <PanelTitle icon={<ScanSearch size={19} aria-hidden="true" />} title="基准评分" note="" id="benchmark-title" />
      <div className={`benchmark-summary ${score.accepted ? "accepted" : "needs-work"}`}>
        <strong>{score.totalScore}</strong>
        <span>/ 100</span>
        <p>{benchmarkSummaryLabel(score, weakestDimension)}</p>
      </div>

      {score.hardFailures.length ? (
        <div className="benchmark-hard-failures">
          {score.hardFailures.map((failure) => (
            <article key={failure.code}>
              <strong>{hardFailureTitle(failure.code)}</strong>
              <p>{agentReadableText(failure.reason)}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="benchmark-dimensions">
        {score.dimensionScores.map((dimension) => (
          <article key={dimension.id}>
            <header>
              <strong>{dimension.label}</strong>
              <span>
                {dimension.score}/{dimension.maxScore}
              </span>
            </header>
            <p>{agentReadableText(dimension.evidence[0] ?? dimension.fixInstruction)}</p>
            {dimension.deductions[0] ? <small>{agentReadableText(dimension.deductions[0])}</small> : null}
          </article>
        ))}
      </div>

      {score.topFixes.length ? (
        <div className="benchmark-fixes">
          <strong>{score.accepted ? "保留的强项" : `我下一轮先改${weakestDimension ? `：${weakestDimension.label}` : ""}`}</strong>
          <ul>
            {score.topFixes.map((fix) => (
              <li key={fix}>{agentReadableText(fix)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function DemoPanel(props: { result: RunResult; totalDuration: number; sampleVideo: UploadedVideo | null; setActiveTab: (tab: ResultTab) => void }) {
  const generatedVideoUrl = props.result.generated.demo.url?.endsWith(".mp4") ? props.result.generated.demo.url : undefined;

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <div className="demo-video">
        {generatedVideoUrl ? (
          <article className="generated-video-card">
            <header>
              <strong>自动生成视频</strong>
              <span>{props.result.generated.demo.note}</span>
            </header>
            <video src={generatedVideoUrl} controls playsInline preload="metadata" />
          </article>
        ) : null}
        {props.sampleVideo ? (
          <div className="source-video-grid">
            <SourceVideoCard title="上传视频回放" note="AI 已从这条视频抽帧拆解结构、节奏、字幕、包装与卡点方式" video={props.sampleVideo} />
          </div>
        ) : null}
      </div>
      <div className="demo-explain">
        <h2 id="demo-title">{generatedVideoUrl ? "已生成自动化视频草稿" : `已生成 ${props.totalDuration} 秒结构化预览`}</h2>
        <div className="demo-buttons">
          <button type="button" onClick={() => props.setActiveTab("benchmark")}>
            <ScanSearch size={16} aria-hidden="true" />
            <span>查看 benchmark</span>
          </button>
          <button type="button" onClick={() => props.setActiveTab("structure")}>
            <Layers3 size={16} aria-hidden="true" />
            <span>查看结构迁移</span>
          </button>
          <button type="button" onClick={() => props.setActiveTab("gaps")}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>查看素材缺口</span>
          </button>
          <button type="button" onClick={() => props.setActiveTab("timeline")}>
            <Clapperboard size={16} aria-hidden="true" />
            <span>编辑时间线</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function SourceVideoCard(props: { title: string; note: string; video: UploadedVideo }) {
  return (
    <article className="source-video-card">
      <header>
        <strong>{props.title}</strong>
        <span>{props.note}</span>
      </header>
      {props.video.templateTrack ? <TemplatePreviewPlayer video={props.video} /> : hasPreviewUrl(props.video) ? <AdaptiveVideoPlayer video={props.video} title={props.title} variant="stage" /> : null}
      <p>{props.video.name}</p>
    </article>
  );
}

function AdaptiveVideoPlayer(props: { video: UploadedVideo & { previewUrl: string }; title: string; variant: "stage" | "aside" | "inline" }) {
  const [orientation, setOrientation] = useState<VideoOrientation>("unknown");
  const [aspectRatio, setAspectRatio] = useState("16 / 9");

  return (
    <div className={`adaptive-video-frame ${props.variant} ${orientation}`} style={{ "--video-aspect": aspectRatio } as CSSProperties}>
      <video
        className="adaptive-video"
        src={props.video.previewUrl}
        poster={props.video.posterUrl}
        controls
        muted
        playsInline
        preload="metadata"
        aria-label={`${props.title}：${props.video.name}`}
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget;
          if (!videoWidth || !videoHeight) return;
          setAspectRatio(`${videoWidth} / ${videoHeight}`);
          if (Math.abs(videoWidth - videoHeight) < 2) {
            setOrientation("square");
          } else {
            setOrientation(videoWidth > videoHeight ? "landscape" : "portrait");
          }
        }}
      />
    </div>
  );
}

function hasPreviewUrl(video: UploadedVideo | null | undefined): video is UploadedVideo & { previewUrl: string } {
  return Boolean(video?.previewUrl);
}

function VideoAgentPanel(props: {
  result: AgentRunResult;
  turns: AgentTurn[];
  sampleVideo: UploadedVideo | null;
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const hasRunningTurn = props.turns.some((turn) => turn.status === "running");
  const [agentClock, setAgentClock] = useState(Date.now());

  useEffect(() => {
    if (!hasRunningTurn) return undefined;
    const timer = window.setInterval(() => setAgentClock(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, [hasRunningTurn]);

  const fallbackTurn: AgentTurn = {
    id: props.result.generated.id,
    prompt: firstBriefLine(props.result.source.prompt),
    status: "done",
    startedAt: Date.now(),
    result: props.result
  };
  const turns = props.turns.length ? props.turns : [fallbackTurn];

  return (
    <section className="video-agent-panel" aria-label="视频智能体对话">
      <header className="agent-panel-header">
        <div className="agent-orb" aria-hidden="true">
          <Cpu size={17} />
        </div>
        <div>
          <span>迁移智能体</span>
          <strong>智能体执行日志</strong>
        </div>
      </header>

      <div className="agent-thread" aria-live="polite">
        {turns.map((turn, index) => {
          const isLatestTurn = index === turns.length - 1;
          const turnResult = turn.result ?? (index === turns.length - 1 && turn.status === "done" ? props.result : undefined);
          const liveIndex = currentLiveAgentStepIndex(turn.startedAt, agentClock);
          const steps = turnResult ? buildDynamicResultAgentSteps(turnResult, props.sampleVideo) : buildDynamicLiveAgentSteps(liveIndex, props.sampleVideo);
          const activeStep = currentAgentToolStep(steps);
          const visibleSteps = visibleAgentToolSteps(steps, Boolean(turnResult));
          return (
            <div className="agent-turn" key={turn.id}>
              <div className="chat-row user">
                <div className="agent-bubble user-bubble">
                  <span>用户</span>
                  <p>{turn.prompt}</p>
                </div>
              </div>
              <div className="chat-row ai">
                <div className="agent-avatar" aria-hidden="true">
                  <Bot size={16} />
                </div>
                <div className="agent-bubble ai-bubble">
                  <span>视频智能体</span>
                  <p className="agent-dynamic-intro">{agentTurnIntro(turn, activeStep, turnResult)}</p>
                </div>
              </div>
              {isLatestTurn ? (
                <div className="agent-tool-stack">
                  {visibleSteps.map((step) => (
                    <AgentToolCall key={step.id} step={step} />
                  ))}
                </div>
              ) : null}
              {turnResult ? (
                <div className="chat-row ai">
                  <div className="agent-avatar" aria-hidden="true">
                    <Sparkles size={16} />
                  </div>
                  <div className="agent-bubble ai-bubble final">
                    <span>结果</span>
                    <p>{agentResultSummary(turnResult)}</p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <form
        className="agent-compose"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <label htmlFor="revisionPrompt">继续对话</label>
        <div>
          <input
            id="revisionPrompt"
            name="revisionPrompt"
            autoComplete="off"
            value={props.value}
            onChange={(event) => props.setValue(event.target.value)}
            placeholder="让开头更抓人 / 卖点提前 / 减少字幕 / 强化卡点..."
          />
          <button type="submit" disabled={props.disabled} aria-label="发送给视频智能体">
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}

function AgentToolCall(props: { step: AgentToolStep }) {
  const icon =
    props.step.status === "running" ? (
      <Loader2 className="spin" size={15} aria-hidden="true" />
    ) : props.step.status === "fallback" ? (
      <AlertTriangle size={15} aria-hidden="true" />
    ) : props.step.status === "done" ? (
      <CheckCircle2 size={15} aria-hidden="true" />
    ) : (
      <ScanSearch size={15} aria-hidden="true" />
    );

  return (
    <article className={`agent-tool-call ${props.step.status}`}>
      <div className="agent-tool-icon">{icon}</div>
      <div>
        <header>
          <strong>{props.step.title}</strong>
          {props.step.meta ? <span>{toolMetaLabel(props.step.meta)}</span> : null}
        </header>
        <p>{props.step.detail}</p>
      </div>
    </article>
  );
}

function toolMetaLabel(meta: string) {
  const labels: Record<string, string> = {
    input: "输入",
    agent: "智能体",
    compose: "生成",
    score: "评分",
    frames: "关键帧",
    model: "模型",
    plan: "方案",
    render: "渲染",
    result: "结果",
    pass: "通过",
    fail: "未通过",
    needs_iteration: "待迭代",
    excellent: "优秀",
    mp4: "MP4",
    blocked: "受阻",
    draft: "草稿",
    fallback: "兜底",
    vision: "视觉",
    structure: "结构",
    "frame tool": "抽帧",
    "gap plan": "缺口",
    "preview ready": "预览就绪"
  };
  return labels[meta] ?? meta;
}

function currentAgentToolStep(steps: AgentToolStep[]): AgentToolStep {
  return (
    steps.find((step) => step.status === "running") ??
    steps
      .slice()
      .reverse()
      .find((step) => step.status !== "pending") ??
    steps[0] ?? {
      id: "idle",
      title: "准备工具调用",
      detail: "视频进来后开始分析。",
      meta: "idle",
      status: "pending"
    }
  );
}

function currentLiveAgentStepIndex(startedAt: number, now: number) {
  const elapsed = Math.max(0, now - startedAt);
  const thresholds = [0, 1200, 3200, 5600, 8200, 11000, 13200];
  let index = 0;
  for (const [candidate, threshold] of thresholds.entries()) {
    if (elapsed >= threshold) index = candidate;
  }
  return Math.min(index, thresholds.length - 1);
}

function visibleAgentToolSteps(steps: AgentToolStep[], isDone: boolean) {
  const visible = steps.filter((step) => step.status !== "pending");
  if (isDone) return visible.length ? visible : steps.slice(0, 1);
  return visible.slice(-3);
}

function agentTurnIntro(turn: AgentTurn, activeStep: AgentToolStep, result?: AgentRunResult) {
  if (result) return agentBenchmarkVerdict(result);
  if (turn.status === "running") return `我在处理「${activeStep.title}」：${activeStep.detail}`;
  return "我会沿着上一轮的结构判断继续改。";
}

function agentBenchmarkVerdict(result: AgentRunResult) {
  const score = result.benchmarkScore;
  const weakest = weakestBenchmarkDimension(score);
  const strongest = strongestBenchmarkDimension(score);
  if (result.generated.demo.status === "failed") {
    return `这轮卡在成片阶段，我会先看${hardFailureTitle(score.hardFailures[0]?.code)}，再决定怎么重新进渲染。`;
  }
  if (score.accepted) {
    return `我看完成片抽帧了，这版能收${strongest ? `，强项在${strongest.label}` : ""}。下面是证据链。`;
  }
  return `我看完成片抽帧了，这版先打回。分数主要被${weakest?.label ?? "结构完整度"}拉低，下面是我的判断链。`;
}

function benchmarkSummaryLabel(score: BenchmarkScoreView, weakest?: BenchmarkDimensionView) {
  if (score.accepted) return "这版可以收，进入最终输出";
  if (score.hardFailures.length) return `这版先打回，${hardFailureTitle(score.hardFailures[0].code)}要先处理`;
  if (score.totalScore < score.threshold.regenerateBelow) return `这版先打回，短板在${weakest?.label ?? "结构完整度"}`;
  return `能跑，但我会继续压${weakest?.label ?? "最弱维度"}`;
}

function weakestBenchmarkDimension(score: BenchmarkScoreView) {
  return score.dimensionScores
    .slice()
    .sort((left, right) => left.score / left.maxScore - right.score / right.maxScore || left.score - right.score)[0];
}

function strongestBenchmarkDimension(score: BenchmarkScoreView) {
  return score.dimensionScores
    .slice()
    .sort((left, right) => right.score / right.maxScore - left.score / left.maxScore || right.score - left.score)[0];
}

function hardFailureTitle(code?: string) {
  const labels: Record<string, string> = {
    missing_real_slots: "结构证据不够",
    empty_preview: "成片证据不够",
    copied_sample_content: "迁移边界过近",
    brief_mismatch: "用户目标没吃透",
    sensitive_leak: "敏感信息风险"
  };
  return labels[code ?? ""] ?? "关键阻塞";
}

function compactAgentText(value?: string) {
  return agentReadableText(value)
    .replace(/^建议/, "")
    .replace(/[。.]$/, "")
    .trim();
}

function agentReadableText(value?: string) {
  if (!value) return "";
  return value
    .replace(/模型制作规范失败，本轮不会使用本地规则假生成视频。?/g, "我需要先拿到可执行制作规范，再进入渲染。")
    .replace(/没有真实分析结果时不会补预设结构。?/g, "先等结构证据回来，再画映射。")
    .replace(/这里不会用默认缺口卡片占位。?/g, "slotMatches 回来后再列缺口。")
    .replace(/不会用 Hook\/商品展示等默认轨道占位。?/g, "timeline 回来后再画轨道。")
    .replace(/不会补大字标题条、卖点卡片等默认建议。?/g, "包装建议会跟随样例分析生成。")
    .replace(/不会展示高点击\/高转化等固定预设。?/g, "版本会从本次模型方案派生。")
    .trim();
}

function StructureMapping(props: { result: RunResult; matches: SlotMatch[] }) {
  const sampleSlots = props.result.samples[0]?.slots ?? [];
  const timelineBySlot = new Map(props.result.generated.timeline.map((item) => [item.slotId, item]));
  const rows = sampleSlots
    .map((slot) => ({ slot, timeline: timelineBySlot.get(slot.id), match: props.matches.find((item) => item.slotId === slot.id) }))
    .filter((row) => row.timeline);

  if (!rows.length) {
    return <EmptyResultState title="结构映射还在路上" detail="我会先拿到结构槽位和 timeline，再把样例方法映射到新视频。" />;
  }

  return (
    <section className="mapping-panel" aria-labelledby="mapping-title">
      <PanelTitle icon={<Layers3 size={18} aria-hidden="true" />} title="结构迁移映射" note="迁移创作方法，而不是复制样例内容。" id="mapping-title" />
      <div className="mapping-table">
        <div className="mapping-head">
          <span>样例结构</span>
          <span>新视频结构</span>
          <span>状态</span>
        </div>
        {rows.map(({ slot, timeline, match }) => {
          return (
            <div className="mapping-row" key={slot.id}>
              <div>
                <strong>{timeRange(timeline)} {slotDisplayName(slot)}</strong>
                <p>{shortIntent(slot.intent)}</p>
              </div>
              <ArrowRight className="mapping-arrow" size={18} aria-hidden="true" />
              <div>
                <strong>{timeline?.caption ?? shortIntent(slot.intent)}</strong>
                <p>{timeline?.packaging[0] ?? slot.packagingHints[0] ?? "包装待生成"}</p>
              </div>
              <StatusPill match={match} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GapDiagnosis(props: { slots: StructureSlot[]; matches: SlotMatch[] }) {
  const supported = props.matches.filter((item) => item.status === "matched").length;
  const gaps = props.matches.filter((item) => item.status !== "matched");
  const visibleGaps = gaps;

  if (!props.matches.length) {
    return <EmptyResultState title="素材诊断还在路上" detail="slotMatches 回来后，我会按槽位判断哪些画面够用、哪些要用文案或包装补强。" />;
  }

  if (!visibleGaps.length) {
    return <EmptyResultState title="本次没有识别到素材缺口" detail={`模型返回的 ${props.matches.length} 个槽位都已匹配素材。`} />;
  }

  return (
    <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
      <PanelTitle icon={<AlertTriangle size={18} aria-hidden="true" />} title="素材诊断" note={`当前素材可支撑：${supported} / ${props.matches.length} 个结构槽位`} id="diagnosis-title" />
      <div className="diagnosis-list">
        {visibleGaps.map((match, index) => {
          const slot = props.slots.find((item) => item.id === match.slotId);
          return (
            <article className="diagnosis-card" key={match.slotId}>
              <span>缺口 {index + 1}</span>
              <h3>{gapTitle(slot, match)}</h3>
              <p>
                <strong>影响：</strong>
                {match.reason}
              </p>
              <p>
                <strong>处理：</strong>
                {match.gapPlan?.output ?? "使用字幕、标题条和素材裁切重组补足表达。"}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TimelineEditor(props: { items: TimelineItem[]; slots: StructureSlot[] }) {
  const total = props.items.at(-1)?.endSec ?? 18;
  const slotById = new Map(props.slots.map((slot) => [slot.id, slot]));

  if (!props.items.length) {
    return <EmptyResultState title="编辑时间线还在路上" detail="拿到可执行 timeline 后，我会把镜头、字幕、包装和音频节奏拆成轨道。" />;
  }

  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <PanelTitle icon={<Clapperboard size={18} aria-hidden="true" />} title="编辑时间线" note="轻量展示镜头、字幕、包装、音频四条轨道。" id="timeline-title" />
      <div className="light-timeline" style={{ "--timeline-total": total } as CSSProperties}>
        <TimelineTrack total={total} label="镜头轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: slotById.get(item.slotId) ? slotDisplayName(slotById.get(item.slotId)!) : item.caption }))} />
        <TimelineTrack total={total} label="字幕轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.caption }))} />
        <TimelineTrack total={total} label="包装轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.packaging[0] ?? "" }))} />
        <TimelineTrack total={total} label="音频轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.beatHint ?? "" }))} />
      </div>
    </section>
  );
}

function TimelineTrack(props: { total: number; label: string; items: Array<{ id: string; start: number; end: number; text: string }> }) {
  return (
    <div className="light-track">
      <span className="track-name">{props.label}</span>
      <div className="track-lane">
        {props.items.map((item) => (
          <span
            key={item.id}
            className="track-item"
            style={{
              left: `${(item.start / props.total) * 100}%`,
              width: `${Math.max(((item.end - item.start) / props.total) * 100, 10)}%`
            }}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function PackagingPanel(props: { result: RunResult }) {
  if (!props.result.generated.packagingSuggestions.length) {
    return <EmptyResultState title="包装建议还在路上" detail="我会基于样例的字幕密度、卖点推进和画面节奏生成包装指令。" />;
  }
  const suggestions = props.result.generated.packagingSuggestions;
  return (
    <section className="packaging-panel" aria-labelledby="packaging-title">
      <PanelTitle icon={<PackageCheck size={18} aria-hidden="true" />} title="包装建议" note="用于补足表达，不替代视频主体。" id="packaging-title" />
      <div className="packaging-grid">
        {suggestions.map((item, index) => (
          <article key={item}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{item}</h3>
            <p>结合当前槽位的字幕密度、卖点推进和结尾 CTA 使用。</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function VersionCards(props: { result: RunResult }) {
  const variants = props.result.generated.previewVariants;
  if (!variants.length) {
    return <EmptyResultState title="模型派生版本还在路上" detail="等本次方案稳定后，我会从同一套结构里拆出可比较的版本。" />;
  }
  return (
    <section className="versions-panel" aria-labelledby="versions-title">
      <PanelTitle icon={<Sparkles size={18} aria-hidden="true" />} title="模型派生版本" note="只展示本次分析返回的可渲染版本。" id="versions-title" />
      <div className="version-grid">
        {variants.map((item) => (
          <article key={item.id} className="active">
            <h3>{item.title}</h3>
            <p>{item.description || item.promptHint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PhonePreview(props: { result: RunResult; sampleVideo: UploadedVideo | null }) {
  return (
    <section className="phone-preview" aria-label="手机预览">
      {props.sampleVideo?.templateTrack ? (
        <TemplatePreviewPlayer video={props.sampleVideo} />
      ) : hasPreviewUrl(props.sampleVideo) ? (
        <AdaptiveVideoPlayer video={props.sampleVideo} title="侧栏预览" variant="aside" />
      ) : (
        <div className="phone-remotion-player">
          <Player
            component={MarketingFakeVideo}
            durationInFrames={Math.round(Math.min(60, props.result.source.targetDurationSec || 18) * REMOTION_FAKE_VIDEO_FPS)}
            fps={REMOTION_FAKE_VIDEO_FPS}
            compositionWidth={REMOTION_FAKE_VIDEO_WIDTH}
            compositionHeight={REMOTION_FAKE_VIDEO_HEIGHT}
            inputProps={{
              variant: props.result.generated.previewVariants?.[0]?.track ?? "ecommerce_burst",
              productName: props.result.source.productName,
              points: props.result.source.sellingPoints,
              audience: props.result.source.targetAudience
            }}
            loop
            autoPlay
            initialFrame={36}
            initiallyMuted
            style={{ width: "100%" }}
          />
        </div>
      )}
      <p>{props.sampleVideo ? "右侧保留上传素材回放；成片区只展示模型分析派生的预览。" : "右侧为 Remotion 竖屏预览；后续可接入服务端 MP4 渲染。"}</p>
    </section>
  );
}

function NaturalLanguageBar(props: { value: string; setValue: (value: string) => void; onSubmit: () => void; disabled: boolean }) {
  return (
    <form
      className="nl-bar"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <span className="nl-label">
        <MessageSquareText size={17} aria-hidden="true" />
        <label htmlFor="standaloneRevisionPrompt">告诉 AI 你想怎么改：</label>
      </span>
      <input
        id="standaloneRevisionPrompt"
        name="standaloneRevisionPrompt"
        autoComplete="off"
        value={props.value}
        onChange={(event) => props.setValue(event.target.value)}
        placeholder="开头更抓人一些 / 把商品卖点提前 / 减少字幕，增强节奏感..."
      />
      <button type="submit" disabled={props.disabled} aria-label="按自然语言指令重新生成">
        <Send size={17} aria-hidden="true" />
        重新生成
      </button>
    </form>
  );
}

function PanelTitle(props: { icon: ReactNode; title: string; note: string; id: string }) {
  return (
    <div className="panel-title">
      <span>{props.icon}</span>
      <div>
        <h2 id={props.id}>{props.title}</h2>
      </div>
    </div>
  );
}

function EmptyResultState(props: { title: string; detail: string }) {
  return (
    <section className="empty-result-state" aria-live="polite">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <h2>{props.title}</h2>
        <p>{props.detail}</p>
      </div>
    </section>
  );
}

function StatusPill(props: { match?: SlotMatch }) {
  const status = props.match?.status ?? "missing";
  return <span className={`status-pill ${status}`}>{statusLabel(status, props.match?.gapPlan?.strategy)}</span>;
}

function publicRationale(value?: string) {
  if (!value) return undefined;
  if (/模型增强|Ark request|AuthenticationError|API key|401/i.test(value)) {
    return "已根据样例结构生成新的短视频草案，并完成镜头节奏、字幕包装和素材缺口补全。";
  }
  if (value.includes("Ark/Doubao") || value.includes("已完成在线模型创意增强")) {
    return "已完成在线创意增强，并根据样例结构生成新的短视频草案。";
  }
  return value
    .replace(/（model:\s*[^）]+）/gi, "")
    .replace(/\(model:\s*[^)]+\)/gi, "")
    .trim();
}

function buildStartAgentSteps(sampleVideo: UploadedVideo | null, canGenerate: boolean): AgentToolStep[] {
  const uploaded = Boolean(sampleVideo);
  const ready = uploaded && canGenerate;
  return [
    {
      id: "upload",
      title: uploaded ? "视频已进入智能体" : "先放入视频",
      detail: uploaded ? `我会先读 ${sampleVideo?.name} 的画面结构，再选择 SKU。` : "给我视频和目标后，我再判断该走哪组 SKU 与工具。",
      meta: "input",
      status: uploaded ? "done" : "pending"
    },
    {
      id: "sku",
      title: "主智能体判断路线",
      detail: ready
        ? "视频和目标都齐了；点击发送后，Doubao-Seed 2.0 Lite 再选择结构迁移、首尾帧/意图分析、拼接或评分工具。"
        : "Doubao-Seed 2.0 Lite 会结合视频证据和 prompt，决定要用结构迁移、首尾帧/意图分析、拼接还是评分工具。",
      meta: "agent",
      status: "pending"
    },
    {
      id: "render",
      title: "生成并拼接视频草稿",
      detail: "生成时间线、首尾帧意图、包装层和 Remotion/FFmpeg 成片草稿。",
      meta: "compose",
      status: "pending"
    },
    {
      id: "benchmark",
      title: "抽帧基准评分",
      detail: "成片后抽帧做结构化评分；分数低就产出 revisionBrief，分数够就输出最终结果。",
      meta: "score",
      status: "pending"
    }
  ];
}

function buildLiveAgentSteps(currentIndex: number, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const liveDetails = [
    {
      id: "ingest",
      title: "接收视频与 Brief",
      detail: sampleVideo ? `我先读 ${sampleVideo.name} 的画面和 Brief，再进入抽帧。` : "视频放入后进入工具链。",
      meta: "input"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: "从视频时间轴中采样关键帧，用于识别开头钩子、镜头节奏、字幕和包装层。",
      meta: "frame tool"
    },
    {
      id: "sd2lite",
      title: "请求 Doubao-Seed 视觉分析 API",
      detail: "把关键帧、视频元数据和用户 Brief 发送给视觉理解链路；失败时会降级成本地结构规则。",
      meta: "vision"
    },
    {
      id: "structure",
      title: "提取可迁移结构",
      detail: "拆出 Hook / Body / Proof / Offer / CTA，并把字幕、节奏、转场和卡点抽象成创作方法。",
      meta: "structure"
    },
    {
      id: "gaps",
      title: "诊断素材缺口",
      detail: "评估当前视频能支撑哪些结构槽位，缺口会用重排、文案、包装、复用或 AIGC 补全。",
      meta: "gap plan"
    },
    {
      id: "compose",
      title: "生成短视频方案",
      detail: "输出脚本、分镜、时间线、包装建议和可继续对话修改的方案。",
      meta: "compose"
    }
  ];

  return liveDetails.map((step, index) => ({
    ...step,
    status: index < currentIndex ? "done" : index === currentIndex ? "running" : "pending"
  }));
}

function buildDynamicLiveAgentSteps(currentIndex: number, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const liveDetails = [
    {
      id: "ingest",
      title: "读视频与目标",
      detail: sampleVideo ? `我先看 ${sampleVideo.name} 的画面、时长和目标，再决定怎么拆。` : "视频放进来后，我会先读画面证据。",
      meta: "input"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: "我在沿时间轴采样关键帧，用来判断开头、节奏、字幕密度和包装方式。",
      meta: "frames"
    },
    {
      id: "vision",
      title: "让模型拆结构",
      detail: "把关键帧、视频元数据和本轮指令交给模型，拆出可迁移的制作方法。",
      meta: "model"
    },
    {
      id: "plan",
      title: "把结构改写成方案",
      detail: "我会把 slotMatches、timeline、分镜、字幕、包装和预期效果合成可执行规范。",
      meta: "plan"
    },
    {
      id: "render",
      title: "渲染成片草稿",
      detail: "按制作规范截取、重排、拼接并写出 MP4 草稿。",
      meta: "render"
    },
    {
      id: "benchmark",
      title: "抽帧基准评分",
      detail: "成片草稿会被抽帧分析；我会根据分数决定收片还是返工。",
      meta: "score"
    },
    {
      id: "result",
      title: "整理本轮判断",
      detail: "把工具 trace、成片状态和 benchmark 短板合成下一步结论。",
      meta: "result"
    }
  ];

  return liveDetails.map((step, index) => ({
    ...step,
    status: index < currentIndex ? "done" : index === currentIndex ? "running" : "pending"
  }));
}

function buildDynamicResultAgentSteps(result: AgentRunResult, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const sample = result.samples[0];
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const frameCount = sample?.video.previewFrameCount ?? sample?.video.previewFrameDataUrls?.length ?? traceFrameCount(result.agentTrace) ?? 0;
  const visibleVideoName = sampleVideo?.name ?? sample?.video.fileName ?? "上传视频";
  const visionTrace = result.agentTrace?.find((item) => item.tool === "vision_model" || item.tool === "analyze_sample_video");
  const planTrace = result.agentTrace?.find((item) => item.tool === "model_plan_composer" || item.tool === "compose_video_plan");
  const rendered = result.generated.demo.status === "rendered";
  const failed = result.generated.demo.status === "failed";
  const score = result.benchmarkScore;
  const weakestDimension = weakestBenchmarkDimension(score);
  const benchmarkFix = compactAgentText(score.revisionBrief?.failedDimensions[0]?.instruction ?? score.topFixes[0]);

  return [
    {
      id: "ingest",
      title: "读片和目标",
      detail: `${visibleVideoName} · ${Math.round(sample?.video.durationSec ?? duration)}s · ${sample?.video.width ?? "-"}x${sample?.video.height ?? "-"}`,
      meta: "input",
      status: "done"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: frameCount > 0 ? `抽了 ${frameCount} 张关键帧，用来判断画面结构、节奏和包装密度。` : "已拿到视频元数据，关键帧证据会继续补进分析。",
      meta: "frames",
      status: "done"
    },
    {
      id: "vision",
      title: "拆样例结构",
      detail: visionTrace?.ok ? "模型拆出了样例的镜头节奏、字幕密度和结构槽位。" : agentReadableText(traceFailureText(visionTrace, "模型视觉理解还没给到可用结构。")),
      meta: "model",
      status: visionTrace?.ok ? "done" : "fallback"
    },
    {
      id: "plan",
      title: "生成制作方案",
      detail: planTrace?.ok
        ? `我拿到 ${result.generated.timeline.length} 个时间线片段和 ${result.generated.compositionPlan.slotMatches.length} 个槽位匹配，开始组织成片。`
        : agentReadableText(traceFailureText(planTrace, "模型还没给到可执行制作规范。")),
      meta: "plan",
      status: planTrace?.ok ? "done" : "fallback"
    },
    {
      id: "render",
      title: rendered ? "渲染成片草稿" : "成片草稿受阻",
      detail: rendered
        ? result.generated.demo.note
        : failed
          ? "制作规范还不够可执行，我会先补齐渲染需要的镜头和包装指令。"
          : "我在整理可渲染的制作规范。",
      meta: rendered ? "mp4" : "blocked",
      status: rendered ? "done" : "fallback"
    },
    {
      id: "benchmark",
      title: score.accepted ? "基准评分收片" : "基准评分打回",
      detail: score.accepted
        ? `总分 ${score.totalScore}/100，我会保留这版并输出结果。`
        : `总分 ${score.totalScore}/100，短板是${weakestDimension?.label ?? "结构完整度"}${benchmarkFix ? `；下一轮先改：${benchmarkFix}。` : "。"}`,
      meta: score.accepted ? "pass" : score.grade,
      status: score.accepted ? "done" : "fallback"
    }
  ];
}

function buildResultAgentSteps(result: AgentRunResult, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const sample = result.samples[0];
  const frameCount = sample?.video.previewFrameCount ?? sample?.video.previewFrameDataUrls?.length ?? traceFrameCount(result.agentTrace) ?? 0;
  const totalSlots = result.generated.compositionPlan.slotMatches.length;
  const matchedSlots = result.generated.compositionPlan.slotMatches.filter((match) => match.status === "matched").length;
  const fallbackVision = hasFallbackVision(result);
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const visibleVideoName = sampleVideo?.name ?? sample?.video.fileName ?? "上传视频";
  const traceMode = result.agentMode === "tool-calling" ? "agent" : "fallback";

  return [
    {
      id: "ingest",
      title: "接收视频与 Brief",
      detail: `${visibleVideoName} · ${Math.round(sample?.video.durationSec ?? duration)}s · ${sample?.video.width ?? "-"}×${sample?.video.height ?? "-"}`,
      meta: "input",
      status: "done"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: frameCount > 0 ? `已抽取 ${frameCount} 张关键帧进入分析链路。` : "已接收视频元数据；未拿到可展示的关键帧计数。",
      meta: "frame tool",
      status: "done"
    },
    {
      id: "sd2lite",
      title: "请求 Doubao-Seed 视觉分析 API",
      detail: fallbackVision
        ? "在线视觉模型没有返回可用结构，已使用抽帧、元数据和 Brief 切换到本地结构规则。"
        : "视觉模型已返回结构结果，并合并到样例拆解中。",
      meta: traceMode,
      status: fallbackVision ? "fallback" : "done"
    },
    {
      id: "structure",
      title: "提取可迁移结构",
      detail: sample?.summary ?? "已提取 Hook / Body / Proof / Offer / CTA 结构槽位。",
      meta: `${sample?.slots.length ?? 0} slots`,
      status: "done"
    },
    {
      id: "gaps",
      title: "诊断素材缺口",
      detail: `当前视频支撑 ${matchedSlots} / ${totalSlots} 个槽位；其余槽位已生成补全策略。`,
      meta: "gap plan",
      status: "done"
    },
    {
      id: "compose",
      title: "生成短视频方案",
      detail: `已生成 ${duration} 秒时间线、${result.generated.storyboard.length} 个分镜和 ${result.generated.packagingSuggestions.length} 条包装建议。`,
      meta: result.generated.demo.status === "rendered" ? "preview ready" : "draft",
      status: "done"
    }
  ];
}

function hasFallbackVision(result: AgentRunResult) {
  const visionTrace = result.agentTrace?.find((item) => item.tool === "vision_model" || item.tool === "analyze_sample_video");
  if (visionTrace) return !visionTrace.ok || String(JSON.stringify(visionTrace.observation)).includes("fallback");
  return result.generated.compositionPlan.rationale.some((item) => item.includes("在线模型") || item.includes("本地结构规则"));
}

function traceFrameCount(trace: AgentTraceItem[] | undefined) {
  if (!trace?.length) return undefined;
  for (const item of trace) {
    const observation = item.observation;
    if (!observation || typeof observation !== "object") continue;
    const direct = (observation as { frameCount?: unknown }).frameCount;
    if (typeof direct === "number") return direct;
    const model = (observation as { model?: { frameCount?: unknown } }).model;
    if (typeof model?.frameCount === "number") return model.frameCount;
  }
  return undefined;
}

function traceFailureText(trace: AgentTraceItem | undefined, fallback: string) {
  if (!trace) return fallback;
  const observation = trace.observation;
  if (observation && typeof observation === "object") {
    const directError = (observation as { error?: unknown }).error;
    if (typeof directError === "string" && directError.trim()) return directError;
    const status = (observation as { status?: unknown }).status;
    if (typeof status === "string" && status.trim()) return `${fallback} 状态：${status}`;
  }
  return fallback;
}

function agentResultSummary(result: AgentRunResult) {
  const score = result.benchmarkScore;
  const weakest = weakestBenchmarkDimension(score);
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const slotCount = result.generated.compositionPlan.slotMatches.length;
  if (result.generated.demo.status === "failed") {
    return `这轮先不交付：基准评分 ${score.totalScore}/100，成片规范没有撑住渲染。我会先补齐${hardFailureTitle(score.hardFailures[0]?.code)}和可执行 timeline。`;
  }
  if (score.accepted) {
    return `这版可以交付：${duration} 秒、${slotCount} 个结构槽位，基准评分 ${score.totalScore}/100。我会输出当前成片和结构拆解。`;
  }
  const fix = compactAgentText(score.revisionBrief?.failedDimensions[0]?.instruction ?? score.topFixes[0]);
  const rationale = publicRationale(result.generated.compositionPlan.rationale[0]);
  return `这版先不收：${duration} 秒草稿，基准评分 ${score.totalScore}/100，最弱的是${weakest?.label ?? "结构完整度"}。${rationale ? `${rationale} ` : ""}下一轮先改${fix ? `：${fix}` : "开头、卖点推进和节奏"}。`;
}

function firstBriefLine(value: string) {
  return (value.split("\n\n视频期望参数")[0] || value || "请根据上传视频生成短视频方案").trim();
}

function createHistoryEntry(result: AgentRunResult, prompt: string, videoName: string | undefined, turns: AgentTurn[]): HistoryEntry {
  const createdAt = Date.now();
  const historyResult = compactRunResultForHistory(result);
  const visiblePrompt = compactAgentText(firstBriefLine(prompt));
  const score = historyResult.benchmarkScore;
  return {
    id: `${createdAt}-${score.candidateId}`,
    title: historyTitle(historyResult, visiblePrompt),
    prompt: visiblePrompt,
    createdAt,
    score: score.totalScore,
    accepted: score.accepted,
    grade: score.grade,
    videoName,
    result: historyResult,
    turns: turns.slice(-3).map((turn) => ({ id: turn.id, prompt: turn.prompt, status: "done", startedAt: turn.startedAt }))
  };
}

function persistHistoryEntry(entry: HistoryEntry, entries: HistoryEntry[]) {
  const next = [entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
  writeHistoryEntries(next);
  return next;
}

function readHistoryEntries(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryEntry)
      .map((entry) => ({ ...entry, turns: Array.isArray(entry.turns) ? entry.turns : [] }))
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeHistoryEntries(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.prompt === "string" &&
    typeof entry.createdAt === "number" &&
    typeof entry.score === "number" &&
    typeof entry.accepted === "boolean" &&
    Boolean(entry.result && typeof entry.result === "object" && "benchmarkScore" in entry.result)
  );
}

function compactRunResultForHistory(result: AgentRunResult): AgentRunResult {
  return {
    ...result,
    samples: result.samples.map((sample) => ({
      ...sample,
      video: {
        ...sample.video,
        previewFrameCount: sample.video.previewFrameCount ?? sample.video.previewFrameDataUrls?.length,
        previewFrameDataUrls: undefined
      }
    })),
    material: {
      ...result.material,
      video: {
        ...result.material.video,
        previewFrameCount: result.material.video.previewFrameCount ?? result.material.video.previewFrameDataUrls?.length,
        previewFrameDataUrls: undefined
      }
    },
    agentTrace: result.agentTrace?.map((trace) => ({
      ...trace,
      input: compactTracePayload(trace.input),
      observation: compactTracePayload(trace.observation)
    }))
  };
}

function compactTracePayload(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[省略深层数据]";
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || value.length > 900) return "[省略大字段]";
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compactTracePayload(item, depth + 1));
  if (value && typeof value === "object") {
    const compacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      compacted[key] =
        lowerKey.includes("dataurl") || lowerKey.includes("frameimage") || lowerKey.includes("base64")
          ? "[省略帧数据]"
          : compactTracePayload(item, depth + 1);
    }
    return compacted;
  }
  return value;
}

function historyTurnFromEntry(entry: HistoryEntry): AgentTurn {
  return {
    id: entry.id,
    prompt: entry.prompt,
    status: "done",
    startedAt: entry.createdAt,
    result: entry.result
  };
}

function historyTitle(result: AgentRunResult, prompt: string) {
  const productName = result.source.productName.trim();
  if (productName) return `${productName} 迁移方案`;
  return prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt;
}

function benchmarkGradeLabel(grade: RunResult["benchmarkScore"]["grade"]) {
  const labels: Record<RunResult["benchmarkScore"]["grade"], string> = {
    excellent: "优秀",
    pass: "通过",
    needs_iteration: "需迭代",
    fail: "失败"
  };
  return labels[grade];
}

function formatHistoryTime(timestamp: number) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  } catch {
    return "刚刚";
  }
}

function historyDuration(result: AgentRunResult) {
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  return Math.round(duration);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function extractVideoFrameDataUrls(file: File) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 18;
    const frameCount = frameSampleCountForDuration(duration);
    const width = Math.max(1, video.videoWidth || 480);
    const height = Math.max(1, video.videoHeight || 854);
    const scale = Math.min(480 / width, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return [];

    const frames: string[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(Math.max(duration - 0.05, 0), Math.max(0, (duration * (index + 0.5)) / frameCount));
      video.currentTime = time;
      await waitForVideoEvent(video, "seeked");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.74));
    }
    return frames;
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function frameSampleCountForDuration(durationSec: number) {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 18;
  return Math.max(MIN_PREVIEW_FRAME_COUNT, Math.min(MAX_PREVIEW_FRAME_COUNT, Math.ceil(safeDuration / SECONDS_PER_PREVIEW_FRAME)));
}

function readResultTabFromUrl(): ResultTab {
  if (typeof window === "undefined") return defaultResultTab;
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  return isResultTab(requestedTab) ? requestedTab : defaultResultTab;
}

function isResultTab(value: string | null): value is ResultTab {
  return resultTabs.some((tab) => tab.value === value);
}

function splitSellingPoints(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 5000);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Video failed before ${eventName}`));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function segmentLabel(segment: StructureSlot["segment"]) {
  return {
    hook: "痛点提问",
    body: "功能展示",
    proof: "使用证明",
    offer: "利益点",
    cta: "CTA 收口"
  }[segment];
}

function slotDisplayName(slot: StructureSlot) {
  const intent = shortIntent(slot.intent);
  if (intent) return intent;
  const packaging = slot.packagingHints[0] ? shortIntent(slot.packagingHints[0]) : "";
  return packaging || segmentLabel(slot.segment);
}

function segmentLabelFromSlotId(slotId: string) {
  if (slotId.includes("hook")) return "Hook";
  if (slotId.includes("proof")) return "使用证明";
  if (slotId.includes("offer")) return "利益点";
  if (slotId.includes("cta")) return "CTA";
  return "商品展示";
}

function statusLabel(status: SlotMatch["status"], strategy?: NonNullable<SlotMatch["gapPlan"]>["strategy"]) {
  if (status === "matched") return "素材充足";
  if (strategy === "copy") return "文案补全";
  if (strategy === "packaging") return "包装补全";
  if (strategy === "aigc") return "需要 AIGC";
  if (strategy === "reuse") return "素材复用";
  return status === "weak_match" ? "弱匹配" : "需要补全";
}

function shortIntent(intent: string) {
  return intent.split(/[，。:：]/)[0] || intent;
}

function timeRange(item?: TimelineItem) {
  if (!item) return "0-0s";
  return `${item.startSec}-${item.endSec}s`;
}

function gapTitle(slot: StructureSlot | undefined, match: SlotMatch) {
  if (!slot) return "缺少可用结构槽位";
  if (slot.segment === "hook") return "缺少开头吸引镜头";
  if (slot.requiredAssetTypes.includes("product_closeup")) return "缺少商品特写镜头";
  if (slot.requiredAssetTypes.includes("usage")) return "缺少使用过程镜头";
  if (slot.segment === "cta") return "缺少 CTA 镜头";
  return match.status === "weak_match" ? "素材表达力度不足" : "缺少关键支撑素材";
}
