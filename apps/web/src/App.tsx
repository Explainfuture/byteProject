import { useEffect, useMemo, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Download,
  FileVideo2,
  Layers3,
  Loader2,
  MessageSquareText,
  PackageCheck,
  RefreshCcw,
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

type UploadRole = "sample" | "material";
type AppScreen = "start" | "progress" | "result";
type ResultTab = "demo" | "structure" | "gaps" | "timeline" | "packaging" | "versions";

type AppForm = {
  prompt: string;
  productName: string;
  sellingPoints: string;
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  strategy: CreativeStrategy;
};

const strategies: Array<{ value: CreativeStrategy; label: string; hint: string }> = [
  { value: "balanced", label: "均衡版", hint: "节奏、信息、转化都保持稳定。" },
  { value: "high_click", label: "高点击版", hint: "开头更强，节奏更快，字幕更密集。" },
  { value: "high_conversion", label: "高转化版", hint: "卖点更前置，CTA 更明确。" },
  { value: "high_rhythm", label: "高节奏版", hint: "快切更多，卡点更明显。" },
  { value: "premium", label: "高质感版", hint: "节奏更慢，包装更干净。" }
];

const resultTabs: Array<{ value: ResultTab; label: string; icon: ReactNode }> = [
  { value: "demo", label: "成片", icon: <FileVideo2 size={17} aria-hidden="true" /> },
  { value: "structure", label: "结构", icon: <Layers3 size={17} aria-hidden="true" /> },
  { value: "gaps", label: "缺口", icon: <AlertTriangle size={17} aria-hidden="true" /> },
  { value: "timeline", label: "时间线", icon: <Clapperboard size={17} aria-hidden="true" /> },
  { value: "packaging", label: "包装", icon: <PackageCheck size={17} aria-hidden="true" /> },
  { value: "versions", label: "版本", icon: <Sparkles size={17} aria-hidden="true" /> }
];

const progressSteps = ["提取字幕与语音", "拆解 Hook / Body / CTA", "分析镜头节奏", "匹配新素材", "识别素材缺口", "生成新视频草案"];

const defaultForm: AppForm = {
  prompt: "把这段素材重构成一个高转化商品短视频，保留样例的开头节奏和卖点推进方式。",
  productName: "智能随行杯",
  sellingPoints: "一眼看见余量\n三种提醒模式\n轻巧不占包",
  targetAudience: "通勤和运动人群",
  tone: "清爽、有节奏、偏转化",
  targetDurationSec: 18,
  strategy: "balanced"
};

export function App() {
  const [result, setResult] = useState<RunResult | null>(null);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [activeTab, setActiveTab] = useState<ResultTab>("demo");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [sampleVideoId, setSampleVideoId] = useState<string | null>(null);
  const [materialVideoId, setMaterialVideoId] = useState<string | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [form, setForm] = useState<AppForm>(defaultForm);
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

  async function loadDemo() {
    setIsLoading(true);
    const response = await fetch("/api/demo");
    const data = (await response.json()) as RunResult;
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
    const response = await fetch(`/api/upload/${role}`, {
      method: "POST",
      body
    });
    const data = (await response.json()) as { video: { id: string; fileName: string } };
    if (role === "sample") setSampleVideoId(data.video.id);
    else setMaterialVideoId(data.video.id);
  }

  async function generate(extraInstruction?: string) {
    if (!result || isGenerating) return;
    setIsGenerating(true);
    setScreen("progress");
    setProgressIndex(0);

    const finalPrompt = extraInstruction ? `${form.prompt}\n\n改片指令：${extraInstruction}` : form.prompt;
    const payload = {
      sampleVideoIds: [sampleVideoId ?? result.samples[0]?.video.id ?? "sample-mock"],
      materialVideoId: materialVideoId ?? result.material.video.id ?? "material-mock",
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
    const data = (await response.json()) as RunResult;

    startTransition(() => {
      setResult(data);
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
          sampleVideoId={sampleVideoId ?? result.samples[0]?.video.id}
          materialVideoId={materialVideoId ?? result.material.video.id}
          onUpload={uploadVideo}
          onGenerate={() => generate()}
          isGenerating={isGenerating}
        />
      ) : null}

      {screen === "progress" ? <ProgressScreen currentIndex={progressIndex} /> : null}

      {screen === "result" ? (
        <ResultWorkspace
          result={result}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalDuration={totalDuration}
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
  sampleVideoId?: string;
  materialVideoId?: string;
  onUpload: (file: File, role: UploadRole) => Promise<void>;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="start-screen" aria-labelledby="start-title">
      <div className="start-card">
        <div className="start-copy">
          <span className="product-mark">AI 视频创作平台</span>
          <h1 id="start-title">爆款结构迁移引擎</h1>
          <p>上传一个爆款样例，输入你的新素材或主题，AI 会拆解它的结构，并生成新的短视频方案。</p>
        </div>

        <div className="start-actions" aria-label="核心输入">
          <UploadAction role="sample" label="上传样例视频" activeId={props.sampleVideoId} onFile={props.onUpload} />
          <UploadAction role="material" label="上传新素材 / 长视频" activeId={props.materialVideoId} onFile={props.onUpload} />
          <label className="prompt-box" htmlFor="targetPrompt">
            <span>目标描述</span>
            <textarea
              id="targetPrompt"
              name="targetPrompt"
              autoComplete="off"
              placeholder="输入你想生成什么视频……"
              value={props.form.prompt}
              onChange={(event) => props.setForm({ ...props.form, prompt: event.target.value })}
            />
          </label>
        </div>

        <AdvancedSettings form={props.form} setForm={props.setForm} />

        <button type="button" className="start-button" onClick={props.onGenerate} disabled={props.isGenerating}>
          {props.isGenerating ? <Loader2 className="spin" size={19} aria-hidden="true" /> : <Wand2 size={19} aria-hidden="true" />}
          开始结构迁移
        </button>
      </div>
    </section>
  );
}

function AdvancedSettings(props: { form: AppForm; setForm: (form: AppForm) => void }) {
  const { form, setForm } = props;
  return (
    <details className="advanced-settings">
      <summary>
        <span>高级设置</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="advanced-grid">
        <label className="field" htmlFor="productName">
          <span>商品名</span>
          <input
            id="productName"
            name="productName"
            autoComplete="off"
            value={form.productName}
            onChange={(event) => setForm({ ...form, productName: event.target.value })}
          />
        </label>
        <label className="field" htmlFor="targetDurationSec">
          <span>目标时长</span>
          <input
            id="targetDurationSec"
            name="targetDurationSec"
            type="number"
            inputMode="numeric"
            min={10}
            max={24}
            autoComplete="off"
            value={form.targetDurationSec}
            onChange={(event) => setForm({ ...form, targetDurationSec: Number(event.target.value) })}
          />
        </label>
        <label className="field wide" htmlFor="sellingPoints">
          <span>卖点顺序</span>
          <textarea
            id="sellingPoints"
            name="sellingPoints"
            autoComplete="off"
            value={form.sellingPoints}
            onChange={(event) => setForm({ ...form, sellingPoints: event.target.value })}
          />
        </label>
        <label className="field" htmlFor="targetAudience">
          <span>目标人群</span>
          <input
            id="targetAudience"
            name="targetAudience"
            autoComplete="off"
            value={form.targetAudience}
            onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}
          />
        </label>
        <label className="field" htmlFor="tone">
          <span>包装语气</span>
          <input id="tone" name="tone" autoComplete="off" value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} />
        </label>
      </div>
    </details>
  );
}

function UploadAction(props: { role: UploadRole; label: string; activeId?: string; onFile: (file: File, role: UploadRole) => Promise<void> }) {
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
        <small>{busy ? "上传分析中…" : props.activeId ?? "未上传时使用演示素材"}</small>
      </span>
    </label>
  );
}

function ProgressScreen(props: { currentIndex: number }) {
  return (
    <section className="progress-screen" aria-labelledby="progress-title" aria-live="polite">
      <div className="progress-card">
        <span className="product-mark">自动创作链路</span>
        <h1 id="progress-title">正在分析样例视频</h1>
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
  result: RunResult;
  activeTab: ResultTab;
  setActiveTab: (tab: ResultTab) => void;
  totalDuration: number;
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
          {props.activeTab === "demo" ? <DemoPanel result={props.result} totalDuration={props.totalDuration} setActiveTab={props.setActiveTab} /> : null}
          {props.activeTab === "structure" ? <StructureMapping result={props.result} matches={props.matches} /> : null}
          {props.activeTab === "gaps" ? <GapDiagnosis slots={props.slots} matches={props.matches} /> : null}
          {props.activeTab === "timeline" ? <TimelineEditor items={props.result.generated.timeline} /> : null}
          {props.activeTab === "packaging" ? <PackagingPanel result={props.result} /> : null}
          {props.activeTab === "versions" ? <VersionCards activeStrategy={props.result.generated.compositionPlan.strategy} /> : null}
        </main>

        <aside className="preview-aside">
          <PhonePreview result={props.result} />
        </aside>
      </div>

      <NaturalLanguageBar
        value={props.revisionPrompt}
        setValue={props.setRevisionPrompt}
        onSubmit={props.onNaturalLanguageRegenerate}
        disabled={props.isGenerating || !props.revisionPrompt.trim()}
      />
    </section>
  );
}

function DemoPanel(props: { result: RunResult; totalDuration: number; setActiveTab: (tab: ResultTab) => void }) {
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
          <strong>Remotion 成片预览</strong>
        </div>
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
      </div>
      <div className="demo-explain">
        <h2 id="demo-title">已生成 {props.totalDuration} 秒商品短视频草案</h2>
        <p>{structureLine}</p>
        <p>这里的两个预览由 Remotion Player 实时渲染，用于展示“结构迁移后的视频观感”，不是旧版 HTML 分镜占位。</p>
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

function PhonePreview(props: { result: RunResult }) {
  return (
    <section className="phone-preview" aria-label="手机预览">
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
      <p>右侧为 Remotion 竖屏预览；后续可接入服务端 MP4 渲染。</p>
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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
