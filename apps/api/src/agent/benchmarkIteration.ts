import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scoreCandidate } from "@byteproject/core";
import type { BenchmarkScore, CandidateIteration, CandidateRemotionArtifact, GeneratedPlan, RemotionCompositionDsl, SourceInput, VisualBenchmarkReport } from "@byteproject/shared";
import { startToolUse } from "./events";
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

  const benchmarkEvent = startToolUse(context, "score_candidate", { planId: context.generated.id });
  try {
  if (await runSeedanceCandidateLoop(context, trace, runtime)) {
    benchmarkEvent.end({
      benchmarkScore: context.benchmarkScore,
      iterations: context.iterations?.length ?? 0
    });
    return;
  }

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
  benchmarkEvent.end({
    benchmarkScore: context.benchmarkScore,
    iterations: context.iterations.length
  });
  } catch (error) {
    benchmarkEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "Benchmark scoring failed.") });
    throw error;
  }
}

async function runSeedanceCandidateLoop(context: AgentContext, trace: AgentTraceItem[] | undefined, runtime: AgentRuntime) {
  if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) return false;

  const basePlan = cloneJson(context.generated);
  const iterations: CandidateIteration[] = [];
  let currentPlan = basePlan;
  let rewriteBrief: string | undefined;
  let previousCandidateId: string | undefined;
  let previousStructuralSignature: string | undefined;
  let best: { score: BenchmarkScore; plan: GeneratedPlan; index: number } | undefined;
  let repeatedHardFailure: string | undefined;
  let repeatedHardFailureCount = 0;

  for (let iterationIndex = 0; iterationIndex < BENCHMARK_MAX_ITERATIONS; iterationIndex += 1) {
    const candidateId = `${basePlan.id}-candidate-${iterationIndex}`;
    const coderEvent = startToolUse(context, "seedance_remotion_coder", {
      candidateId,
      iterationIndex,
      rewriteBrief,
      previousCandidateId
    });
    const coderResult = await runtime.remotionCoder.run({
      source: context.source,
      sample: context.sample,
      knowledge: context.knowledge,
      materialSegments: context.materialSegments,
      plan: currentPlan,
      iterationIndex,
      rewriteBrief,
      previousCandidateId
    }).catch((error) => {
      coderEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "Seedance Remotion Coder failed.") });
      throw error;
    });

    if (!coderResult.dsl || !coderResult.remotionCode) {
      coderEvent.error({ provider: coderResult.provider, error: publicModelFailureReason(coderResult.error ?? "Seedance Remotion Coder did not return code.") });
      trace?.push({
        tool: "seedance_remotion_coder",
        ok: false,
        input: { candidateId, iterationIndex },
        observation: { provider: coderResult.provider, error: publicModelFailureReason(coderResult.error ?? "Seedance Remotion Coder did not return code.") }
      });
      return false;
    }
    coderEvent.end({ provider: coderResult.provider, model: coderResult.model, candidateId });

    const codeHash = hashText(coderResult.remotionCode);
    const structuralSignature = remotionStructuralSignature(coderResult.dsl);
    const iterationHardFailures: BenchmarkScore["hardFailures"] = previousStructuralSignature && previousStructuralSignature === structuralSignature
      ? [
          {
            code: "no_remotion_code_delta",
            maxAllowedScore: 60,
            reason: "Only copy changed; Remotion scene timing, layout, motion, and material mapping stayed the same."
          },
          {
            code: "stagnant_iteration",
            maxAllowedScore: 60,
            reason: "Two consecutive candidates are structurally too similar to count as a real iteration."
          }
        ]
      : [];

    const candidatePlan = applyRemotionDslToPlan(currentPlan, coderResult.dsl, candidateId, iterationIndex);
    const artifactDraft = await persistCandidateDraft({
      outputDir: context.outputDir,
      candidateId,
      input: {
        source: context.source,
        rewriteBrief,
        parentCandidateId: previousCandidateId,
        planId: currentPlan.id
      },
      dsl: coderResult.dsl,
      remotionCode: coderResult.remotionCode
    });
    const renderEvent = startToolUse(context, "render_preview", { candidateId, iterationIndex });
    const preview = await runtime.renderer.run({
      plan: candidatePlan,
      outputDir: context.outputDir,
      materialVideo: context.materialVideo,
      materialSegments: context.materialSegments,
      remotionDsl: coderResult.dsl,
      remotionCode: coderResult.remotionCode
    }).catch((error) => {
      renderEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "Renderer failed.") });
      throw error;
    });
    renderEvent.end({ url: preview.url, path: preview.path });
    candidatePlan.demo = {
      status: "rendered",
      url: preview.url,
      note: preview.url.endsWith(".mp4") ? "已由 Seedance Remotion Coder 生成代码并渲染候选视频。" : "已生成候选预览。"
    };

    const judgeEvent = startToolUse(context, "visual_benchmark_judge", {
      candidateId,
      iterationIndex,
      renderedVideo: preview.url
    });
    const judge = await runtime.visualJudge.run({
      source: context.source,
      sample: context.sample,
      knowledge: context.knowledge,
      materialSegments: context.materialSegments,
      plan: candidatePlan,
      candidateId,
      iterationIndex,
      renderedVideo: preview,
      remotionDsl: coderResult.dsl,
      remotionCode: coderResult.remotionCode,
      previousScore: best?.score,
      rewriteBrief
    }).catch((error) => {
      judgeEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "Visual Benchmark Judge failed.") });
      throw error;
    });

    if (!judge.score) {
      judgeEvent.error({ provider: judge.provider, error: publicModelFailureReason(judge.error ?? "Visual Benchmark Judge did not return a score.") });
      trace?.push({
        tool: "visual_benchmark_judge",
        ok: false,
        input: { candidateId, iterationIndex },
        observation: { provider: judge.provider, error: publicModelFailureReason(judge.error ?? "Visual Benchmark Judge did not return a score.") }
      });
      return false;
    }

    const normalizedScore = normalizeVisualScore(withAdditionalHardFailures(judge.score, iterationHardFailures), coderResult.provider, judge.provider);
    const visualBenchmark: VisualBenchmarkReport = {
      provider: judge.provider,
      model: judge.model,
      mockMode: coderResult.provider === "mock" || judge.provider === "mock",
      score: normalizedScore,
      frameEvidence: judge.frameEvidence ?? [],
      reasons: judge.reasons ?? normalizedScore.topFixes,
      nextRewriteBrief: judge.nextRewriteBrief ?? normalizedScore.revisionBrief?.failedDimensions.map((dimension) => dimension.instruction).join("\n")
    };
    judgeEvent.end({
      provider: judge.provider,
      model: judge.model,
      score: normalizedScore.totalScore,
      accepted: normalizedScore.accepted,
      hardFailures: normalizedScore.hardFailures.map((failure) => failure.code)
    });
    const remotionArtifact: CandidateRemotionArtifact = {
      provider: coderResult.provider,
      model: coderResult.model,
      mockMode: coderResult.provider === "mock",
      baseDir: artifactDraft.baseDir,
      inputJsonPath: artifactDraft.inputJsonPath,
      dslPath: artifactDraft.dslPath,
      codePath: artifactDraft.codePath,
      outputPath: preview.path,
      outputUrl: preview.url,
      framePaths: visualBenchmark.frameEvidence.map((frame) => frame.framePath).filter((framePath): framePath is string => Boolean(framePath)),
      frameUrls: visualBenchmark.frameEvidence.map((frame) => frame.frameUrl),
      codeHash,
      dsl: coderResult.dsl,
      remotionCode: coderResult.remotionCode,
      notes: coderResult.notes ?? []
    };

    await persistCandidateScore(artifactDraft.baseDir, normalizedScore, visualBenchmark);
    const snapshot = snapshotCandidateIteration(candidatePlan, normalizedScore, iterationIndex, {
      parentCandidateId: previousCandidateId,
      remotionArtifact,
      visualBenchmark,
      rewriteBrief
    });
    iterations.push(snapshot);

    const iterationEvent = startToolUse(context, "seedance_candidate_iteration", { candidateId, iterationIndex });
    iterationEvent.end({
      score: normalizedScore.totalScore,
      accepted: normalizedScore.accepted,
      outputUrl: preview.url,
      codeHash
    });

    trace?.push({
      tool: "seedance_candidate_iteration",
      ok: normalizedScore.accepted,
      input: { candidateId, iterationIndex },
      observation: {
        coder: coderResult.provider,
        judge: judge.provider,
        score: normalizedScore.totalScore,
        accepted: normalizedScore.accepted,
        hardFailures: normalizedScore.hardFailures.map((failure) => failure.code),
        outputUrl: preview.url
      }
    });

    if (!best || normalizedScore.totalScore > best.score.totalScore) {
      best = { score: normalizedScore, plan: candidatePlan, index: iterations.length - 1 };
    }

    const firstHardFailure = normalizedScore.hardFailures[0]?.code;
    if (firstHardFailure && firstHardFailure === repeatedHardFailure) {
      repeatedHardFailureCount += 1;
    } else {
      repeatedHardFailure = firstHardFailure;
      repeatedHardFailureCount = firstHardFailure ? 1 : 0;
    }

    previousStructuralSignature = structuralSignature;
    if (normalizedScore.accepted || repeatedHardFailureCount >= 2) break;
    rewriteBrief = visualBenchmark.nextRewriteBrief;
    previousCandidateId = candidateId;
    currentPlan = candidatePlan;
  }

  if (!iterations.length || !best) return false;
  context.generated = best.plan;
  context.benchmarkScore = best.score;
  context.iterations = iterations.map((iteration, index) => ({
    ...iteration,
    isBest: index === best.index
  }));
  return true;
}

export async function renderCurrentCandidate(context: AgentContext, note: string, runtime: AgentRuntime = defaultAgentRuntime) {
  if (!context.generated) throw new Error("Cannot render without a generated plan.");
  const renderEvent = startToolUse(context, "render_preview", { planId: context.generated.id });
  const preview = await runtime.renderer.run({
    plan: context.generated,
    outputDir: context.outputDir,
    materialVideo: context.materialVideo,
    materialSegments: context.materialSegments
  }).catch((error) => {
    renderEvent.error({ error: publicModelFailureReason(error instanceof Error ? error.message : "Renderer failed.") });
    throw error;
  });
  renderEvent.end({ url: preview.url, path: preview.path });
  context.generated.demo = {
    status: "rendered",
    url: preview.url,
    note: preview.url.endsWith(".mp4") ? note : "已生成 HTML 预览；MP4 渲染不可用时使用该兜底。"
  };
}

function snapshotCandidateIteration(
  generated: GeneratedPlan,
  benchmarkScore: BenchmarkScore,
  iterationIndex: number,
  extras: {
    parentCandidateId?: string;
    remotionArtifact?: CandidateRemotionArtifact;
    visualBenchmark?: VisualBenchmarkReport;
    rewriteBrief?: string;
  } = {}
): CandidateIteration {
  return cloneJson({
    candidateId: generated.id,
    parentCandidateId: extras.parentCandidateId,
    iterationIndex,
    script: generated.script,
    storyboard: generated.storyboard,
    compositionPlan: generated.compositionPlan,
    timeline: generated.timeline,
    previewVariants: generated.previewVariants,
    demo: generated.demo,
    benchmarkScore,
    remotionArtifact: extras.remotionArtifact,
    visualBenchmark: extras.visualBenchmark,
    rewriteBrief: extras.rewriteBrief
  });
}

function applyRemotionDslToPlan(plan: GeneratedPlan, dsl: RemotionCompositionDsl, candidateId: string, iterationIndex: number): GeneratedPlan {
  const next = cloneJson(plan);
  next.id = candidateId;
  next.compositionPlan.id = `${plan.compositionPlan.id}-candidate-${iterationIndex}`;
  next.timeline = next.timeline.map((item, index) => {
    const scene = dsl.scenes[index];
    if (!scene) return item;
    return {
      ...item,
      startSec: scene.startSec,
      endSec: scene.endSec,
      assetIds: scene.assetIds,
      caption: scene.caption || item.caption,
      packaging: uniqueText([...item.packaging, scene.layout, scene.motion]),
      transition: scene.motion === "snap_zoom" ? "快速推近切入" : scene.motion === "cut" ? "顺切" : item.transition || "轻推过渡",
      beatHint: scene.motion === "snap_zoom" ? "前 3 秒重拍卡点" : item.beatHint || "按场景节奏切换"
    };
  });
  next.storyboard = next.storyboard.map((item, index) => {
    const scene = dsl.scenes[index];
    if (!scene) return item;
    return {
      ...item,
      title: `${dsl.candidateName} ${index + 1}`,
      visual: `Remotion scene ${scene.layout} with ${scene.motion}.`,
      caption: scene.caption || item.caption,
      reason: "Seedance Remotion Coder generated this scene from the current brief and visual judge feedback."
    };
  });
  next.script = next.timeline.map((item) => item.caption).join("\n");
  next.rendererPrompt = [
    next.rendererPrompt,
    `Candidate ${iterationIndex}: render DSL ${dsl.candidateName} with ${dsl.scenes.length} scenes.`
  ].filter(Boolean).join("\n");
  next.compositionPlan.rationale = [
    `Seedance Remotion Coder 生成受限 DSL：${dsl.candidateName}。`,
    ...next.compositionPlan.rationale
  ].slice(0, 5);
  return next;
}

async function persistCandidateDraft(input: {
  outputDir: string;
  candidateId: string;
  input: unknown;
  dsl: RemotionCompositionDsl;
  remotionCode: string;
}) {
  const baseDir = join(input.outputDir, "candidates", input.candidateId);
  await mkdir(baseDir, { recursive: true });
  const inputJsonPath = join(baseDir, "input.json");
  const dslPath = join(baseDir, "remotion.dsl.json");
  const codePath = join(baseDir, "Composition.tsx");
  await Promise.all([
    writeFile(inputJsonPath, JSON.stringify(input.input, null, 2), "utf8"),
    writeFile(dslPath, JSON.stringify(input.dsl, null, 2), "utf8"),
    writeFile(codePath, input.remotionCode, "utf8")
  ]);
  return { baseDir, inputJsonPath, dslPath, codePath };
}

async function persistCandidateScore(baseDir: string, score: BenchmarkScore, report: VisualBenchmarkReport) {
  await writeFile(
    join(baseDir, "score.json"),
    JSON.stringify(
      {
        score,
        provider: report.provider,
        mockMode: report.mockMode,
        reasons: report.reasons,
        frameEvidence: report.frameEvidence,
        nextRewriteBrief: report.nextRewriteBrief
      },
      null,
      2
    ),
    "utf8"
  );
}

function withAdditionalHardFailures(score: BenchmarkScore, hardFailures: BenchmarkScore["hardFailures"]): BenchmarkScore {
  if (!hardFailures.length) return score;
  const seen = new Set(score.hardFailures.map((failure) => failure.code));
  return {
    ...score,
    hardFailures: [
      ...score.hardFailures,
      ...hardFailures.filter((failure) => {
        if (seen.has(failure.code)) return false;
        seen.add(failure.code);
        return true;
      })
    ]
  };
}

function normalizeVisualScore(score: BenchmarkScore, coderProvider: "seedance" | "mock", judgeProvider: "ark" | "mock"): BenchmarkScore {
  if (coderProvider !== "mock" && judgeProvider !== "mock") return enforceAcceptance(score);
  const totalScore = Math.min(score.totalScore, 59);
  const mockModeFailure = score.hardFailures.some((failure) => failure.code === "mock_mode")
    ? []
    : [{
      code: "mock_mode" as const,
      maxAllowedScore: 59,
      reason: "Seedance Remotion Coder or Visual Benchmark Judge is in mock mode; this candidate cannot formally pass."
    }];
  return enforceAcceptance({
    ...score,
    totalScore,
    hardFailures: [...score.hardFailures, ...mockModeFailure],
    topFixes: score.topFixes.length ? score.topFixes : ["Configure production Seedance coder and visual judge before formal acceptance."]
  });
}

function enforceAcceptance(score: BenchmarkScore): BenchmarkScore {
  const accepted = score.totalScore >= score.threshold.targetScore && score.hardFailures.length === 0;
  const grade: BenchmarkScore["grade"] = accepted
    ? score.totalScore >= score.threshold.excellentFrom ? "excellent" : "pass"
    : score.totalScore < score.threshold.regenerateBelow ? "fail" : "needs_iteration";
  return {
    ...score,
    accepted,
    grade
  };
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function remotionStructuralSignature(dsl: RemotionCompositionDsl) {
  return hashText(JSON.stringify(dsl.scenes.map((scene) => ({
    startSec: scene.startSec,
    endSec: scene.endSec,
    layout: scene.layout,
    assetIds: scene.assetIds,
    motion: scene.motion
  }))));
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
