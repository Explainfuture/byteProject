import type { ReactNode } from "react";
import { Clapperboard, Cpu, RefreshCcw, ScanSearch } from "lucide-react";
import type { AppScreen } from "../workbenchTypes";

export function WorkbenchShell(props: {
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
    { label: "迁移任务", icon: <Clapperboard size={16} aria-hidden="true" />, active: props.screen === "start", onClick: props.onShowStart },
    { label: "智能体日志", icon: <Cpu size={16} aria-hidden="true" />, active: props.screen === "result", onClick: props.onShowResult },
    { label: "历史记录", icon: <RefreshCcw size={16} aria-hidden="true" />, active: props.screen === "history", onClick: props.onShowHistory, badge: props.historyCount },
    { label: "评分基准", icon: <ScanSearch size={16} aria-hidden="true" />, active: false, onClick: props.onShowBenchmark }
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
      </aside>
      <div className="workbench-main">
        <header className="workbench-topnav">
          <div className="job-context">
            <span>作业 ID：MGR-8924</span>
            <strong>{statusLabel}</strong>
          </div>
          <nav>
            <button type="button" className={props.screen === "start" ? "active" : ""} onClick={props.onShowStart}>控制台</button>
            <button type="button" className={props.screen === "result" ? "active" : ""} onClick={props.onShowResult}>项目</button>
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
          </div>
        </header>
        <div className="workbench-content">{props.children}</div>
      </div>
    </div>
  );
}
