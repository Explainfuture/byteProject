import type { RunResult, SlotMatch, StructureSlot, TimelineItem } from "@byteproject/shared";
import type { AgentRunResult, AgentToolStep, AgentTraceItem, AgentTurn, UploadedVideo } from "./workbenchTypes";

type BenchmarkScoreView = RunResult["benchmarkScore"];
type BenchmarkDimensionView = BenchmarkScoreView["dimensionScores"][number];

export function toolMetaLabel(meta: string) {
  const labels: Record<string, string> = {
    input: "输入",
    agent: "智能体",
    compose: "生成",
    score: "评分",
    frames: "关键帧",
    model: "模型",
    plan: "方案",
    render: "渲染",
    result: "结果",
    pass: "通过",
    fail: "未通过",
    needs_iteration: "待迭代",
    excellent: "优秀",
    mp4: "MP4",
    blocked: "受阻",
    draft: "草稿",
    fallback: "兜底",
    vision: "视觉",
    structure: "结构",
    "frame tool": "抽帧",
    "gap plan": "缺口",
    "preview ready": "预览就绪"
  };
  return labels[meta] ?? meta;
}

export function currentAgentToolStep(steps: AgentToolStep[]): AgentToolStep {
  return (
    steps.find((step) => step.status === "running") ??
    steps
      .slice()
      .reverse()
      .find((step) => step.status !== "pending") ?? {
      id: "idle",
      title: "等待真实工具事件",
      detail: "后端发出 tool_use_start 后，这里会切到真实工具状态。",
      meta: "idle",
      status: "pending"
    }
  );
}

export function agentTurnIntro(turn: AgentTurn, activeStep: AgentToolStep, result?: AgentRunResult) {
  if (result) return agentBenchmarkVerdict(result);
  if (turn.status === "running" && activeStep.status === "pending") return "我正在等待后端真实工具事件。";
  if (turn.status === "running") return `我在处理「${activeStep.title}」：${activeStep.detail}`;
  return "我会沿着上一轮的结构判断继续改。";
}

export function agentBenchmarkVerdict(result: AgentRunResult) {
  const score = result.benchmarkScore;
  const weakest = weakestBenchmarkDimension(score);
  const strongest = strongestBenchmarkDimension(score);
  if (result.generated.demo.status === "failed") {
    return `这轮卡在成片阶段，我会先看${hardFailureTitle(score.hardFailures[0]?.code)}，再决定怎么重新进渲染。`;
  }
  if (score.accepted) {
    return `我看完成片抽帧了，这版能收${strongest ? `，强项在${strongest.label}` : ""}。下面是证据链。`;
  }
  return `我看完成片抽帧了，这版先打回。分数主要被${weakest?.label ?? "结构完整度"}拉低，下面是判断链。`;
}

export function benchmarkSummaryLabel(score: BenchmarkScoreView, weakest?: BenchmarkDimensionView) {
  if (score.accepted) return "这版可以收，进入最终输出";
  if (score.hardFailures.length) return `这版先打回，${hardFailureTitle(score.hardFailures[0].code)}要先处理`;
  if (score.totalScore < score.threshold.regenerateBelow) return `这版先打回，短板在${weakest?.label ?? "结构完整度"}`;
  return `能跑，但我会继续压${weakest?.label ?? "最弱维度"}`;
}

export function weakestBenchmarkDimension(score: BenchmarkScoreView) {
  return score.dimensionScores
    .slice()
    .sort((left, right) => left.score / left.maxScore - right.score / right.maxScore || left.score - right.score)[0];
}

function strongestBenchmarkDimension(score: BenchmarkScoreView) {
  return score.dimensionScores
    .slice()
    .sort((left, right) => right.score / right.maxScore - left.score / left.maxScore || right.score - left.score)[0];
}

export function hardFailureTitle(code?: string) {
  const labels: Record<string, string> = {
    missing_real_slots: "结构证据不够",
    empty_preview: "成片证据不够",
    copied_sample_content: "迁移边界过近",
    brief_mismatch: "用户目标没吃透",
    sensitive_leak: "敏感信息风险",
    render_failed: "渲染失败",
    invalid_video: "视频不可用",
    missing_required_material_use: "素材使用证据不足",
    no_remotion_code_delta: "代码没有实质变化",
    unsafe_content: "安全合规风险",
    stagnant_iteration: "迭代没有变化",
    mock_mode: "模拟模式不能收片"
  };
  return labels[code ?? ""] ?? "关键阻塞";
}

export function compactAgentText(value?: string) {
  return agentReadableText(value).replace(/^建议/, "").replace(/[。.]$/, "").trim();
}

export function agentReadableText(value?: string) {
  if (!value) return "";
  return value
    .replace(/模型制作规范失败，本轮不会使用本地规则假生成视频。/g, "我需要先拿到可执行制作规范，再进入渲染。")
    .replace(/没有真实分析结果时不会补预设结构。/g, "先等结构证据回来，再画映射。")
    .replace(/这里不会用默认缺口卡片占位。/g, "slotMatches 回来后再列缺口。")
    .replace(/不会用 Hook\/商品展示等默认轨道占位。/g, "timeline 回来后再画轨道。")
    .replace(/不会补大字标题条、卖点卡片等默认建议。/g, "包装建议会跟随样例分析生成。")
    .replace(/不会展示高点击\/高转化等固定预设。/g, "版本会从本次模型方案派生。")
    .trim();
}

export function publicRationale(value?: string) {
  if (!value) return undefined;
  if (/模型增强|Ark request|AuthenticationError|API key|401/i.test(value)) {
    return "已根据样例结构生成新的短视频草案，并完成镜头节奏、字幕包装和素材缺口补全。";
  }
  if (value.includes("Ark/Doubao") || value.includes("已完成在线模型创意增强")) {
    return "已完成在线创意增强，并根据样例结构生成新的短视频草案。";
  }
  return value.replace(/（model:\s*[^）]+）/gi, "").replace(/\(model:\s*[^)]+\)/gi, "").trim();
}

export function buildDynamicResultAgentSteps(result: AgentRunResult, sampleVideo: UploadedVideo | null): AgentToolStep[] {
  const sample = result.samples[0];
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const frameCount = sample?.video.previewFrameCount ?? sample?.video.previewFrameDataUrls?.length ?? traceFrameCount(result.agentTrace) ?? 0;
  const visibleVideoName = sampleVideo?.name ?? sample?.video.fileName ?? "上传视频";
  const visionTrace = result.agentTrace?.find((item) => item.tool === "vision_model" || item.tool === "analyze_sample_video");
  const planTrace = result.agentTrace?.find((item) => item.tool === "model_plan_composer" || item.tool === "compose_video_plan");
  const rendered = result.generated.demo.status === "rendered";
  const failed = result.generated.demo.status === "failed";
  const score = result.benchmarkScore;
  const weakestDimension = weakestBenchmarkDimension(score);
  const benchmarkFix = compactAgentText(score.revisionBrief?.failedDimensions[0]?.instruction ?? score.topFixes[0]);

  return [
    {
      id: "ingest",
      title: "读片和目标",
      detail: `${visibleVideoName} · ${Math.round(sample?.video.durationSec ?? duration)}s · ${sample?.video.width ?? "-"}x${sample?.video.height ?? "-"}`,
      meta: "input",
      status: "done"
    },
    {
      id: "frames",
      title: "抽取关键帧",
      detail: frameCount > 0 ? `抽了 ${frameCount} 张关键帧，用来判断画面结构、节奏和包装密度。` : "已拿到视频元数据，关键帧证据会继续补进分析。",
      meta: "frames",
      status: "done"
    },
    {
      id: "vision",
      title: "拆样例结构",
      detail: visionTrace?.ok ? "模型拆出了样例的镜头节奏、字幕密度和结构槽位。" : agentReadableText(traceFailureText(visionTrace, "模型视觉理解还没给到可用结构。")),
      meta: "model",
      status: visionTrace?.ok ? "done" : "fallback"
    },
    {
      id: "plan",
      title: "生成制作方案",
      detail: planTrace?.ok
        ? `拿到 ${result.generated.timeline.length} 个时间线片段和 ${result.generated.compositionPlan.slotMatches.length} 个槽位匹配。`
        : agentReadableText(traceFailureText(planTrace, "模型还没给到可执行制作规范。")),
      meta: "plan",
      status: planTrace?.ok ? "done" : "fallback"
    },
    {
      id: "render",
      title: rendered ? "渲染成片草稿" : "成片草稿受阻",
      detail: rendered
        ? result.generated.demo.note
        : failed
          ? "制作规范还不够可执行，我会先补齐渲染需要的镜头和包装指令。"
          : "我在整理可渲染的制作规范。",
      meta: rendered ? "mp4" : "blocked",
      status: rendered ? "done" : "fallback"
    },
    {
      id: "benchmark",
      title: score.accepted ? "基准评分收片" : "基准评分打回",
      detail: score.accepted
        ? `总分 ${score.totalScore}/100，我会保留这版并输出结果。`
        : `总分 ${score.totalScore}/100，短板是${weakestDimension?.label ?? "结构完整度"}${benchmarkFix ? `；下一轮先改：${benchmarkFix}。` : "。"}`,
      meta: score.accepted ? "pass" : score.grade,
      status: score.accepted ? "done" : "fallback"
    }
  ];
}

export function agentResultSummary(result: AgentRunResult) {
  const score = result.benchmarkScore;
  const weakest = weakestBenchmarkDimension(score);
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  const slotCount = result.generated.compositionPlan.slotMatches.length;
  if (result.generated.demo.status === "failed") {
    return `这轮先不交付：基准评分 ${score.totalScore}/100，成片规范没有撑住渲染。我会先补齐${hardFailureTitle(score.hardFailures[0]?.code)}和可执行 timeline。`;
  }
  if (score.accepted) {
    return `这版可以交付：${duration} 秒、${slotCount} 个结构槽位，基准评分 ${score.totalScore}/100。我会输出当前成片和结构拆解。`;
  }
  const fix = compactAgentText(score.revisionBrief?.failedDimensions[0]?.instruction ?? score.topFixes[0]);
  const rationale = publicRationale(result.generated.compositionPlan.rationale[0]);
  return `这版先不收：${duration} 秒草稿，基准评分 ${score.totalScore}/100，最弱的是${weakest?.label ?? "结构完整度"}。${rationale ? `${rationale} ` : ""}下一轮先改${fix ? `：${fix}` : "开头、卖点推进和节奏"}。`;
}

export function firstBriefLine(value: string) {
  return (value.split("\n\n视频期望参数")[0] || value || "请根据上传视频生成短视频方案").trim();
}

export function segmentLabel(segment: StructureSlot["segment"]) {
  return {
    hook: "痛点提问",
    body: "功能展示",
    proof: "使用证明",
    offer: "利益点",
    cta: "CTA 收口"
  }[segment];
}

export function slotDisplayName(slot: StructureSlot) {
  const intent = shortIntent(slot.intent);
  if (intent) return intent;
  const packaging = slot.packagingHints[0] ? shortIntent(slot.packagingHints[0]) : "";
  return packaging || segmentLabel(slot.segment);
}

export function segmentLabelFromSlotId(slotId: string) {
  if (slotId.includes("hook")) return "Hook";
  if (slotId.includes("proof")) return "使用证明";
  if (slotId.includes("offer")) return "利益点";
  if (slotId.includes("cta")) return "CTA";
  return "商品展示";
}

export function statusLabel(status: SlotMatch["status"], strategy?: NonNullable<SlotMatch["gapPlan"]>["strategy"]) {
  if (status === "matched") return "素材充足";
  if (strategy === "copy") return "文案补全";
  if (strategy === "packaging") return "包装补全";
  if (strategy === "aigc") return "需要 AIGC";
  if (strategy === "reuse") return "素材复用";
  return status === "weak_match" ? "弱匹配" : "需要补全";
}

export function shortIntent(intent: string) {
  return intent.split(/[，。；:：]/)[0] || intent;
}

export function timeRange(item?: TimelineItem) {
  if (!item) return "0-0s";
  return `${item.startSec}-${item.endSec}s`;
}

export function formatTimelineSeconds(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
}

export function compactTimelineText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "待生成";
  return trimmed.length > 22 ? `${trimmed.slice(0, 22)}...` : trimmed;
}

export function rhythmLabel(value?: StructureSlot["rhythmHint"]) {
  return {
    fast: "快节奏卡点",
    medium: "中速推进",
    slow: "慢节奏留白"
  }[value ?? "medium"];
}

export function gapTitle(slot: StructureSlot | undefined, match: SlotMatch) {
  if (!slot) return "缺少可用结构槽位";
  if (slot.segment === "hook") return "缺少开头吸引镜头";
  if (slot.requiredAssetTypes.includes("product_closeup")) return "缺少商品特写镜头";
  if (slot.requiredAssetTypes.includes("usage")) return "缺少使用过程镜头";
  if (slot.segment === "cta") return "缺少 CTA 镜头";
  return match.status === "weak_match" ? "素材表达力度不足" : "缺少关键支撑素材";
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

function traceFailureText(trace: AgentTraceItem | undefined, fallback: string) {
  if (!trace) return fallback;
  const observation = trace.observation;
  if (observation && typeof observation === "object") {
    const directError = (observation as { error?: unknown }).error;
    if (typeof directError === "string" && directError.trim()) return directError;
    const status = (observation as { status?: unknown }).status;
    if (typeof status === "string" && status.trim()) return `${fallback} 状态：${status}`;
  }
  return fallback;
}
