import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  Braces,
  Clapperboard,
  Download,
  Film,
  GitBranch,
  Layers3,
  Loader2,
  PackageCheck,
  Play,
  RefreshCcw,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import type { CreativeStrategy, RunResult, SlotMatch, StructureSlot, TimelineItem } from "@byteproject/shared";

type UploadRole = "sample" | "material";

const strategies: Array<{ value: CreativeStrategy; label: string }> = [
  { value: "balanced", label: "均衡" },
  { value: "high_click", label: "高点击" },
  { value: "high_conversion", label: "高转化" },
  { value: "high_rhythm", label: "高节奏" },
  { value: "premium", label: "高质感" }
];

export function App() {
  const [result, setResult] = useState<RunResult | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sampleVideoId, setSampleVideoId] = useState<string | null>(null);
  const [materialVideoId, setMaterialVideoId] = useState<string | null>(null);
  const [form, setForm] = useState({
    prompt: "把这段素材重构成一个高转化商品短视频",
    productName: "智能随行杯",
    sellingPoints: "一眼看见余量\n三种提醒模式\n轻巧不占包",
    targetAudience: "通勤和运动人群",
    tone: "清晰、有节奏、偏转化",
    targetDurationSec: 18,
    strategy: "balanced" as CreativeStrategy
  });

  useEffect(() => {
    void loadDemo();
  }, []);

  const selectedSlot = useMemo(() => {
    const slots = result?.samples[0]?.slots ?? [];
    const fallback = slots[0]?.id ?? null;
    const id = selectedSlotId ?? fallback;
    return {
      slot: slots.find((item) => item.id === id) ?? slots[0],
      match: result?.generated.compositionPlan.slotMatches.find((item) => item.slotId === id)
    };
  }, [result, selectedSlotId]);

  async function loadDemo() {
    setIsLoading(true);
    const response = await fetch("/api/demo");
    const data = (await response.json()) as RunResult;
    setResult(data);
    setSelectedSlotId(data.samples[0]?.slots[0]?.id ?? null);
    setIsLoading(false);
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
    setIsGenerating(true);
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleVideoIds: [sampleVideoId ?? result?.samples[0]?.video.id ?? "sample-mock"],
        materialVideoId: materialVideoId ?? result?.material.video.id ?? "material-mock",
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
    setResult(data);
    setSelectedSlotId(data.samples[0]?.slots[0]?.id ?? null);
    setIsGenerating(false);
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
      <main className="loading-screen">
        <Loader2 className="spin" />
        <span>正在载入结构迁移控制台</span>
      </main>
    );
  }

  const slots = result.samples[0]?.slots ?? [];
  const matches = result.generated.compositionPlan.slotMatches;

  return (
    <main className="workbench">
      <header className="topbar">
        <div>
          <p>AI 全栈挑战赛</p>
          <h1>爆款结构迁移引擎</h1>
        </div>
        <div className="mode-pill">
          <span>{result.mode === "mock" ? "Mock 可演示" : "Real 模型"}</span>
          <strong>{result.generated.timeline.at(-1)?.endSec ?? 18}s</strong>
        </div>
        <button className="icon-button" onClick={loadDemo} title="重载 demo">
          <RefreshCcw size={18} />
        </button>
        <button className="primary-button" onClick={generate} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
          生成新视频方案
        </button>
        <button className="icon-button" onClick={exportJson} title="导出 JSON">
          <Download size={18} />
        </button>
      </header>

      <section className="input-rail">
        <PanelTitle icon={<Upload size={17} />} title="输入" note="样例 + 长视频 + 提示词" />
        <UploadBox role="sample" label="样例视频" activeId={sampleVideoId ?? result.samples[0].video.id} onFile={uploadVideo} />
        <UploadBox role="material" label="长视频素材" activeId={materialVideoId ?? result.material.video.id} onFile={uploadVideo} />

        <label className="field">
          <span>重构诉求</span>
          <textarea value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} />
        </label>
        <label className="field">
          <span>商品名</span>
          <input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} />
        </label>
        <label className="field">
          <span>卖点顺序</span>
          <textarea value={form.sellingPoints} onChange={(event) => setForm({ ...form, sellingPoints: event.target.value })} />
        </label>
        <div className="segmented">
          {strategies.map((strategy) => (
            <button
              key={strategy.value}
              className={form.strategy === strategy.value ? "active" : ""}
              onClick={() => setForm({ ...form, strategy: strategy.value })}
            >
              {strategy.label}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span>目标时长</span>
          <input
            type="number"
            min={10}
            max={24}
            value={form.targetDurationSec}
            onChange={(event) => setForm({ ...form, targetDurationSec: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="structure-canvas">
        <div className="canvas-header">
          <PanelTitle icon={<GitBranch size={18} />} title="结构抽取与迁移" note={result.samples[0].summary} />
          <div className="metric-strip">
            <Metric label="镜头数" value={String(result.samples[0].shotCount)} />
            <Metric label="原子技巧" value={String(result.samples[0].atoms.length)} />
            <Metric label="知识条目" value={String(result.knowledge.length)} />
          </div>
        </div>

        <div className="slot-map">
          {slots.map((slot) => {
            const match = matches.find((item) => item.slotId === slot.id);
            return (
              <button
                key={slot.id}
                className={`slot-node ${match?.status ?? "missing"} ${selectedSlot.slot?.id === slot.id ? "selected" : ""}`}
                onClick={() => setSelectedSlotId(slot.id)}
              >
                <span>{segmentLabel(slot.segment)}</span>
                <strong>{slot.intent.split("；")[0]}</strong>
                <small>{match?.reason}</small>
              </button>
            );
          })}
        </div>

        <div className="knowledge-row">
          <PanelTitle icon={<Boxes size={17} />} title="知识库原子" note="迁移创作方法，不复制样例内容" />
          <div className="atom-list">
            {result.knowledge.flatMap((entry) => entry.atoms).slice(0, 7).map((atom) => (
              <span key={atom.id} className="atom-chip">
                {atom.name}
              </span>
            ))}
          </div>
        </div>

        <Timeline items={result.generated.timeline} matches={matches} />
      </section>

      <aside className="inspector">
        <PanelTitle icon={<Layers3 size={17} />} title="检查器" note="槽位、缺口、补全策略" />
        {selectedSlot.slot && selectedSlot.match ? (
          <SlotInspector slot={selectedSlot.slot} match={selectedSlot.match} />
        ) : null}

        <PanelTitle icon={<Clapperboard size={17} />} title="成片 Demo" note={result.generated.demo.note} />
        <div className="preview-phone">
          {result.generated.timeline.slice(0, 4).map((item) => (
            <div key={item.id} className="preview-shot">
              <span>{item.startSec}s</span>
              <strong>{item.caption}</strong>
            </div>
          ))}
        </div>
        {result.generated.demo.url ? (
          <a className="preview-link" href={result.generated.demo.url} target="_blank" rel="noreferrer">
            <Play size={16} />
            打开低保真预览
          </a>
        ) : null}

        <PanelTitle icon={<Braces size={17} />} title="脚本" note="解释材料，不替代视频产物" />
        <pre className="script-block">{result.generated.script}</pre>
      </aside>
    </main>
  );
}

function UploadBox(props: { role: UploadRole; label: string; activeId: string; onFile: (file: File, role: UploadRole) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="upload-box">
      <input
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
      <Film size={18} />
      <span>{props.label}</span>
      <small>{busy ? "上传分析中..." : props.activeId}</small>
    </label>
  );
}

function PanelTitle(props: { icon: ReactNode; title: string; note: string }) {
  return (
    <div className="panel-title">
      {props.icon}
      <div>
        <h2>{props.title}</h2>
        <p>{props.note}</p>
      </div>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function SlotInspector(props: { slot: StructureSlot; match: SlotMatch }) {
  return (
    <div className="slot-inspector">
      <div className={`status-card ${props.match.status}`}>
        {props.match.status === "missing" ? <AlertTriangle size={18} /> : <PackageCheck size={18} />}
        <div>
          <strong>{statusLabel(props.match.status)}</strong>
          <span>{Math.round(props.match.confidence * 100)}% 置信度</span>
        </div>
      </div>
      <dl>
        <dt>结构意图</dt>
        <dd>{props.slot.intent}</dd>
        <dt>所需素材</dt>
        <dd>{props.slot.requiredAssetTypes.join(" / ")}</dd>
        <dt>匹配说明</dt>
        <dd>{props.match.reason}</dd>
        {props.match.gapPlan ? (
          <>
            <dt>补全策略</dt>
            <dd>{props.match.gapPlan.output}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Timeline(props: { items: TimelineItem[]; matches: SlotMatch[] }) {
  const total = props.items.at(-1)?.endSec ?? 18;
  return (
    <div className="timeline-shell">
      <PanelTitle icon={<Sparkles size={17} />} title="时间线草案" note="脚本、素材、包装与节奏对齐" />
      <div className="timeline">
        {props.items.map((item) => {
          const match = props.matches.find((candidate) => candidate.slotId === item.slotId);
          return (
            <div
              key={item.id}
              className={`timeline-block ${match?.status ?? "missing"}`}
              style={{ width: `${((item.endSec - item.startSec) / total) * 100}%` }}
              title={item.caption}
            >
              <span>{item.startSec}s</span>
              <strong>{item.caption}</strong>
              <small>{item.packaging[0]}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function segmentLabel(segment: StructureSlot["segment"]) {
  return {
    hook: "HOOK",
    body: "BODY",
    proof: "PROOF",
    offer: "OFFER",
    cta: "CTA"
  }[segment];
}

function statusLabel(status: SlotMatch["status"]) {
  return {
    matched: "已满足",
    weak_match: "弱匹配",
    missing: "缺口"
  }[status];
}
