import type { CSSProperties } from "react";
import { Code2, FileVideo2, RefreshCcw, ScanSearch, Send } from "lucide-react";
import { benchmarkGradeLabel, formatHistoryTime, historyDuration } from "../historyStore";
import type { HistoryEntry } from "../workbenchTypes";

type HistoryIteration = HistoryEntry["result"]["iterations"][number];

export function HistoryWorkspace(props: {
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
        <div className={`history-grid ${props.entries.length === 1 ? "single" : ""}`} aria-label="历史记录列表">
          {props.entries.map((entry) => {
            const hasMockIteration = entry.result.iterations.some(isMockIteration);
            return (
            <article key={entry.id} className={`history-card ${entry.accepted ? "accepted" : "needs-work"} ${hasMockIteration ? "mock-locked" : ""}`}>
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
              <HistoryIterationSummary entry={entry} />
              <HistoryIterationDetails entry={entry} />
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
            );
          })}
          {props.entries.length === 1 ? <HistoryInsightPanel entry={props.entries[0]} /> : null}
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

function HistoryIterationSummary(props: { entry: HistoryEntry }) {
  const iterations = props.entry.result.iterations;
  const best = iterations.find((iteration) => iteration.isBest) ?? iterations.at(-1);
  const mockCount = iterations.filter(isMockIteration).length;
  return (
    <div className={`history-iteration-strip ${mockCount ? "mock" : "real"}`}>
      <span>{iterations.length ? `${iterations.length} 轮迭代成品` : "无迭代成品"}</span>
      <span>{best ? `最佳第 ${best.iterationIndex + 1} 轮` : "未记录最佳轮次"}</span>
      <span>{mockCount ? "mock 锁分" : "真实评审"}</span>
    </div>
  );
}

function HistoryIterationDetails(props: { entry: HistoryEntry }) {
  const iterations = props.entry.result.iterations;
  if (!iterations.length) return null;
  return (
    <details className="history-iterations">
      <summary>查看迭代成品与评分原因</summary>
      <div className="history-iteration-list">
        {iterations.map((iteration) => {
          const outputUrl = iterationOutputUrl(iteration);
          return (
            <article key={`${iteration.candidateId}-${iteration.iterationIndex}`}>
              <header>
                <span>
                  第 {iteration.iterationIndex + 1} 轮
                  {iteration.isBest ? " · 当前采用" : ""}
                </span>
                <strong>{iteration.benchmarkScore.totalScore}/100</strong>
              </header>
              <div className="history-iteration-actions">
                {outputUrl ? (
                  <a href={outputUrl} target="_blank" rel="noreferrer">
                    <FileVideo2 size={14} aria-hidden="true" />
                    打开视频
                  </a>
                ) : null}
                <span>
                  <Code2 size={14} aria-hidden="true" />
                  {iteration.remotionArtifact?.codeHash ?? "无代码 hash"}
                </span>
                <span>
                  <ScanSearch size={14} aria-hidden="true" />
                  {iteration.visualBenchmark?.mockMode ? "mock judge" : iteration.visualBenchmark?.model ?? "visual judge"}
                </span>
              </div>
              <p>{iterationReason(iteration)}</p>
              <small>{iterationProviderLabel(iteration)}</small>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function isMockIteration(iteration: HistoryIteration) {
  return Boolean(
    iteration.visualBenchmark?.mockMode ||
    iteration.remotionArtifact?.mockMode ||
    iteration.benchmarkScore.hardFailures.some((failure) => failure.code === "mock_mode")
  );
}

function iterationOutputUrl(iteration: HistoryIteration) {
  return iteration.remotionArtifact?.outputUrl ?? iteration.demo.url;
}

function iterationReason(iteration: HistoryIteration) {
  return (
    iteration.visualBenchmark?.reasons[0] ??
    iteration.benchmarkScore.hardFailures[0]?.reason ??
    iteration.benchmarkScore.topFixes[0] ??
    iteration.demo.note
  );
}

function iterationProviderLabel(iteration: HistoryIteration) {
  const coder = iteration.remotionArtifact?.provider === "seedance" ? (iteration.remotionArtifact.model ?? "Seedance Remotion Coder") : "mock Seedance coder";
  const judge = iteration.visualBenchmark?.provider === "ark" ? (iteration.visualBenchmark.model ?? "Ark visual judge") : "mock visual judge";
  return `${coder} · ${judge}`;
}

function HistoryInsightPanel(props: { entry: HistoryEntry }) {
  const result = props.entry.result;
  const matched = result.generated.compositionPlan.slotMatches.filter((match) => match.status === "matched").length;
  return (
    <aside className="history-insight-panel" aria-label="历史结果摘要">
      <span>最近一次输出</span>
      <h2>{props.entry.score}/100</h2>
      <p>{result.generated.demo.note}</p>
      <div>
        <strong>{historyDuration(result)} 秒</strong>
        <strong>{result.generated.timeline.length} 段</strong>
        <strong>{matched}/{result.generated.compositionPlan.slotMatches.length} 支撑</strong>
      </div>
    </aside>
  );
}
