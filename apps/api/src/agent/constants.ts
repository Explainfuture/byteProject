import type { PreviewVariant } from "@byteproject/shared";

export const BENCHMARK_MAX_ITERATIONS = 3;

export const previewTracks: Array<Omit<PreviewVariant, "id" | "targetDurationSec" | "frameBudget" | "promptHint">> = [
  {
    track: "motion_graph_explainer",
    title: "分析派生预览",
    description: "只按本次视频分析出的 timeline、字幕、包装和缺口方案渲染，不套用预设版本。",
    renderer: "remotion"
  }
];
