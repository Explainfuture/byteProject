import { useEffect, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  FileVideo2,
  Layers3,
  Loader2,
  MessageSquareText,
  PackageCheck,
  PlayCircle,
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
type UploadedVideo = { id: string; name: string; previewUrl: string; posterUrl?: string };

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

const resultTabs: Array<{ value: ResultTab; label: string; icon: ReactNode }> = [
  { value: "demo", label: "成片", icon: <FileVideo2 size={17} aria-hidden="true" /> },
  { value: "structure", label: "结构", icon: <Layers3 size={17} aria-hidden="true" /> },
  { value: "gaps", label: "缺口", icon: <AlertTriangle size={17} aria-hidden="true" /> },
  { value: "timeline", label: "时间线", icon: <Clapperboard size={17} aria-hidden="true" /> },
  { value: "packaging", label: "包装", icon: <PackageCheck size={17} aria-hidden="true" /> },
  { value: "versions", label: "版本", icon: <Sparkles size={17} aria-hidden="true" /> }
];

const progressSteps = ["提取字幕与语音", "拆解 Hook / Body / CTA", "分析镜头节奏", "匹配新素材", "识别素材缺口", "生成新视频草案"];

const hookStyleOptions = ["痛点提问", "结果前置", "反差开场", "场景代入"];
const aspectRatioOptions = ["9:16 竖屏", "1:1 方屏", "16:9 横屏"];
const subtitleStyleOptions = ["大字重点字幕", "口播逐字字幕", "卖点卡片字幕", "少字幕更干净"];
const rhythmOptions = ["跟随样例节奏", "更快切", "更稳重", "前 3 秒加速"];
const ctaStyleOptions = ["强转化收口", "轻提示收口", "福利引导", "评论互动"];
const visualStyleOptions = ["清爽产品感", "生活方式感", "科技质感", "促销信息流"];

const defaultForm: AppForm = {
  prompt: "把这段素材重构成一个高转化商品短视频，保留样例的开头节奏和卖点推进方式。",
  productName: "智能随行杯",
  sellingPoints: "一眼看见余量\n三种提醒模式\n轻巧不占包",
  targetAudience: "通勤和运动人群",
  tone: "清爽、有节奏、偏转化",
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
  const [result, setResult] = useState<RunResult | null>(null);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [activeTab, setActiveTab] = useState<ResultTab>("demo");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [sampleVideo, setSampleVideo] = useState<UploadedVideo | null>(null);
  const [materialVideo, setMaterialVideo] = useState<UploadedVideo | null>(null);
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
  const hasUploadedInputs = Boolean(sampleVideo?.id && materialVideo?.id);

  useEffect(() => {
    return () => {
      if (sampleVideo?.previewUrl) URL.revokeObjectURL(sampleVideo.previewUrl);
    };
  }, [sampleVideo?.previewUrl]);

  useEffect(() => {
    return () => {
      if (materialVideo?.previewUrl) URL.revokeObjectURL(materialVideo.previewUrl);
    };
  }, [materialVideo?.previewUrl]);

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
    if (role === "sample") {
      setSampleVideo((previous) => {
        if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
        return uploaded;
      });
    } else {
      setMaterialVideo((previous) => {
        if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
        return uploaded;
      });
    }
  }

  async function generate(extraInstruction?: string) {
    if (!result || isGenerating) return;
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
      materialVideoId: materialVideo?.id ?? "material-mock",
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
          sampleVideo={sampleVideo}
          materialVideo={materialVideo}
          canGenerate={hasUploadedInputs && Boolean(form.prompt.trim())}
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
          sampleVideo={sampleVideo}
          materialVideo={materialVideo}
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
  materialVideo: UploadedVideo | null;
  canGenerate: boolean;
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

        <div className="workflow-rail" aria-label="创作流程">
          <WorkflowStep index={1} label="上传样例" state={props.sampleVideo ? "done" : "active"} />
          <WorkflowStep index={2} label="AI 拆解结构" state={props.sampleVideo ? "active" : "idle"} />
          <WorkflowStep index={3} label="上传素材" state={props.materialVideo ? "done" : "idle"} />
          <WorkflowStep index={4} label="生成方案" state={props.canGenerate ? "active" : "idle"} />
        </div>

        <div className="launch-panel">
          <div>
            <span>Ready to create</span>
            <strong>{props.canGenerate ? "样例和素材已就绪" : "先完成两个视频上传"}</strong>
            <p>{props.canGenerate ? "AI 将迁移样例的节奏、卖点推进和收口方式。" : "上传后即可一键生成短视频结构迁移方案。"}</p>
          </div>
          <button type="button" className="start-button" aria-label="开始结构迁移" onClick={props.onGenerate} disabled={props.isGenerating || !props.canGenerate}>
            {props.isGenerating ? <Loader2 className="spin" size={20} aria-hidden="true" /> : <Wand2 size={20} aria-hidden="true" />}
            AI 一键迁移结构
          </button>
        </div>

        <div className="start-workspace">
          <section className="upload-panel" aria-label="上传视频">
            <div className="section-heading">
              <span>上传视频</span>
              <strong>样例与新素材</strong>
            </div>
            <div className="upload-list">
              <UploadAction role="sample" label="上传样例视频" video={props.sampleVideo} onFile={props.onUpload} />
              <UploadAction role="material" label="上传新素材 / 长视频" video={props.materialVideo} onFile={props.onUpload} />
            </div>
            <div className="video-preview-grid">
              <VideoPreview
                title="样例预览"
                video={props.sampleVideo}
                emptyText="上传爆款样例后在这里预览"
                hints={["支持 MP4 / MOV，建议 10-60 秒", "AI 会识别开头钩子、节奏、字幕、卖点结构"]}
              />
              <VideoPreview
                title="素材预览"
                video={props.materialVideo}
                emptyText="上传新素材后在这里预览"
                hints={["可上传长视频或素材合集", "AI 会匹配可用镜头并标记素材缺口"]}
              />
            </div>
          </section>

          <section className="settings-panel" aria-label="视频期望参数设置">
            <div className="section-heading">
              <span>设置</span>
              <strong>视频期望参数</strong>
            </div>
            <SettingsPanel form={props.form} setForm={props.setForm} />
          </section>
        </div>
        {!props.canGenerate ? <p className="start-warning">请先上传样例视频和新素材视频；未上传时只会走演示/规则兜底，不会进行真实视频理解。</p> : null}
      </div>
    </section>
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
      <SettingsGroup title="内容目标">
        <label className="field wide compact" htmlFor="targetPrompt">
          <span>目标描述</span>
          <textarea
            id="targetPrompt"
            name="targetPrompt"
            autoComplete="off"
            placeholder="输入你想生成什么视频……"
            value={form.prompt}
            onChange={(event) => setForm({ ...form, prompt: event.target.value })}
          />
        </label>
      </SettingsGroup>

      <SettingsGroup title="商品信息">
        <div className="settings-grid">
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
              max={60}
              autoComplete="off"
              value={form.targetDurationSec}
              onChange={(event) => setForm({ ...form, targetDurationSec: Number(event.target.value) })}
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
          <label className="field wide compact" htmlFor="sellingPoints">
            <span>卖点顺序</span>
            <textarea
              id="sellingPoints"
              name="sellingPoints"
              autoComplete="off"
              value={form.sellingPoints}
              onChange={(event) => setForm({ ...form, sellingPoints: event.target.value })}
            />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup title="视频风格">
        <OptionChips label="开头方式" value={form.hookStyle} options={hookStyleOptions} onChange={(value) => setForm({ ...form, hookStyle: value })} />
        <OptionChips label="画幅" value={form.aspectRatio} options={aspectRatioOptions} onChange={(value) => setForm({ ...form, aspectRatio: value })} />
        <OptionChips label="字幕样式" value={form.subtitleStyle} options={subtitleStyleOptions} onChange={(value) => setForm({ ...form, subtitleStyle: value })} />
        <OptionChips label="节奏偏好" value={form.rhythm} options={rhythmOptions} onChange={(value) => setForm({ ...form, rhythm: value })} />
        <OptionChips label="收口方式" value={form.ctaStyle} options={ctaStyleOptions} onChange={(value) => setForm({ ...form, ctaStyle: value })} />
        <OptionChips label="视觉风格" value={form.visualStyle} options={visualStyleOptions} onChange={(value) => setForm({ ...form, visualStyle: value })} />
      </SettingsGroup>

      <SettingsGroup title="生成策略">
        <div className="strategy-cards" role="radiogroup" aria-label="生成策略">
          {strategies.map((item) => (
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
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup(props: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2>{props.title}</h2>
      {props.children}
    </section>
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

function UploadAction(props: { role: UploadRole; label: string; video: UploadedVideo | null; onFile: (file: File, role: UploadRole) => Promise<void> }) {
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
        <small>{busy ? "上传分析中…" : props.video?.name ?? "未上传：不会发送真实视频给模型"}</small>
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
        <video src={props.video.previewUrl} poster={props.video.posterUrl} controls muted playsInline preload="metadata" aria-label={`${props.title}：${props.video.name}`} />
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
  sampleVideo: UploadedVideo | null;
  materialVideo: UploadedVideo | null;
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
            <DemoPanel result={props.result} totalDuration={props.totalDuration} sampleVideo={props.sampleVideo} materialVideo={props.materialVideo} setActiveTab={props.setActiveTab} />
          ) : null}
          {props.activeTab === "structure" ? <StructureMapping result={props.result} matches={props.matches} /> : null}
          {props.activeTab === "gaps" ? <GapDiagnosis slots={props.slots} matches={props.matches} /> : null}
          {props.activeTab === "timeline" ? <TimelineEditor items={props.result.generated.timeline} /> : null}
          {props.activeTab === "packaging" ? <PackagingPanel result={props.result} /> : null}
          {props.activeTab === "versions" ? <VersionCards activeStrategy={props.result.generated.compositionPlan.strategy} /> : null}
        </main>

        <aside className="preview-aside">
          <PhonePreview result={props.result} materialVideo={props.materialVideo} />
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

function DemoPanel(props: { result: RunResult; totalDuration: number; sampleVideo: UploadedVideo | null; materialVideo: UploadedVideo | null; setActiveTab: (tab: ResultTab) => void }) {
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
          <strong>{props.sampleVideo || props.materialVideo ? "真实上传视频回放" : "Remotion 成片预览"}</strong>
        </div>
        {props.sampleVideo || props.materialVideo ? (
          <div className="source-video-grid">
            {props.sampleVideo ? <SourceVideoCard title="样例视频" note="AI 已从这段视频迁移结构、节奏和包装方式" video={props.sampleVideo} /> : null}
            {props.materialVideo ? <SourceVideoCard title="新素材视频" note="AI 用这段素材匹配镜头槽位并补齐缺口" video={props.materialVideo} /> : null}
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
        <p>{props.sampleVideo || props.materialVideo ? "左侧回放的是你刚上传的真实样例和素材；右侧方案来自模型拆解后的结构迁移结果。" : "这里的两个预览由 Remotion Player 实时渲染，用于展示“结构迁移后的视频观感”，不是旧版 HTML 分镜占位。"}</p>
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
      <video className="source-video-player" src={props.video.previewUrl} poster={props.video.posterUrl} controls muted playsInline preload="metadata" aria-label={`${props.title}：${props.video.name}`} />
      <p>{props.video.name}</p>
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

function PhonePreview(props: { result: RunResult; materialVideo: UploadedVideo | null }) {
  return (
    <section className="phone-preview" aria-label="手机预览">
      {props.materialVideo ? (
        <div className="phone-uploaded-player">
          <video src={props.materialVideo.previewUrl} poster={props.materialVideo.posterUrl} controls muted playsInline preload="metadata" aria-label={`手机预览：${props.materialVideo.name}`} />
        </div>
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
      <p>{props.materialVideo ? "右侧回放你上传的新素材；生成方案已按样例结构匹配这段素材。" : "右侧为 Remotion 竖屏预览；后续可接入服务端 MP4 渲染。"}</p>
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
