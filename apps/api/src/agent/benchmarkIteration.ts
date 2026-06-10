import { scoreCandidate } from "@byteproject/core";
import type { BenchmarkScore, CandidateIteration, GeneratedPlan, SourceInput } from "@byteproject/shared";
import { BENCHMARK_MAX_ITERATIONS } from "./constants";
import { addAnalysisRationale, applyModelEnhancement } from "./planning";
import { publicModelFailureReason } from "./publicContracts";
import { defaultAgentRuntime } from "./runtime";
import type { AgentRuntime } from "./runtime";
import type { AgentContext, AgentTraceItem } from "./types";

export async function ensureBenchmarkScore(context: AgentContext, trace?: AgentTraceItem[], runtime: AgentRuntime = defaultAgentRuntime) {
  if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
    throw new Error("Cannot score incomplete agent context.");
  }
  if (context.benchmarkScore && context.iterations?.length) return;

  const iterations: CandidateIteration[] = [];
  const canAttemptModelRevision = runtime.canUseToolCallingModel();

  for (let iterationIndex = 0; iterationIndex < BENCHMARK_MAX_ITERATIONS; iterationIndex += 1) {
    if (context.generated.demo.status !== "rendered") {
      await renderCurrentCandidate(context, iterationIndex === 0 ? "已先生成候选视频，再进入 benchmark 评分。" : "已重新生成候选视频，再进入 benchmark 复评。", runtime);
    }

    const benchmarkScore = scoreCandidate({
      candidateId: context.generated.id,
      iterationIndex,
      source: context.source,
      sample: context.sample,
      knowledge: context.knowledge,
      materialSegments: context.materialSegments,
      generated: context.generated,
      usedVision: Boolean(context.sampleVision?.analysis?.slots?.length)
    });
    context.benchmarkScore = benchmarkScore;
    iterations.push(snapshotCandidateIteration(context.generated, benchmarkScore, iterationIndex));

    if (trace) {
      trace.push({
        tool: "benchmark_evaluator",
        ok: benchmarkScore.accepted,
        input: { candidateId: context.generated.id, iterationIndex },
        observation: {
          totalScore: benchmarkScore.totalScore,
          grade: benchmarkScore.grade,
          accepted: benchmarkScore.accepted,
          hardFailures: benchmarkScore.hardFailures.map((failure) => failure.code),
          topFixes: benchmarkScore.topFixes
        }
      });
    }

    if (benchmarkScore.accepted || iterationIndex >= BENCHMARK_MAX_ITERATIONS - 1) break;
    if (!benchmarkScore.revisionBrief || benchmarkScore.hardFailures.some((failure) => failure.code === "sensitive_leak")) break;

    const beforePlanId = context.generated.id;
    let revisionMode: "model" | "deterministic" = "deterministic";

    if (canAttemptModelRevision) {
      const modelResult = await runtime.creativeModel.run({
        source: {
          ...context.source,
          prompt: `${context.source.prompt}\n\nBenchmark revision brief:\n${JSON.stringify(benchmarkScore.revisionBrief)}`
        },
        sample: context.sample,
        knowledge: context.knowledge,
        materialSegments: context.materialSegments,
        plan: context.generated
      });

      if (modelResult.enhancement) {
        applyModelEnhancement(context.generated, modelResult.enhancement);
        revisionMode = "model";
      } else if (modelResult.error) {
        trace?.push({
          tool: "iteration_orchestrator",
          ok: false,
          input: { candidateId: beforePlanId, iterationIndex },
          observation: {
            status: "model_revision_unavailable",
            reason: publicModelFailureReason(modelResult.error),
            fallback: "deterministic_benchmark_revision"
          }
        });
      }
    }

    applyBenchmarkRevision(context.generated, context.source, benchmarkScore, iterationIndex + 1);
    context.generated.id = `${beforePlanId}-iter-${iterationIndex + 1}`;
    context.generated.compositionPlan.id = `${context.generated.compositionPlan.id}-iter-${iterationIndex + 1}`;
    context.generated.compositionPlan.rationale = [
      `Benchmark 触发自动迭代：${benchmarkScore.topFixes.join("；")}`,
      ...context.generated.compositionPlan.rationale
    ].slice(0, 5);
    addAnalysisRationale(context);
    await renderCurrentCandidate(context, "已按 benchmark 自动迭代并重新生成 MP4 草稿。", runtime);
    trace?.push({
      tool: "iteration_orchestrator",
      ok: true,
      input: { candidateId: beforePlanId, iterationIndex },
      observation: {
        status: "regenerated",
        mode: revisionMode,
        nextCandidateId: context.generated.id,
        previousScore: benchmarkScore.totalScore
      }
    });
  }

  context.iterations = iterations;
}

export async function renderCurrentCandidate(context: AgentContext, note: string, runtime: AgentRuntime = defaultAgentRuntime) {
  if (!context.generated) throw new Error("Cannot render without a generated plan.");
  const preview = await runtime.renderer.run({
    plan: context.generated,
    outputDir: context.outputDir,
    materialVideo: context.materialVideo,
    materialSegments: context.materialSegments
  });
  context.generated.demo = {
    status: "rendered",
    url: preview.url,
    note: preview.url.endsWith(".mp4") ? note : "已生成 HTML 预览；MP4 渲染不可用时使用该兜底。"
  };
}

function snapshotCandidateIteration(generated: GeneratedPlan, benchmarkScore: BenchmarkScore, iterationIndex: number): CandidateIteration {
  return cloneJson({
    candidateId: generated.id,
    iterationIndex,
    script: generated.script,
    storyboard: generated.storyboard,
    compositionPlan: generated.compositionPlan,
    timeline: generated.timeline,
    previewVariants: generated.previewVariants,
    demo: generated.demo,
    benchmarkScore
  });
}

function applyBenchmarkRevision(generated: GeneratedPlan, source: SourceInput, score: BenchmarkScore, iterationNumber: number) {
  const productName = source.productName.trim() || "这款产品";
  const sellingPoints = source.sellingPoints.filter(Boolean);
  const primaryPoint = sellingPoints[0] ?? "核心卖点";
  const secondaryPoint = sellingPoints[1] ?? primaryPoint;
  const targetAudience = source.targetAudience.trim();
  const failedDimensions = new Set(score.revisionBrief?.failedDimensions.map((dimension) => dimension.dimension) ?? []);
  const needsHook = failedDimensions.has("hook_attraction") || score.totalScore < score.threshold.targetScore;
  const needsBrief = failedDimensions.has("brief_copy_adaptation") || score.hardFailures.some((failure) => failure.code === "brief_mismatch");
  const needsPackaging = failedDimensions.has("visual_packaging_watchability") || failedDimensions.has("retention_rhythm");

  generated.timeline = generated.timeline.map((item, index) => {
    const isFirst = index === 0;
    const isLast = index === generated.timeline.length - 1;
    const point = sellingPoints[index % Math.max(1, sellingPoints.length)] ?? primaryPoint;
    const nextCaption = isFirst && needsHook
      ? `${productName}先看${primaryPoint}`
      : isLast
        ? `${productName}，现在就记住${primaryPoint}`
        : needsBrief
          ? `${point}，给${targetAudience || "目标用户"}更直接`
          : item.caption || `${productName} ${point}`;

    return {
      ...item,
      caption: nextCaption.slice(0, 28),
      packaging: uniqueText([
        ...item.packaging,
        needsPackaging ? "大字标题条" : "",
        needsBrief ? `${point}卖点卡` : "",
        isFirst ? "3秒钩子强调" : "",
        isLast ? "CTA按钮收口" : ""
      ]),
      transition: item.transition || (isFirst ? "快速推近切入" : "顺切加轻推"),
      beatHint: item.beatHint || (isFirst ? "前3秒重拍" : "信息点卡拍")
    };
  });

  generated.storyboard = generated.storyboard.map((item, index) => {
    const timelineItem = generated.timeline.find((candidate) => candidate.slotId === item.slotId) ?? generated.timeline[index];
    return {
      ...item,
      caption: timelineItem?.caption ?? item.caption,
      visual: item.visual || `${productName} 的${sellingPoints[index % Math.max(1, sellingPoints.length)] ?? primaryPoint}画面`,
      reason: item.reason || "根据 benchmark 扣分项补强 hook、卖点承接和可观看包装。"
    };
  });

  generated.script = generated.timeline.map((item) => item.caption).join("\n");
  generated.packagingSuggestions = uniqueText([
    "首屏加大字标题条，先给冲突或利益点。",
    `卖点卡优先露出：${primaryPoint} / ${secondaryPoint}。`,
    "用进度条、轻推近和按钮式 CTA 保证成片节奏。",
    ...generated.packagingSuggestions
  ]).slice(0, 6);
  generated.rendererPrompt = [
    generated.rendererPrompt,
    `Benchmark iteration ${iterationNumber}: strengthen hook, user brief facts, subtitle density, packaging, transitions and CTA.`
  ].filter(Boolean).join("\n");
}

function uniqueText(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
