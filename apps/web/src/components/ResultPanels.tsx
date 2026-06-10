import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, ArrowRight, Clapperboard, Layers3, PackageCheck, Sparkles } from "lucide-react";
import type { RunResult, SlotMatch, StructureSlot, TimelineItem } from "@byteproject/shared";
import {
  gapTitle,
  shortIntent,
  slotDisplayName,
  statusLabel,
  timeRange
} from "../resultPresentationModel";

export function StructureMapping(props: { result: RunResult; matches: SlotMatch[] }) {
  const sampleSlots = props.result.samples[0]?.slots ?? [];
  const timelineBySlot = new Map(props.result.generated.timeline.map((item) => [item.slotId, item]));
  const rows = sampleSlots
    .map((slot) => ({ slot, timeline: timelineBySlot.get(slot.id), match: props.matches.find((item) => item.slotId === slot.id) }))
    .filter((row) => row.timeline);

  if (!rows.length) {
    return <EmptyResultState title="结构映射还在路上" detail="拿到结构槽位和时间线后，我会把样例方法映射到新视频。" />;
  }

  return (
    <section className="mapping-panel" aria-labelledby="mapping-title">
      <PanelTitle icon={<Layers3 size={18} aria-hidden="true" />} title="结构迁移映射" id="mapping-title" />
      <div className="mapping-table">
        <div className="mapping-head">
          <span>样例结构</span>
          <span>新视频结构</span>
          <span>状态</span>
        </div>
        {rows.map(({ slot, timeline, match }) => (
          <div className="mapping-row" key={slot.id}>
            <div>
              <strong>
                {timeRange(timeline)} {slotDisplayName(slot)}
              </strong>
              <p>{shortIntent(slot.intent)}</p>
            </div>
            <ArrowRight className="mapping-arrow" size={18} aria-hidden="true" />
            <div>
              <strong>{timeline?.caption ?? shortIntent(slot.intent)}</strong>
              <p>{timeline?.packaging[0] ?? slot.packagingHints[0] ?? "包装待生成"}</p>
            </div>
            <StatusPill match={match} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function GapDiagnosis(props: { slots: StructureSlot[]; matches: SlotMatch[] }) {
  const supported = props.matches.filter((item) => item.status === "matched").length;
  const gaps = props.matches.filter((item) => item.status !== "matched");

  if (!props.matches.length) {
    return <EmptyResultState title="素材诊断还在路上" detail="slotMatches 返回后，我会按槽位判断哪些画面够用、哪些要补强。" />;
  }

  if (!gaps.length) {
    return <EmptyResultState title="本次没有识别到素材缺口" detail={`模型返回的 ${props.matches.length} 个槽位都已匹配素材。`} />;
  }

  return (
    <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
      <PanelTitle icon={<AlertTriangle size={18} aria-hidden="true" />} title="素材诊断" id="diagnosis-title" />
      <p className="panel-note">当前素材可支撑：{supported} / {props.matches.length} 个结构槽位</p>
      <div className="diagnosis-list">
        {gaps.map((match, index) => {
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

export function TimelineEditor(props: { items: TimelineItem[]; slots: StructureSlot[]; matches: SlotMatch[] }) {
  const total = props.items.at(-1)?.endSec ?? 18;
  const slotById = new Map(props.slots.map((slot) => [slot.id, slot]));

  if (!props.items.length) {
    return <EmptyResultState title="编辑时间线还在路上" detail="拿到可执行时间线后，我会把镜头、字幕、包装和音频节奏拆成轨道。" />;
  }

  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <PanelTitle icon={<Clapperboard size={18} aria-hidden="true" />} title="编辑时间线" id="timeline-title" />
      <div className="light-timeline" style={{ "--timeline-total": total } as CSSProperties}>
        <TimelineTrack total={total} label="镜头轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: slotById.get(item.slotId) ? slotDisplayName(slotById.get(item.slotId)!) : item.caption }))} />
        <TimelineTrack total={total} label="字幕轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.caption }))} />
        <TimelineTrack total={total} label="包装轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.packaging[0] ?? "" }))} />
        <TimelineTrack total={total} label="音频轨" items={props.items.map((item) => ({ id: item.id, start: item.startSec, end: item.endSec, text: item.beatHint ?? "" }))} />
      </div>
    </section>
  );
}

export function PackagingPanel(props: { result: RunResult }) {
  const suggestions = props.result.generated.packagingSuggestions;

  if (!suggestions.length) {
    return <EmptyResultState title="包装建议还在路上" detail="我会基于样例的字幕密度、卖点推进和画面节奏生成包装指令。" />;
  }

  return (
    <section className="packaging-panel" aria-labelledby="packaging-title">
      <PanelTitle icon={<PackageCheck size={18} aria-hidden="true" />} title="包装建议" id="packaging-title" />
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

export function VersionCards(props: { result: RunResult }) {
  const variants = props.result.generated.previewVariants;

  if (!variants.length) {
    return <EmptyResultState title="模型派生版本还在路上" detail="等本次方案稳定后，我会从同一套结构里拆出可比较的版本。" />;
  }

  return (
    <section className="versions-panel" aria-labelledby="versions-title">
      <PanelTitle icon={<Sparkles size={18} aria-hidden="true" />} title="模型派生版本" id="versions-title" />
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

export function PanelTitle(props: { icon: ReactNode; title: string; id: string; note?: string }) {
  return (
    <div className="panel-title">
      <span>{props.icon}</span>
      <div>
        <h2 id={props.id}>{props.title}</h2>
        {props.note ? <p>{props.note}</p> : null}
      </div>
    </div>
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
