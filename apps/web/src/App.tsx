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
import type { CreativeStrategy, RunResult, SlotMatch, StructureSlot, TimelineItem } from "@byteproject/shared";
import {
  MarketingFakeVideo,
  REMOTION_FAKE_VIDEO_FPS,
  REMOTION_FAKE_VIDEO_FRAMES,
  REMOTION_FAKE_VIDEO_HEIGHT,
  REMOTION_FAKE_VIDEO_WIDTH,
  type FakeVideoVariant
} from "./remotion/FakeStructureVideos";

type UploadRole = "sample";
type AppScreen = "start" | "progress" | "result";
type ResultTab = "demo" | "structure" | "gaps" | "timeline" | "packaging" | "versions";
type UploadedVideo = { id: string; name: string; previewUrl: string; posterUrl?: string };
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

const strategies: Array<{ value: CreativeStrategy; label: string; hint: string }> = [
  { value: "balanced", label: "均衡版", hint: "节奏、信息、转化都保持稳定。" },
  { value: "high_click", label: "高点击版", hint: "开头更强，节奏更快，字幕更密集。" },
  { value: "high_conversion", label: "高转化版", hint: "卖点更前置，CTA 更明确。" },
  { value: "high_rhythm", label: "高节奏版", hint: "快切更多，卡点更明显。" },
  { value: "premium", label: "高质感版", hint: "节奏更慢，包装更干净。" }
];
const primaryStrategies = strategies.filter((item) => item.value !== "premium");

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

export function App() {
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [activeTab, setActiveTab] = useState<ResultTab>("demo");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [sampleVideo, setSampleVideo] = useState<UploadedVideo | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [form, setForm] = useState<AppForm>(defaultForm);
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void loadDemo();
  }, []);

  useEffect(() => {
    if (screen !== "progress") return undefined;
    setProgressIndex(0);
    const interval = window.setInterval(() => {
      setProgressIndex((current) => Math.min(current + 1, progressSteps.length - 2));
    }, 430);
    return () => window.clearInterval(interval);
  }, [screen]);

  const slots = result?.samples[0]?.slots ?? [];
  const matches = result?.generated.compositionPlan.slotMatches ?? [];
  const totalDuration = result?.generated.timeline.at(-1)?.endSec ?? form.targetDurationSec;
  const hasUploadedInputs = Boolean(sampleVideo?.id);

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
      setActiveTab("demo");
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

  async function generate(extraInstruction?: string) {
    if (!result || isGenerating) return;
    const visiblePrompt = (extraInstruction?.trim() || form.prompt.trim() || "请根据上传视频生成短视频方案").trim();
    const turnId = `${Date.now()}`;
    setAgentTurns((current) => {
      const nextTurn: AgentTurn = { id: turnId, prompt: visiblePrompt, status: "running", startedAt: Date.now() };
      return extraInstruction?.trim() ? [...current, nextTurn] : [nextTurn];
    });
    setIsGenerating(true);
    setScreen("progress");
    setProgressIndex(0);

    const settingPrompt = [
      `开头方式：${form.hookStyle}`,
      `画幅：${form.aspectRatio}`,
      `字幕：${form.subtitleStyle}`,
      `节奏：${form.rhythm}`,
      `收口：${form.ctaStyle}`,
      `视觉风格：${form.visualStyle}`
    ].join("\n");
    const basePrompt = `${form.prompt}\n\n视频期望参数：\n${settingPrompt}`;
    const finalPrompt = extraInstruction ? `${basePrompt}\n\n改片指令：${extraInstruction}` : basePrompt;
    const payload = {
      sampleVideoIds: [sampleVideo?.id ?? "sample-mock"],
      prompt: finalPrompt,
      productName: form.productName,
      sellingPoints: form.sellingPoints.split("\n").map((item) => item.trim()).filter(Boolean),
      targetAudience: form.targetAudience,
      tone: form.tone,
      targetDurationSec: form.targetDurationSec,
      strategy: form.strategy
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
      setProgressIndex(progressSteps.length - 1);
      setActiveTab("demo");
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
          sampleVideo={sampleVideo}
          canGenerate={hasUploadedInputs && Boolean(form.prompt.trim())}
          onUpload={uploadVideo}
          onGenerate={() => generate()}
          isGenerating={isGenerating}
        />
      ) : null}

      {screen === "progress" ? <ProgressScreen currentIndex={progressIndex} activeTurn={agentTurns.at(-1)} sampleVideo={sampleVideo} /> : null}

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
          <p className="studio-subtitle">上传一个优质样例视频，AI 从关键帧中拆解创作方法，再迁移到新的主题与商品信息。</p>
        </header>

        <div className="workflow-rail" aria-label="创作流程">
          <WorkflowStep index={1} label="上传视频" state={props.sampleVideo ? "done" : "active"} />
          <WorkflowStep index={2} label="抽帧拆解" state={props.sampleVideo ? "active" : "idle"} />
          <WorkflowStep index={3} label="迁移方法" state={props.sampleVideo ? "active" : "idle"} />
          <WorkflowStep index={4} label="生成方案" state={props.canGenerate ? "active" : "idle"} />
        </div>

        <div className="studio-workspace">
          <section className="workspace-panel input-panel" aria-label="素材输入区">
            <SectionHeading eyebrow="01 Video" title="单视频输入" note="上传一个优质样例视频，系统会抽取关键帧并拆解可迁移的创作方法。" />
            <div className="upload-list">
              <UploadAction role="sample" label="上传视频" hint="抽帧拆解脚本、镜头、字幕、包装和卡点" video={props.sampleVideo} onFile={props.onUpload} />
            </div>
            <div className="video-preview-grid">
              <VideoPreview
                title="视频预览"
                video={props.sampleVideo}
                emptyText="等待上传视频"
                hints={["建议 10-60 秒", "抽取关键帧并识别 Hook、节奏、字幕、包装"]}
              />
              <div className="frame-insight-card">
                <span className="mini-label">Frame Skill</span>
                <strong>上传后系统将从这一条视频中抽帧拆解</strong>
                <p>拆出脚本段落、镜头节奏、字幕样式、画面包装、转场逻辑和 BGM 卡点，再把这些方法迁移到新的 Brief。</p>
              </div>
            </div>
            <div className="input-status-strip" aria-live="polite">
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "视频已就绪" : "等待视频"}</span>
              <span className={props.sampleVideo ? "ready" : ""}>{props.sampleVideo ? "可开始抽帧拆解" : "等待抽帧"}</span>
            </div>
          </section>

          <section className="workspace-panel intent-panel" aria-label="AI 拆解与创作目标区">
            <SectionHeading eyebrow="02 Brief" title="迁移目标" note="告诉 AI 新主题、商品信息和卖点顺序；系统迁移的是方法，不复制样例内容。" />
            <SettingsPanel form={props.form} setForm={props.setForm} />
          </section>

          <aside className="workspace-panel control-panel" aria-label="生成控制区">
            <SectionHeading eyebrow="03 Generate" title="生成控制" note="少量关键参数保持外露，其余放入高级设置。" />
            <div className="ai-plan-preview" aria-label="AI 方案预览">
              <span className="mini-label">AI Plan Preview</span>
              <strong>AI 将拆解并迁移这些创作层</strong>
              <ul>
                <li>开头钩子与前 3 秒节奏</li>
                <li>镜头槽位与可用画面评估</li>
                <li>字幕结构与卖点推进</li>
                <li>包装、转场与 BGM 卡点</li>
              </ul>
            </div>
            <GenerationControls form={props.form} setForm={props.setForm} />
            <div className="control-footer">
              <p>{props.canGenerate ? "视频已就绪，可以开始抽帧拆解与方案生成。" : "上传一个视频后即可开始抽帧拆解。"}</p>
              <button type="button" className="start-button" aria-label="开始 AI 拆解并生成方案" onClick={props.onGenerate} disabled={props.isGenerating || !props.canGenerate}>
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

function SettingsPanel(props: { form: AppForm; setForm: (form: AppForm) => void }) {
  const { form, setForm } = props;
  return (
    <div className="settings-stack">
      <label className="prompt-composer" htmlFor="targetPrompt">
        <span>目标描述</span>
        <textarea
          id="targetPrompt"
          name="targetPrompt"
          autoComplete="off"
          placeholder="告诉 AI 新主题要达成什么，例如：迁移样例的强开头和三段式卖点推进，但商品、字幕和镜头表达都换成新的方案。"
          value={form.prompt}
          onChange={(event) => setForm({ ...form, prompt: event.target.value })}
        />
      </label>

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
    </div>
  );
}

function GenerationControls(props: { form: AppForm; setForm: (form: AppForm) => void }) {
  const { form, setForm } = props;
  const premiumStrategy = strategies.find((item) => item.value === "premium");
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

      <div className="option-row">
        <span>生成策略</span>
        <div className="strategy-cards compact" role="radiogroup" aria-label="生成策略">
          {primaryStrategies.map((item) => (
            <button
              key={item.value}
              type="button"
              className={form.strategy === item.value ? "active" : ""}
              role="radio"
              aria-checked={form.strategy === item.value}
              onClick={() => setForm({ ...form, strategy: item.value })}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <details className="advanced-settings">
        <summary>Advanced Settings</summary>
        <div className="advanced-stack">
          <OptionChips label="开头方式" value={form.hookStyle} options={hookStyleOptions} onChange={(value) => setForm({ ...form, hookStyle: value })} />
          <OptionChips label="字幕样式" value={form.subtitleStyle} options={subtitleStyleOptions} onChange={(value) => setForm({ ...form, subtitleStyle: value })} />
          <OptionChips label="节奏偏好" value={form.rhythm} options={rhythmOptions} onChange={(value) => setForm({ ...form, rhythm: value })} />
          <OptionChips label="收口方式" value={form.ctaStyle} options={ctaStyleOptions} onChange={(value) => setForm({ ...form, ctaStyle: value })} />
          <OptionChips label="视觉风格" value={form.visualStyle} options={visualStyleOptions} onChange={(value) => setForm({ ...form, visualStyle: value })} />
          {premiumStrategy ? (
            <div className="option-row">
              <span>更多策略</span>
              <div className="strategy-cards single" role="radiogroup" aria-label="更多生成策略">
                <button
                  type="button"
                  className={form.strategy === premiumStrategy.value ? "active" : ""}
                  role="radio"
                  aria-checked={form.strategy === premiumStrategy.value}
                  onClick={() => setForm({ ...form, strategy: premiumStrategy.value })}
                >
                  <strong>{premiumStrategy.label}</strong>
                  <span>{premiumStrategy.hint}</span>
                </button>
              </div>
            </div>
          ) : null}
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

function UploadAction(props: { role: UploadRole; label: string; hint: string; video: UploadedVideo | null; onFile: (file: File, role: UploadRole) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const inputId = `${props.role}-video`;
  return (
    <label className="upload-action" htmlFor={inputId}>
      <input
        id={inputId}
        name={inputId}
        type="file"
        accept="video/*"
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
  );
}

function VideoPreview(props: { title: string; video: UploadedVideo | null; emptyText: string; hints: string[] }) {
  return (
    <article className={`video-preview ${props.video ? "has-video" : ""}`}>
      <div className="preview-title">
        <FileVideo2 size={16} aria-hidden="true" />
        <span>{props.title}</span>
      </div>
      {props.video ? (
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

function ProgressScreen(props: { currentIndex: number; activeTurn?: AgentTurn; sampleVideo: UploadedVideo | null }) {
  const liveSteps = buildLiveAgentSteps(props.currentIndex, props.sampleVideo);
  return (
    <section className="progress-screen" aria-labelledby="progress-title" aria-live="polite">
      <div className="progress-card">
        <span className="product-mark">自动创作链路</span>
        <h1 id="progress-title">正在分析样例视频</h1>
        <div className="progress-thread" aria-label="Agent 分析过程">
          <div className="chat-row user">
            <div className="agent-bubble user-bubble">
              <span>USER</span>
              <p>{props.activeTurn?.prompt || "请根据上传视频生成短视频方案"}</p>
            </div>
          </div>
          <div className="chat-row ai">
            <div className="agent-avatar" aria-hidden="true">
              <Bot size={16} />
            </div>
            <div className="agent-bubble ai-bubble">
              <span>VIDEO AGENT</span>
              <p>收到。开始按视频 Agent 工具链处理：先抽帧，再请求 SD2Lite/视觉分析，最后生成可编辑方案。</p>
            </div>
          </div>
          <div className="agent-tool-stack compact">
            {liveSteps.map((step) => (
              <AgentToolCall key={step.id} step={step} />
            ))}
          </div>
        </div>
        <div className="progress-steps">
          {progressSteps.map((step, index) => {
            const isDone = index < props.currentIndex;
            const isActive = index === props.currentIndex;
            return (
              <div key={step} className={`progress-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}>
                <span className="step-status">
                  {isDone ? <CheckCircle2 size={17} aria-hidden="true" /> : isActive ? <Loader2 className="spin" size={17} aria-hidden="true" /> : null}
                </span>
                <strong>{step}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
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
          <p>默认先看成片，再进入结构、缺口和时间线解释。</p>
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
            <button key={tab.value} type="button" className={props.activeTab === tab.value ? "active" : ""} onClick={() => props.setActiveTab(tab.value)}>
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <main className="result-stage">
          {props.activeTab === "demo" ? (
            <DemoPanel result={props.result} totalDuration={props.totalDuration} sampleVideo={props.sampleVideo} setActiveTab={props.setActiveTab} />
          ) : null}
          {props.activeTab === "structure" ? <StructureMapping result={props.result} matches={props.matches} /> : null}
          {props.activeTab === "gaps" ? <GapDiagnosis slots={props.slots} matches={props.matches} /> : null}
          {props.activeTab === "timeline" ? <TimelineEditor items={props.result.generated.timeline} /> : null}
          {props.activeTab === "packaging" ? <PackagingPanel result={props.result} /> : null}
          {props.activeTab === "versions" ? <VersionCards activeStrategy={props.result.generated.compositionPlan.strategy} /> : null}
        </main>

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
  const structureLine = publicRationale(props.result.generated.compositionPlan.rationale[0]) ?? "已根据样例结构生成新的短视频草案。";
  const fakeCases: Array<{ variant: FakeVideoVariant; title: string; note: string }> = [
    { variant: "click", title: "高点击版成片", note: "强 Hook + 快节奏字幕包装" },
    { variant: "conversion", title: "高转化版成片", note: "卖点前置 + CTA 收口" }
  ];
  const playerProps = {
    productName: props.result.source.productName,
    points: props.result.source.sellingPoints,
    audience: props.result.source.targetAudience
  };

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <div className="demo-video">
        <div className="demo-video-head">
          <span>{props.totalDuration}s</span>
          <strong>{props.sampleVideo ? "上传视频回放" : "Remotion 成片预览"}</strong>
        </div>
        {props.sampleVideo ? (
          <div className="source-video-grid">
            <SourceVideoCard title="上传视频" note="AI 已从这条视频抽帧拆解结构、节奏、字幕、包装与卡点方式" video={props.sampleVideo} />
          </div>
        ) : (
          <div className="remotion-grid">
            {fakeCases.map((item) => (
              <article key={item.variant} className="remotion-card">
                <header>
                  <strong>{item.title}</strong>
                  <span>{item.note}</span>
                </header>
                <div className="fake-remotion-player">
                  <Player
                    component={MarketingFakeVideo}
                    durationInFrames={REMOTION_FAKE_VIDEO_FRAMES}
                    fps={REMOTION_FAKE_VIDEO_FPS}
                    compositionWidth={REMOTION_FAKE_VIDEO_WIDTH}
                    compositionHeight={REMOTION_FAKE_VIDEO_HEIGHT}
                    inputProps={{ ...playerProps, variant: item.variant }}
                    controls
                    loop
                    initialFrame={36}
                    initiallyMuted
                    showVolumeControls={false}
                    style={{ width: "100%" }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="demo-explain">
        <h2 id="demo-title">已生成 {props.totalDuration} 秒商品短视频草案</h2>
        <p>{structureLine}</p>
        <p>{props.sampleVideo ? "左侧回放的是你刚上传的单条视频；右侧方案来自抽帧拆解后的结构迁移结果，不复制原片内容。" : "这里的预览由 Remotion Player 实时渲染，用于展示“结构迁移后的视频观感”。"}</p>
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
      <AdaptiveVideoPlayer video={props.video} title={props.title} variant="stage" />
      <p>{props.video.name}</p>
    </article>
  );
}

function AdaptiveVideoPlayer(props: { video: UploadedVideo; title: string; variant: "stage" | "aside" | "inline" }) {
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

function VideoAgentPanel(props: {
  result: AgentRunResult;
  turns: AgentTurn[];
  sampleVideo: UploadedVideo | null;
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
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
          <strong>SD2Lite 工具流</strong>
        </div>
      </header>

      <div className="agent-thread" aria-live="polite">
        {turns.map((turn, index) => {
          const turnResult = turn.result ?? (index === turns.length - 1 && turn.status === "done" ? props.result : undefined);
          const steps = turnResult ? buildResultAgentSteps(turnResult, props.sampleVideo) : buildLiveAgentSteps(progressSteps.length - 1, props.sampleVideo);
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
                  <p>我会把上传视频拆成可迁移的方法链路，不复制原片内容。下面是本轮工具调用过程。</p>
                </div>
              </div>
              <div className="agent-tool-stack">
                {steps.map((step) => (
                  <AgentToolCall key={step.id} step={step} />
                ))}
              </div>
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

function StructureMapping(props: { result: RunResult; matches: SlotMatch[] }) {
  const sampleSlots = props.result.samples[0]?.slots ?? [];
  const timelineBySlot = new Map(props.result.generated.timeline.map((item) => [item.slotId, item]));

  return (
    <section className="mapping-panel" aria-labelledby="mapping-title">
      <PanelTitle icon={<Layers3 size={18} aria-hidden="true" />} title="结构迁移映射" note="迁移创作方法，而不是复制样例内容。" id="mapping-title" />
      <div className="mapping-table">
        <div className="mapping-head">
          <span>样例结构</span>
          <span>新视频结构</span>
          <span>状态</span>
        </div>
        {sampleSlots.map((slot) => {
          const timeline = timelineBySlot.get(slot.id);
          const match = props.matches.find((item) => item.slotId === slot.id);
          return (
            <div className="mapping-row" key={slot.id}>
              <div>
                <strong>{timeRange(timeline)} {segmentLabel(slot.segment)}</strong>
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
  const visibleGaps = gaps.length ? gaps : props.matches.slice(0, 2);

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

function TimelineEditor(props: { items: TimelineItem[] }) {
  const total = props.items.at(-1)?.endSec ?? 18;
  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <PanelTitle icon={<Clapperboard size={18} aria-hidden="true" />} title="编辑时间线" note="轻量展示镜头、字幕、包装、音频四条轨道。" id="timeline-title" />
      <div className="light-timeline" style={{ "--timeline-total": total } as CSSProperties}>
        <TimelineTrack total={total} label="镜头轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: segmentLabelFromSlotId(item.slotId) }))} />
        <TimelineTrack total={total} label="字幕轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.caption }))} />
        <TimelineTrack total={total} label="包装轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.packaging[0] ?? "包装卡片" }))} />
        <TimelineTrack total={total} label="音频轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.beatHint ?? "卡点" }))} />
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
  const suggestions = props.result.generated.packagingSuggestions.length
    ? props.result.generated.packagingSuggestions
    : ["大字标题条", "卖点三连卡片", "高亮贴纸", "CTA 按钮卡"];
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

function VersionCards(props: { activeStrategy: CreativeStrategy }) {
  return (
    <section className="versions-panel" aria-labelledby="versions-title">
      <PanelTitle icon={<Sparkles size={18} aria-hidden="true" />} title="版本选择" note="同一内容输出不同创作策略。" id="versions-title" />
      <div className="version-grid">
        {strategies.filter((item) => item.value !== "balanced").map((item) => (
          <article key={item.value} className={props.activeStrategy === item.value ? "active" : ""}>
            <h3>{item.label}</h3>
            <p>{item.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PhonePreview(props: { result: RunResult; sampleVideo: UploadedVideo | null }) {
  return (
    <section className="phone-preview" aria-label="手机预览">
      {props.sampleVideo ? (
        <AdaptiveVideoPlayer video={props.sampleVideo} title="侧栏预览" variant="aside" />
      ) : (
        <div className="phone-remotion-player">
          <Player
            component={MarketingFakeVideo}
            durationInFrames={REMOTION_FAKE_VIDEO_FRAMES}
            fps={REMOTION_FAKE_VIDEO_FPS}
            compositionWidth={REMOTION_FAKE_VIDEO_WIDTH}
            compositionHeight={REMOTION_FAKE_VIDEO_HEIGHT}
            inputProps={{
              variant: "conversion",
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
      <p>{props.sampleVideo ? "右侧回放你上传的视频；生成方案会迁移它的创作方法，而不是复刻原片内容。" : "右侧为 Remotion 竖屏预览；后续可接入服务端 MP4 渲染。"}</p>
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
        <label htmlFor="revisionPrompt">告诉 AI 你想怎么改：</label>
      </span>
      <input
        id="revisionPrompt"
        name="revisionPrompt"
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
        <p>{props.note}</p>
      </div>
    </div>
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
      title: "请求 SD2Lite 视觉分析 API",
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
      title: "请求 SD2Lite 视觉分析 API",
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

function agentResultSummary(result: AgentRunResult) {
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
    const frameCount = 6;
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
      const time = Math.min(duration - 0.1, Math.max(0, (duration * (index + 0.5)) / frameCount));
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
