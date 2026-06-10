import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
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
  UserRound
} from "lucide-react";
import { Player } from "@remotion/player";
import type { RunResult, SlotMatch, StructureSlot } from "@byteproject/shared";
import { HistoryWorkspace } from "./components/HistoryWorkspace";
import { WorkbenchShell } from "./components/WorkbenchShell";
import { GapDiagnosis, PackagingPanel, PanelTitle, StructureMapping, TimelineEditor, VersionCards } from "./components/ResultPanels";
import {
  agentReadableText,
  agentTurnIntro,
  benchmarkSummaryLabel,
  buildDynamicResultAgentSteps,
  currentAgentToolStep,
  firstBriefLine,
  hardFailureTitle,
  toolMetaLabel,
  weakestBenchmarkDimension
} from "./resultPresentationModel";
import {
  MarketingFakeVideo,
  REMOTION_FAKE_VIDEO_FPS,
  REMOTION_FAKE_VIDEO_HEIGHT,
  REMOTION_FAKE_VIDEO_WIDTH,
  type FakeVideoVariant
} from "./remotion/FakeStructureVideos";
import {
  aspectRatioOptions
} from "./workbenchConfig";
import { useWorkbenchController } from "./workbenchController";
import type { AgentRunResult, AgentToolStep, AgentTurn, AppForm, ResultTab, StartValidationErrors, UploadedVideo, UploadRole } from "./workbenchTypes";

type VideoOrientation = "landscape" | "portrait" | "square" | "unknown";

const resultTabs: Array<{ value: ResultTab; label: string; icon: ReactNode }> = [
  { value: "demo", label: "成片", icon: <FileVideo2 size={17} aria-hidden="true" /> },
  { value: "benchmark", label: "评分", icon: <ScanSearch size={17} aria-hidden="true" /> },
  { value: "structure", label: "结构", icon: <Layers3 size={17} aria-hidden="true" /> },
  { value: "gaps", label: "缺口", icon: <AlertTriangle size={17} aria-hidden="true" /> },
  { value: "timeline", label: "时间线", icon: <Clapperboard size={17} aria-hidden="true" /> },
  { value: "packaging", label: "包装", icon: <PackageCheck size={17} aria-hidden="true" /> },
  { value: "versions", label: "版本", icon: <Sparkles size={17} aria-hidden="true" /> }
];

export function App() {
  const workbench = useWorkbenchController();
  const { result } = workbench;

  if (workbench.isLoading || !result) {
    return (
      <main className="loading-screen" aria-live="polite">
        <Loader2 className="spin" aria-hidden="true" />
        <span>正在载入爆款结构迁移引擎...</span>
      </main>
    );
  }

  return (
    <main className={`app-shell screen-${workbench.screen}`}>
      <WorkbenchShell
        screen={workbench.screen}
        benchmarkScore={result.benchmarkScore.totalScore}
        historyCount={workbench.historyEntries.length}
        onShowStart={workbench.showStart}
        onShowResult={workbench.showResult}
        onShowBenchmark={workbench.showBenchmark}
        onShowHistory={workbench.showHistory}
      >
        {workbench.screen === "start" ? (
          <StartScreen
            form={workbench.form}
            setForm={workbench.setForm}
            validationErrors={workbench.startValidationErrors}
            sampleVideo={workbench.sampleVideo}
            canGenerate={workbench.canGenerate}
            onUpload={workbench.uploadVideo}
            onGenerate={workbench.generateFromStart}
            isGenerating={workbench.isGenerating}
          />
        ) : null}

        {workbench.screen === "result" ? (
          <ResultWorkspace
            result={result}
            agentTurns={workbench.agentTurns}
            activeTab={workbench.activeTab}
            setActiveTab={workbench.setActiveTab}
            totalDuration={workbench.totalDuration}
            sampleVideo={workbench.sampleVideo}
            slots={workbench.slots}
            matches={workbench.matches}
            revisionPrompt={workbench.revisionPrompt}
            setRevisionPrompt={workbench.setRevisionPrompt}
            onRegenerate={workbench.regenerateFromRevision}
            onNaturalLanguageRegenerate={workbench.regenerateFromRevision}
            onExport={workbench.exportResult}
            isGenerating={workbench.isGenerating}
          />
        ) : null}

        {workbench.screen === "history" ? (
          <HistoryWorkspace
            entries={workbench.historyEntries}
            onOpen={workbench.openHistoryEntry}
            onDelete={workbench.deleteHistoryEntry}
            onClear={workbench.clearHistoryEntries}
            onNewMigration={workbench.showStart}
          />
        ) : null}
      </WorkbenchShell>
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
            <MobileAgentStatus sampleVideo={props.sampleVideo} canGenerate={props.canGenerate} isGenerating={props.isGenerating} />
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

function MobileAgentStatus(props: { sampleVideo: UploadedVideo | null; canGenerate: boolean; isGenerating: boolean }) {
  const status = props.isGenerating
    ? "智能体正在生成"
    : props.canGenerate
      ? "视频和目标已就绪"
      : props.sampleVideo
        ? "视频已接收，补充迁移目标"
        : "等待上传视频";
  const detail = props.canGenerate
    ? "发送后会抽帧、拆结构、诊断缺口并生成时间线。"
    : "先准备视频和目标，右侧日志会同步展示工具流。";
  return (
    <div className="mobile-agent-status" aria-live="polite">
      <Cpu size={16} aria-hidden="true" />
      <div>
        <strong>{status}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function StartAgentPanel(props: { sampleVideo: UploadedVideo | null; canGenerate: boolean }) {
  return (
    <section className="video-agent-panel start-agent-flow" aria-label="主智能体对话">
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
            <span>视频</span>
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

function SettingsPanel(props: { form: AppForm; setForm: (form: AppForm) => void; errors?: StartValidationErrors }) {
  const { form, setForm } = props;
  const promptError = props.errors?.prompt;
  return (
    <div className="settings-stack">
      <label className="prompt-composer" htmlFor="targetPrompt">
        <span>你想把这条视频结构迁移成什么？</span>
        <textarea
          id="targetPrompt"
          name="targetPrompt"
          autoComplete="off"
          aria-invalid={Boolean(promptError)}
          aria-describedby={promptError ? "targetPrompt-error" : undefined}
          placeholder="例：把这个机器人运行视频，改成一条适合智能穿戴新品发布的短视频"
          value={form.prompt}
          onChange={(event) => setForm({ ...form, prompt: event.target.value })}
        />
        {promptError ? <p id="targetPrompt-error" className="field-error" role="alert">{promptError}</p> : null}
      </label>

      <details className="brief-details">
        <summary>补充商品信息（可选）</summary>
        <div className="brief-grid">
          <label className="field" htmlFor="productName">
            <span>商品</span>
            <input
              id="productName"
              name="productName"
              autoComplete="off"
              placeholder="例：新品投影仪"
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
              placeholder="例：新品发布会观众"
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
              placeholder={"每行一个卖点\n例：空间感强\n产品亮相明确\n适合发布会开场"}
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
        <summary>保留分析约束</summary>
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
          <small>{busy ? "上传分析中..." : props.video?.name ?? props.hint}</small>
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
          productName: props.video.name.replace(" 演示例", ""),
          points: ["演示样例素材", "接入智能体", "生成 MP4 草稿"],
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
  const resultLayoutClass = props.activeTab === "demo" || props.activeTab === "timeline" || props.activeTab === "structure" ? "result-layout stage-wide" : "result-layout";
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

      <div className={resultLayoutClass}>
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
          {props.activeTab === "timeline" ? <TimelineEditor items={props.result.generated.timeline} slots={props.slots} matches={props.matches} /> : null}
          {props.activeTab === "packaging" ? <PackagingPanel result={props.result} /> : null}
          {props.activeTab === "versions" ? <VersionCards result={props.result} /> : null}
        </section>

        <aside className="preview-aside agent-aside">
          <AgentCompactSummary result={props.result} activeTab={props.activeTab} />
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

function AgentCompactSummary(props: { result: RunResult; activeTab: ResultTab }) {
  const duration = props.result.generated.timeline.at(-1)?.endSec ?? props.result.source.targetDurationSec;
  const matched = props.result.generated.compositionPlan.slotMatches.filter((match) => match.status === "matched").length;
  return (
    <div className="agent-compact-summary" aria-label="当前生成摘要">
      <span>{resultTabs.find((tab) => tab.value === props.activeTab)?.label ?? "结果"}</span>
      <strong>{props.result.benchmarkScore.totalScore}/100</strong>
      <small>{duration}s · {props.result.generated.timeline.length} 段 · {matched}/{props.result.generated.compositionPlan.slotMatches.length} 槽</small>
    </div>
  );
}

function DemoPanel(props: { result: RunResult; totalDuration: number; sampleVideo: UploadedVideo | null; setActiveTab: (tab: ResultTab) => void }) {
  const generatedVideoUrl = props.result.generated.demo.url?.endsWith(".mp4") ? props.result.generated.demo.url : undefined;
  const iterationsWithOutput = props.result.iterations.filter((iteration) => iteration.demo?.url || iteration.demo?.note);

  return (
    <section className="demo-panel" aria-labelledby="demo-title">
      <CandidateIterationRail iterations={iterationsWithOutput} finalCandidateId={props.result.generated.id} />
      <div className="demo-video">
        {generatedVideoUrl ? (
          <article className="generated-video-card">
            <header>
              <strong>生成视频</strong>
              <span>{props.result.generated.demo.note}</span>
            </header>
            <div className="generated-video-frame">
              <video src={generatedVideoUrl} controls playsInline preload="metadata" aria-label="生成视频草稿" />
              <VideoPreviewOverlay
                label="生成 MP4"
                title={`${props.result.benchmarkScore.totalScore}/100 当前输出`}
                detail={props.result.generated.demo.note}
              />
            </div>
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

function CandidateIterationRail(props: { iterations: RunResult["iterations"]; finalCandidateId: string }) {
  if (!props.iterations.length) return null;
  return (
    <section className="candidate-iteration-rail" aria-label="自动迭代候选视频">
      <header>
        <div>
          <span>Agent 自动迭代</span>
          <h3>每轮生成的视频</h3>
        </div>
        <strong>{props.iterations.length} 轮</strong>
      </header>
      <div className="candidate-iteration-grid">
        {props.iterations.map((iteration) => {
          const videoUrl = iteration.demo?.url?.endsWith(".mp4") ? iteration.demo.url : undefined;
          const isFinal = iteration.candidateId === props.finalCandidateId;
          return (
            <article key={`${iteration.candidateId}-${iteration.iterationIndex}`} className={isFinal ? "final" : ""}>
              <div className="candidate-video-frame">
                {videoUrl ? (
                  <>
                    <video src={videoUrl} controls playsInline preload="metadata" aria-label={`第 ${iteration.iterationIndex + 1} 轮候选视频`} />
                    <VideoPreviewOverlay
                      label={isFinal ? "当前输出" : "已评估"}
                      title={`第 ${iteration.iterationIndex + 1} 轮`}
                      detail={`${iteration.benchmarkScore.totalScore}/100 · ${iteration.demo?.note ?? "可播放预览"}`}
                    />
                  </>
                ) : (
                  <div>
                    <PlayCircle size={22} aria-hidden="true" />
                    <span>{iteration.demo?.note ?? "预览输出可用文件"}</span>
                  </div>
                )}
              </div>
              <footer>
                <div>
                  <strong>第 {iteration.iterationIndex + 1} 轮</strong>
                  <span>{iteration.visualBenchmark?.score.accepted ? "通过 benchmark" : isFinal ? "当前最佳" : "已评估"}</span>
                </div>
                <b>{iteration.benchmarkScore.totalScore}/100</b>
              </footer>
              <p className="candidate-reason">{candidatePrimaryReason(iteration)}</p>
              {iteration.remotionArtifact || iteration.visualBenchmark ? (
                <details className="candidate-evidence">
                  <summary>查看生成证据</summary>
                  <div>
                    {iteration.remotionArtifact ? (
                      <section>
                        <span>Remotion</span>
                        <strong>{iteration.remotionArtifact.provider === "mock" ? "模拟模式" : iteration.remotionArtifact.model ?? "Seedance Remotion Coder"}</strong>
                        <code>{iteration.remotionArtifact.codeHash}</code>
                        <pre>{truncateEvidence(iteration.remotionArtifact.remotionCode)}</pre>
                      </section>
                    ) : null}
                    {iteration.visualBenchmark ? (
                      <section>
                        <span>Judge</span>
                        <strong>{iteration.visualBenchmark.mockMode ? "模拟评审" : iteration.visualBenchmark.model ?? "Visual Benchmark Judge"}</strong>
                        <p>{iteration.visualBenchmark.reasons[0] ?? "已完成视觉评审。"}</p>
                        {iteration.visualBenchmark.frameEvidence.length ? (
                          <ul>
                            {iteration.visualBenchmark.frameEvidence.slice(0, 3).map((frame) => (
                              <li key={`${frame.frameUrl}-${frame.timestampSec}`}>
                                {frame.timestampSec}s · {frame.observation}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </section>
                    ) : null}
                    {iteration.visualBenchmark?.nextRewriteBrief ? (
                      <section>
                        <span>下一轮 brief</span>
                        <p>{iteration.visualBenchmark.nextRewriteBrief}</p>
                      </section>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function candidatePrimaryReason(iteration: RunResult["iterations"][number]) {
  if (iteration.visualBenchmark?.score.hardFailures.length) return iteration.visualBenchmark.score.hardFailures[0].reason;
  if (iteration.visualBenchmark?.reasons.length) return iteration.visualBenchmark.reasons[0];
  if (iteration.benchmarkScore.hardFailures.length) return iteration.benchmarkScore.hardFailures[0].reason;
  return iteration.benchmarkScore.topFixes[0] ?? iteration.demo?.note ?? "已完成本轮候选评估。";
}

function truncateEvidence(value: string) {
  return value.length > 520 ? `${value.slice(0, 520)}...` : value;
}

function VideoPreviewOverlay(props: { label: string; title: string; detail: string }) {
  return (
    <div className="video-preview-overlay" aria-hidden="true">
      <span>{props.label}</span>
      <strong>{props.title}</strong>
      <small>{props.detail}</small>
    </div>
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
          const steps = turn.steps?.length ? turn.steps : turnResult ? buildDynamicResultAgentSteps(turnResult, props.sampleVideo) : [];
          const activeStep = currentAgentToolStep(steps);
          return (
            <div className="agent-turn" key={turn.id}>
              <div className="chat-row user">
                <div className="agent-bubble user-bubble">
                  <span>用户</span>
                  <p>{turn.prompt}</p>
                </div>
                <div className="agent-avatar user-avatar" aria-hidden="true">
                  <UserRound size={15} />
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
              {isLatestTurn && steps.length ? (
                <div className="agent-tool-stack">
                  <AgentToolCall step={activeStep} historySteps={steps} />
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

function AgentToolCall(props: { step: AgentToolStep; historySteps?: AgentToolStep[] }) {
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

  const historySteps = props.historySteps ?? [];
  const completedCount = historySteps.filter((step) => step.status === "done" || step.status === "fallback").length;

  return (
    <article className={`agent-tool-call ${props.step.status}`}>
      <div className="agent-tool-icon">{icon}</div>
      <div>
        <header>
          <strong>{props.step.title}</strong>
          {props.step.meta ? <span>{toolMetaLabel(props.step.meta)}</span> : null}
        </header>
        <p>{props.step.detail}</p>
        {historySteps.length > 1 ? (
          <details className="agent-tool-history">
            <summary>查看本轮工具调用（{completedCount}/{historySteps.length}）</summary>
            <ol>
              {historySteps.map((step) => (
                <li key={step.id} className={step.status}>
                  <span>{step.tool ?? step.title}</span>
                  <small>{toolMetaLabel(step.meta ?? step.status)}</small>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </article>
  );
}
