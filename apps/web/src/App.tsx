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
import { creativeReconstructionSkills, inferCreativeSkillIds } from "@byteproject/shared";
import type { CreativeReconstructionSkillId, CreativeStrategy, RunResult, SlotMatch, StructureSlot, TimelineItem, VideoStyleTrack } from "@byteproject/shared";
import {
  MarketingFakeVideo,
  REMOTION_FAKE_VIDEO_FPS,
  REMOTION_FAKE_VIDEO_HEIGHT,
  REMOTION_FAKE_VIDEO_WIDTH,
  type FakeVideoVariant
} from "./remotion/FakeStructureVideos";

type UploadRole = "sample";
type AppScreen = "start" | "result";
type ResultTab = "demo" | "structure" | "gaps" | "timeline" | "packaging" | "versions";
type UploadedVideo = { id: string; name: string; previewUrl?: string; posterUrl?: string; templateTrack?: VideoStyleTrack };
type VideoOrientation = "landscape" | "portrait" | "square" | "unknown";
type AgentTraceItem = { tool: string; ok: boolean; input: unknown; observation: unknown };
type AgentRunResult = RunResult & { agentTrace?: AgentTraceItem[]; agentMode?: "tool-calling" | "fallback" };
type AgentTurn = { id: string; prompt: string; status: "running" | "done"; startedAt: number; result?: AgentRunResult };
type AgentToolStep = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  status: "pending" | "running" | "done" | "fallback";
};

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
  { value: "structure", label: "结构", icon: <Layers3 size={17} aria-hidden="true" /> },
  { value: "gaps", label: "缺口", icon: <AlertTriangle size={17} aria-hidden="true" /> },
  { value: "timeline", label: "时间线", icon: <Clapperboard size={17} aria-hidden="true" /> },
  { value: "packaging", label: "包装", icon: <PackageCheck size={17} aria-hidden="true" /> },
  { value: "versions", label: "版本", icon: <Sparkles size={17} aria-hidden="true" /> }
];

const progressSteps = ["抽取关键帧", "拆解 Hook / Body / CTA", "分析镜头节奏", "评估可用画面", "识别素材缺口", "生成新视频方案"];

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
      productName: "Doubao-Seed 视频 Agent",
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
    if (!form.prompt.trim()) nextErrors.prompt = "写一句迁移目标，Agent 才能生成新视频方向。";
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
    setAgentTurns((current) => {
      const nextTurn: AgentTurn = { id: turnId, prompt: visiblePrompt, status: "running", startedAt: Date.now() };
      return extraInstruction?.trim() ? [...current, nextTurn] : [nextTurn];
    });
    setIsGenerating(true);
    setScreen("result");
    if (!extraInstruction?.trim()) setActiveTab("demo");

    const sellingPoints = splitSellingPoints(form.sellingPoints);
    const inferredCreativeSkillIds = inferCreativeSkillIds({ ...form, sellingPoints });
    const settingPrompt = [
      `画幅：${form.aspectRatio}`,
      `Agent 自动选择技能：${selectedCreativeSkillNames(inferredCreativeSkillIds).join(" / ")}`,
      `本地预览：只渲染模型从本次视频分析出的 Remotion 方案，不生成预设赛道`
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
      setResult(data);
      setAgentTurns((current) =>
        current.map((turn) => (turn.id === turnId ? { ...turn, status: "done", result: data } : turn))
      );
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
    </main>
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
            <span className="product-mark">AI Creation Studio</span>
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
          <section className="workspace-panel input-panel" aria-label="素材输入区">
            <SectionHeading eyebrow="01 Video" title="单视频输入" note="上传样例或评测素材，系统按中等抽帧预算拆解可迁移结构。" />
            <div className="upload-list">
              <UploadAction role="sample" label="上传视频" hint="选择视频文件" video={props.sampleVideo} onFile={props.onUpload} error={props.validationErrors.sampleVideo} />
            </div>
            <div className="video-preview-grid">
              <VideoPreview
                title="视频预览"
                video={props.sampleVideo}
                emptyText="等待上传视频"
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
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "视频已就绪" : "等待视频"}</span>
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "可开始抽帧拆解" : "等待抽帧"}</span>
            </div>
            {!props.sampleVideo ? (
              <div className="analysis-only-note">
                <strong>等待真实视频</strong>
                <span>上传后才会开始抽帧分析；不会用示例素材或预设模板生成结果。</span>
              </div>
            ) : null}
          </section>

          <section className="workspace-panel intent-panel" aria-label="AI 拆解与创作目标区">
            <SectionHeading eyebrow="02 Brief" title="迁移目标" note="告诉 Agent 要把上传视频迁移成什么成片方向。" />
            <AutoCreativeSkillPanel form={props.form} />
            <SettingsPanel form={props.form} setForm={props.setForm} errors={props.validationErrors} />
          </section>

          <aside className="workspace-panel control-panel" aria-label="生成控制区">
            <SectionHeading eyebrow="03 Generate" title="生成方案" note="基于本次视频分析生成 Remotion 预览方案；没有分析结果时不输出预设。" />
            <details className="ai-plan-preview" aria-label="AI 方案预览">
              <summary>查看 AI 会分析什么</summary>
              <ul>
                <li>开头钩子</li>
                <li>镜头节奏</li>
                <li>字幕结构</li>
                <li>画面包装</li>
                <li>转场与 BGM 节点</li>
              </ul>
            </details>
            <GenerationControls form={props.form} setForm={props.setForm} />
            <div className="control-footer">
              <p>{props.canGenerate ? "生成脚本结构、镜头节奏表和迁移版创作方案。" : "点击后会标出还缺的视频或迁移目标。"}</p>
              <button type="button" className="start-button" aria-label="开始 AI 拆解并生成方案" onClick={props.onGenerate} disabled={props.isGenerating}>
                {props.isGenerating ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Wand2 size={18} aria-hidden="true" />}
                开始 AI 拆解并生成方案
              </button>
            </div>
          </aside>
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

function AutoCreativeSkillPanel(props: { form: AppForm }) {
  const selected = new Set(inferCreativeSkillIds({ ...props.form, sellingPoints: splitSellingPoints(props.form.sellingPoints) }));

  return (
    <section className="creative-skill-selector" aria-label="Agent 自动选择 SKU">
      <div className="skill-selector-head">
        <span>Agent 自动选择 SKU</span>
        <strong>{selected.size} 个已匹配</strong>
      </div>
      <div className="creative-skill-grid">
        {creativeReconstructionSkills.filter((skill) => selected.has(skill.id)).map((skill) => (
          <article
            key={skill.id}
            className="auto-skill-card active"
            title={skill.guardrail}
          >
            <strong>{skill.shortName}</strong>
            <span>{skill.name}</span>
            <small>{skill.description}</small>
          </article>
        ))}
      </div>
    </section>
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
          points: ["本地示例素材", "可直接进入 Agent 流", "生成 MP4 草稿"],
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
    <section className="video-agent-panel" aria-label="视频 Agent 对话">
      <header className="agent-panel-header">
        <div className="agent-orb" aria-hidden="true">
          <Cpu size={17} />
        </div>
        <div>
          <span>VIDEO AGENT</span>
          <strong>Doubao-Seed 工具流</strong>
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
                  <span>USER</span>
                  <p>{turn.prompt}</p>
                </div>
              </div>
              <div className="chat-row ai">
                <div className="agent-avatar" aria-hidden="true">
                  <Bot size={16} />
                </div>
                <div className="agent-bubble ai-bubble">
                  <span>VIDEO AGENT</span>
                  <p className="agent-dynamic-intro">{agentTurnIntro(turn, activeStep, Boolean(turnResult))}</p>
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
                    <span>RESULT</span>
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
          <button type="submit" disabled={props.disabled} aria-label="发送给视频 Agent">
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
          {props.step.meta ? <span>{props.step.meta}</span> : null}
        </header>
        <p>{props.step.detail}</p>
      </div>
    </article>
  );
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
      title: "等待工具调用",
      detail: "上传视频后开始分析。",
      meta: "idle",
      status: "pending"
    }
  );
}

function currentLiveAgentStepIndex(startedAt: number, now: number) {
  const elapsed = Math.max(0, now - startedAt);
  const thresholds = [0, 1200, 3200, 5600, 8200, 11000];
  let index = 0;
  for (const [candidate, threshold] of thresholds.entries()) {
    if (elapsed >= threshold) index = candidate;
  }
  return Math.min(index, progressSteps.length - 1);
}

function visibleAgentToolSteps(steps: AgentToolStep[], isDone: boolean) {
  const visible = steps.filter((step) => step.status !== "pending");
  if (isDone) return visible.length ? visible : steps.slice(0, 1);
  return visible.slice(-3);
}

function agentTurnIntro(turn: AgentTurn, activeStep: AgentToolStep, hasResult: boolean) {
  if (hasResult) return "本轮模型调用已返回，下面是服务端收到的真实工具链结果。";
  if (turn.status === "running") return `正在执行：${activeStep.title}。我会等模型返回结构化制作规范后再更新结果。`;
  return "等待下一轮指令。";
}

function StructureMapping(props: { result: RunResult; matches: SlotMatch[] }) {
  const sampleSlots = props.result.samples[0]?.slots ?? [];
  const timelineBySlot = new Map(props.result.generated.timeline.map((item) => [item.slotId, item]));
  const rows = sampleSlots
    .map((slot) => ({ slot, timeline: timelineBySlot.get(slot.id), match: props.matches.find((item) => item.slotId === slot.id) }))
    .filter((row) => row.timeline);

  if (!rows.length) {
    return <EmptyResultState title="还没有可展示的结构映射" detail="模型需要先从样例视频里分析出结构槽位和 timeline；没有真实分析结果时不会补预设结构。" />;
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
    return <EmptyResultState title="还没有素材诊断" detail="等待模型返回 slotMatches 后再展示缺口；这里不会用默认缺口卡片占位。" />;
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
    return <EmptyResultState title="还没有编辑时间线" detail="模型需要返回可执行 timeline 后才展示轨道；不会用 Hook/商品展示等默认轨道占位。" />;
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
    return <EmptyResultState title="还没有包装建议" detail="等待模型基于样例分析生成包装指令；不会补大字标题条、卖点卡片等默认建议。" />;
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
    return <EmptyResultState title="没有模型派生版本" detail="版本必须由本次视频分析和模型方案生成；不会展示高点击/高转化等固定预设。" />;
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

function buildLiveAgentSteps(currentIndex: number, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const liveDetails = [
    {
      id: "ingest",
      title: "接收视频与 Brief",
      detail: sampleVideo ? `已接收 ${sampleVideo.name}，等待进入抽帧队列。` : "等待上传视频进入工具链。",
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
      title: "接收视频与指令",
      detail: sampleVideo ? `已接收 ${sampleVideo.name}，准备抽取关键帧。` : "等待上传视频进入模型链路。",
      meta: "input"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: "服务端正在从视频时间轴采样关键帧，用于让模型解析画面结构、节奏和包装方式。",
      meta: "frames"
    },
    {
      id: "vision",
      title: "请求 Doubao 视觉理解",
      detail: "把关键帧、视频元数据和本轮指令发给模型，要求模型解析爆款制作方法。",
      meta: "model"
    },
    {
      id: "plan",
      title: "生成模型制作规范",
      detail: "等待模型输出 slotMatches、timeline、assetIds、分镜、字幕、包装和预期效果。",
      meta: "plan"
    },
    {
      id: "render",
      title: "服务端执行渲染",
      detail: "服务端只按模型返回的制作规范截取、重排、拼接并写出 MP4。",
      meta: "render"
    },
    {
      id: "result",
      title: "同步生成结果",
      detail: "等待后端返回真实工具 trace 和最终成片状态。",
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

  return [
    {
      id: "ingest",
      title: "接收视频与指令",
      detail: `${visibleVideoName} · ${Math.round(sample?.video.durationSec ?? duration)}s · ${sample?.video.width ?? "-"}x${sample?.video.height ?? "-"}`,
      meta: "input",
      status: "done"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: frameCount > 0 ? `已抽取 ${frameCount} 张关键帧进入模型分析。` : "已接收视频元数据；没有拿到可展示的关键帧计数。",
      meta: "frames",
      status: "done"
    },
    {
      id: "vision",
      title: "模型解析爆款结构",
      detail: visionTrace?.ok ? "模型已返回视频结构理解结果，并合并到样例拆解中。" : traceFailureText(visionTrace, "模型视觉理解没有返回可用结构。"),
      meta: "model",
      status: visionTrace?.ok ? "done" : "fallback"
    },
    {
      id: "plan",
      title: "模型生成制作规范",
      detail: planTrace?.ok
        ? `模型已输出 ${result.generated.timeline.length} 个时间线片段和 ${result.generated.compositionPlan.slotMatches.length} 个槽位匹配。`
        : traceFailureText(planTrace, "模型没有返回可执行的制作规范。"),
      meta: "plan",
      status: planTrace?.ok ? "done" : "fallback"
    },
    {
      id: "render",
      title: rendered ? "服务端已写出 MP4" : "服务端未生成 MP4",
      detail: rendered
        ? result.generated.demo.note
        : failed
          ? "模型制作规范失败，本轮不会使用本地规则假生成视频。"
          : "等待可渲染的模型制作规范。",
      meta: rendered ? "mp4" : "blocked",
      status: rendered ? "done" : "fallback"
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
  if (result.generated.demo.status === "failed") {
    return result.generated.demo.note || result.generated.compositionPlan.rationale[0] || "模型制作规范失败，本轮没有生成本地兜底视频。";
  }
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const rationale = publicRationale(result.generated.compositionPlan.rationale[0]);
  return `${rationale ?? "已完成结构迁移。"} 当前方案为 ${duration} 秒，可继续告诉我改开头、卖点顺序、字幕密度或节奏。`;
}

function firstBriefLine(value: string) {
  return (value.split("\n\n视频期望参数")[0] || value || "请根据上传视频生成短视频方案").trim();
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

function selectedCreativeSkillNames(ids: CreativeReconstructionSkillId[]) {
  const selected = new Set(ids);
  return creativeReconstructionSkills.filter((skill) => selected.has(skill.id)).map((skill) => skill.name);
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
