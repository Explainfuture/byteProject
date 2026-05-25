import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  Gauge,
  Layers3,
  Loader2,
  Maximize2,
  Play,
  RefreshCcw,
  Scissors,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import type { CreativeStrategy, RunResult, SlotMatch, StructureSlot, TimelineItem } from "@byteproject/shared";

type UploadRole = "sample" | "material";
type WorkspaceView = "structure" | "timeline";

const strategies: Array<{ value: CreativeStrategy; label: string; hint: string }> = [
  { value: "balanced", label: "均衡", hint: "完整表达" },
  { value: "high_click", label: "高点击", hint: "强化开头" },
  { value: "high_conversion", label: "高转化", hint: "卖点前置" },
  { value: "high_rhythm", label: "高节奏", hint: "快切卡点" },
  { value: "premium", label: "高质感", hint: "克制包装" }
];

const viewTabs: Array<{ value: WorkspaceView; label: string }> = [
  { value: "structure", label: "结构迁移" },
  { value: "timeline", label: "时间线" }
];

export function App() {
  const [result, setResult] = useState<RunResult | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>("structure");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [, startTransition] = useTransition();
  const [sampleVideoId, setSampleVideoId] = useState<string | null>(null);
  const [materialVideoId, setMaterialVideoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    prompt: "把这段素材重构成一个高转化商品短视频，保留样例的开头节奏和卖点推进方式。",
    productName: "智能随行杯",
    sellingPoints: "一眼看见余量\n三种提醒模式\n轻巧不占包",
    targetAudience: "通勤和运动人群",
    tone: "清爽、有节奏、偏转化",
    targetDurationSec: 18,
    strategy: "balanced" as CreativeStrategy
  });

  useEffect(() => {
    void loadDemo();
  }, []);

  const selectedSlot = useMemo(() => {
    const slots = result?.samples[0]?.slots ?? [];
    const fallbackId = slots[0]?.id ?? null;
    const id = selectedSlotId ?? fallbackId;

    return {
      slot: slots.find((item) => item.id === id) ?? slots[0],
      match: result?.generated.compositionPlan.slotMatches.find((item) => item.slotId === id)
    };
  }, [result, selectedSlotId]);

  async function loadDemo() {
    setIsLoading(true);
    const response = await fetch("/api/demo");
    const data = (await response.json()) as RunResult;
    startTransition(() => {
      setResult(data);
      setSelectedSlotId(data.samples[0]?.slots[0]?.id ?? null);
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

  async function generate() {
    if (!result) return;
    setIsGenerating(true);
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleVideoIds: [sampleVideoId ?? result.samples[0]?.video.id ?? "sample-mock"],
        materialVideoId: materialVideoId ?? result.material.video.id ?? "material-mock",
        prompt: form.prompt,
        productName: form.productName,
        sellingPoints: form.sellingPoints.split("\n").map((item) => item.trim()).filter(Boolean),
        targetAudience: form.targetAudience,
        tone: form.tone,
        targetDurationSec: form.targetDurationSec,
        strategy: form.strategy
      })
    });
    const data = (await response.json()) as RunResult;
    startTransition(() => {
      setResult(data);
      setSelectedSlotId(data.samples[0]?.slots[0]?.id ?? null);
      setActiveView("timeline");
      setIsGenerating(false);
    });
  }

  function exportJson() {
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
        <span>正在载入结构迁移工作台…</span>
      </main>
    );
  }

  const sample = result.samples[0];
  const slots = sample?.slots ?? [];
  const matches = result.generated.compositionPlan.slotMatches;
  const missingCount = matches.filter((item) => item.status === "missing").length;
  const weakCount = matches.filter((item) => item.status === "weak_match").length;
  const totalDuration = result.generated.timeline.at(-1)?.endSec ?? form.targetDurationSec;

  return (
    <main className="studio-shell">
      <a className="skip-link" href="#workspace">
        跳到工作区
      </a>

      <header className="studio-header">
        <div className="brand-lockup" translate="no">
          <span>Viral Structure Studio</span>
          <h1>爆款结构迁移引擎</h1>
        </div>
        <div className="header-actions">
          <StatusBadge missing={missingCount} weak={weakCount} duration={totalDuration} />
          <button type="button" className="ghost-button" onClick={loadDemo} aria-label="重载 Demo">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
          <button type="button" className="primary-button" onClick={generate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Wand2 size={18} aria-hidden="true" />}
            生成新视频方案
          </button>
          <button type="button" className="ghost-button" onClick={exportJson} aria-label="导出 JSON">
            <Download size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="setup-panel" aria-labelledby="setup-title">
        <SectionHeader
          icon={<Upload size={17} aria-hidden="true" />}
          eyebrow="Step 01"
          title="素材与目标"
          note="只收集必要输入，其他判断交给结构引擎。"
          id="setup-title"
        />
        <div className="upload-stack">
          <UploadBox role="sample" label="样例视频" activeId={sampleVideoId ?? sample.video.id} onFile={uploadVideo} />
          <UploadBox role="material" label="长视频素材" activeId={materialVideoId ?? result.material.video.id} onFile={uploadVideo} />
        </div>
        <GoalForm form={form} setForm={setForm} />
      </section>

      <section className="workspace-panel" id="workspace" aria-labelledby="workspace-title">
        <div className="run-brief">
          <div>
            <p className="eyebrow">Structure Transfer</p>
            <h2 id="workspace-title">从样例结构到新视频草案</h2>
            <p>{sample.summary}</p>
          </div>
          <div className="brief-flow" aria-label="生成流程">
            <FlowStep icon={<Film size={16} aria-hidden="true" />} label="拆样例" />
            <ArrowRight size={15} aria-hidden="true" />
            <FlowStep icon={<Scissors size={16} aria-hidden="true" />} label="找槽位" />
            <ArrowRight size={15} aria-hidden="true" />
            <FlowStep icon={<Sparkles size={16} aria-hidden="true" />} label="补缺口" />
          </div>
        </div>

        <div className="workspace-switch" role="tablist" aria-label="工作区视图">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeView === tab.value}
              className={activeView === tab.value ? "active" : ""}
              onClick={() => setActiveView(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeView === "structure" ? (
          <StructureMap
            slots={slots}
            matches={matches}
            selectedSlotId={selectedSlot.slot?.id}
            onSelect={(id) => setSelectedSlotId(id)}
          />
        ) : (
          <EditorTimeline items={result.generated.timeline} matches={matches} />
        )}
      </section>

      <aside className="outcome-panel" aria-labelledby="outcome-title">
        <SectionHeader
          icon={<Layers3 size={17} aria-hidden="true" />}
          eyebrow="Step 03"
          title="生成结果"
          note="展示结论，不暴露调试日志。"
          id="outcome-title"
        />
        {selectedSlot.slot && selectedSlot.match ? <SlotSummary slot={selectedSlot.slot} match={selectedSlot.match} /> : null}
        <PreviewCard result={result} />
        <ScriptCard script={result.generated.script} />
      </aside>
    </main>
  );
}

function GoalForm(props: {
  form: {
    prompt: string;
    productName: string;
    sellingPoints: string;
    targetAudience: string;
    tone: string;
    targetDurationSec: number;
    strategy: CreativeStrategy;
  };
  setForm: (value: AppForm) => void;
}) {
  const { form, setForm } = props;
  return (
    <div className="goal-form">
      <label className="field" htmlFor="prompt">
        <span>重构诉求</span>
        <textarea
          id="prompt"
          name="prompt"
          autoComplete="off"
          value={form.prompt}
          onChange={(event) => setForm({ ...form, prompt: event.target.value })}
        />
      </label>
      <div className="field-grid">
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
      </div>
      <label className="field" htmlFor="sellingPoints">
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
        <input
          id="tone"
          name="tone"
          autoComplete="off"
          value={form.tone}
          onChange={(event) => setForm({ ...form, tone: event.target.value })}
        />
      </label>
      <div className="strategy-grid" aria-label="生成策略">
        {strategies.map((strategy) => (
          <button
            key={strategy.value}
            type="button"
            className={form.strategy === strategy.value ? "selected" : ""}
            onClick={() => setForm({ ...form, strategy: strategy.value })}
          >
            <strong>{strategy.label}</strong>
            <span>{strategy.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type AppForm = {
  prompt: string;
  productName: string;
  sellingPoints: string;
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  strategy: CreativeStrategy;
};

function UploadBox(props: { role: UploadRole; label: string; activeId: string; onFile: (file: File, role: UploadRole) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const inputId = `${props.role}-upload`;

  return (
    <label className="upload-card" htmlFor={inputId}>
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
      <span className="upload-icon">
        {busy ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
      </span>
      <span className="upload-copy">
        <strong>{props.label}</strong>
        <small>{busy ? "上传分析中…" : props.activeId}</small>
      </span>
    </label>
  );
}

function StructureMap(props: {
  slots: StructureSlot[];
  matches: SlotMatch[];
  selectedSlotId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="structure-stage">
      <div className="stage-header">
        <SectionHeader
          icon={<Gauge size={17} aria-hidden="true" />}
          eyebrow="Step 02"
          title="样例结构图"
          note="每个槽位只展示迁移结论和素材状态。"
        />
        <div className="legend" aria-label="槽位状态说明">
          <span className="dot matched" /> 已满足
          <span className="dot weak_match" /> 弱匹配
          <span className="dot missing" /> 缺口
        </div>
      </div>
      <div className="slot-map">
        {props.slots.map((slot, index) => {
          const match = props.matches.find((item) => item.slotId === slot.id);
          return (
            <button
              key={slot.id}
              type="button"
              className={`slot-node ${match?.status ?? "missing"} ${props.selectedSlotId === slot.id ? "selected" : ""}`}
              onClick={() => props.onSelect(slot.id)}
            >
              <span className="slot-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="slot-kind">{segmentLabel(slot.segment)}</span>
              <strong>{shortIntent(slot.intent)}</strong>
              <small>{shortReason(match?.reason)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditorTimeline(props: { items: TimelineItem[]; matches: SlotMatch[] }) {
  const total = props.items.at(-1)?.endSec ?? 18;

  return (
    <div className="timeline-editor">
      <div className="timeline-toolbar">
        <SectionHeader
          icon={<Clapperboard size={17} aria-hidden="true" />}
          eyebrow="Editable Draft"
          title="剪辑时间线"
          note="镜头、包装、字幕、节奏四条轨道对齐展示。"
        />
        <div className="zoom-control" aria-label="时间线缩放">
          <button type="button" aria-label="缩小时间线">
            -
          </button>
          <span>{total}s</span>
          <button type="button" aria-label="放大时间线">
            +
          </button>
        </div>
      </div>
      <div className="timeline-ruler" aria-hidden="true">
        {props.items.map((item) => (
          <span key={item.id}>{item.startSec}s</span>
        ))}
      </div>
      <div className="timeline-track video-track" aria-label="镜头轨">
        <TrackLabel label="镜头" />
        {props.items.map((item) => (
          <TimelineBlock key={item.id} item={item} match={props.matches.find((candidate) => candidate.slotId === item.slotId)} total={total} />
        ))}
      </div>
      <div className="timeline-track caption-track" aria-label="字幕轨">
        <TrackLabel label="字幕" />
        {props.items.map((item) => (
          <span key={item.id} className="caption-chip" style={{ width: `${((item.endSec - item.startSec) / total) * 100}%` }}>
            {item.caption}
          </span>
        ))}
      </div>
      <div className="timeline-track package-track" aria-label="包装轨">
        <TrackLabel label="包装" />
        {props.items.map((item) => (
          <span key={item.id} className="package-chip" style={{ width: `${((item.endSec - item.startSec) / total) * 100}%` }}>
            {item.packaging[0]}
          </span>
        ))}
      </div>
      <div className="timeline-playhead" aria-hidden="true" />
    </div>
  );
}

function TimelineBlock(props: { item: TimelineItem; match?: SlotMatch; total: number }) {
  const width = ((props.item.endSec - props.item.startSec) / props.total) * 100;

  return (
    <div className={`timeline-block ${props.match?.status ?? "missing"}`} style={{ width: `${width}%` }} title={props.item.caption}>
      <span>{props.item.startSec}s</span>
      <strong>{props.item.caption}</strong>
    </div>
  );
}

function SlotSummary(props: { slot: StructureSlot; match: SlotMatch }) {
  const hasGap = Boolean(props.match.gapPlan);

  return (
    <section className="summary-card" aria-label="槽位结论">
      <div className={`status-card ${props.match.status}`}>
        {hasGap ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        <div>
          <strong>{statusLabel(props.match.status)}</strong>
          <span>{Math.round(props.match.confidence * 100)}% 置信度</span>
        </div>
      </div>
      <div className="summary-copy">
        <p className="eyebrow">{segmentLabel(props.slot.segment)}</p>
        <h3>{shortIntent(props.slot.intent)}</h3>
        <p>{props.match.gapPlan?.output ?? props.match.reason}</p>
      </div>
      <div className="need-list">
        {props.slot.requiredAssetTypes.slice(0, 3).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function PreviewCard(props: { result: RunResult }) {
  const timeline = props.result.generated.timeline.slice(0, 4);

  return (
    <section className="preview-card" aria-label="视频预览">
      <div className="phone-frame">
        <div className="phone-status" />
        {timeline.map((item) => (
          <div key={item.id} className="preview-shot">
            <span>{item.startSec}s</span>
            <strong>{item.caption}</strong>
          </div>
        ))}
      </div>
      {props.result.generated.demo.url ? (
        <a className="preview-link" href={props.result.generated.demo.url} target="_blank" rel="noreferrer">
          <Play size={16} aria-hidden="true" />
          打开低保真预览
        </a>
      ) : null}
    </section>
  );
}

function ScriptCard(props: { script: string }) {
  return (
    <section className="script-card" aria-label="脚本摘要">
      <div className="script-head">
        <Sparkles size={16} aria-hidden="true" />
        <h3>脚本摘要</h3>
      </div>
      <p>{compactScript(props.script)}</p>
    </section>
  );
}

function StatusBadge(props: { missing: number; weak: number; duration: number }) {
  return (
    <div className="status-badge" aria-label="当前方案状态">
      <span>{props.duration}s</span>
      <strong>{props.missing ? `${props.missing} 个缺口` : "素材可用"}</strong>
      <small>{props.weak ? `${props.weak} 个弱匹配` : "结构稳定"}</small>
    </div>
  );
}

function SectionHeader(props: { icon: ReactNode; eyebrow: string; title: string; note: string; id?: string }) {
  return (
    <div className="section-header">
      <span className="section-icon">{props.icon}</span>
      <div>
        <p className="eyebrow">{props.eyebrow}</p>
        <h2 id={props.id}>{props.title}</h2>
        <p>{props.note}</p>
      </div>
    </div>
  );
}

function FlowStep(props: { icon: ReactNode; label: string }) {
  return (
    <span>
      {props.icon}
      {props.label}
    </span>
  );
}

function TrackLabel(props: { label: string }) {
  return <span className="track-label">{props.label}</span>;
}

function segmentLabel(segment: StructureSlot["segment"]) {
  return {
    hook: "Hook",
    body: "展开",
    proof: "证明",
    offer: "卖点",
    cta: "CTA"
  }[segment];
}

function statusLabel(status: SlotMatch["status"]) {
  return {
    matched: "已满足",
    weak_match: "弱匹配",
    missing: "需要补全"
  }[status];
}

function shortIntent(intent: string) {
  return intent.split(/[，。:：]/)[0] || intent;
}

function shortReason(reason = "等待素材匹配") {
  return reason.length > 42 ? `${reason.slice(0, 42)}…` : reason;
}

function compactScript(script: string) {
  const normalized = script.replace(/\s+/g, " ").trim();
  return normalized.length > 150 ? `${normalized.slice(0, 150)}…` : normalized;
}
