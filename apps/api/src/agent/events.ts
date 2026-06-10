import type { AgentContext } from "./types";

type ToolEventHandle = {
  id: string;
  end: (observation?: unknown) => void;
  error: (observation?: unknown) => void;
};

let nextToolUseId = 0;

export function startToolUse(context: AgentContext, tool: string, input?: unknown): ToolEventHandle {
  const id = `tool-${Date.now()}-${nextToolUseId += 1}`;
  const meta = toolEventMeta(tool);
  context.eventSink?.({
    type: "tool_use_start",
    id,
    tool,
    at: Date.now(),
    title: meta.title,
    detail: meta.detail,
    meta: meta.meta,
    input: summarizeEventPayload(input)
  });
  return {
    id,
    end(observation) {
      context.eventSink?.({
        type: "tool_use_end",
        id,
        tool,
        at: Date.now(),
        title: meta.title,
        detail: meta.doneDetail ?? meta.detail,
        meta: meta.meta,
        observation: summarizeEventPayload(observation),
        ok: true
      });
    },
    error(observation) {
      context.eventSink?.({
        type: "tool_use_error",
        id,
        tool,
        at: Date.now(),
        title: meta.title,
        detail: meta.errorDetail ?? meta.detail,
        meta: "fail",
        observation: summarizeEventPayload(observation),
        ok: false
      });
    }
  };
}

function toolEventMeta(tool: string) {
  const labels: Record<string, { title: string; detail: string; doneDetail?: string; errorDetail?: string; meta: string }> = {
    main_orchestrator: {
      title: "主智能体规划工具调用",
      detail: "正在让主智能体选择下一批真实工具调用。",
      doneDetail: "主智能体已返回下一批工具调用。",
      errorDetail: "主智能体没有返回可执行工具调用。",
      meta: "agent"
    },
    inspect_uploaded_video: {
      title: "读取视频与目标",
      detail: "正在读取上传视频元数据和本轮用户目标。",
      doneDetail: "已读取上传视频元数据和目标参数。",
      meta: "input"
    },
    select_creative_sku_and_tools: {
      title: "选择创意工具路径",
      detail: "正在选择结构迁移需要的 SKU、帧预算和工具路径。",
      doneDetail: "已确定本轮工具路径和帧预算。",
      meta: "plan"
    },
    analyze_sample_video: {
      title: "抽帧理解样例结构",
      detail: "正在调用视觉理解模型拆解上传视频结构。",
      doneDetail: "已完成上传视频结构理解。",
      errorDetail: "视觉理解没有返回可用结构。",
      meta: "model"
    },
    vision_model: {
      title: "视觉模型拆结构",
      detail: "正在用视觉模型分析关键帧、节奏和包装方式。",
      doneDetail: "视觉模型已返回结构证据。",
      errorDetail: "视觉模型结构分析失败。",
      meta: "vision"
    },
    retrieve_structure_knowledge: {
      title: "检索结构知识",
      detail: "正在检索可复用结构 atom 和剪辑模式。",
      doneDetail: "已拿到结构知识候选。",
      meta: "structure"
    },
    evaluate_uploaded_video_segments: {
      title: "评估上传素材片段",
      detail: "正在把上传视频拆成可用视觉片段。",
      doneDetail: "已生成可用素材片段列表。",
      meta: "frames"
    },
    compose_video_plan: {
      title: "生成制作方案",
      detail: "正在生成脚本、timeline、slotMatches 和包装方案。",
      doneDetail: "已生成可执行制作方案。",
      errorDetail: "制作方案生成失败。",
      meta: "plan"
    },
    model_plan_composer: {
      title: "模型生成制作方案",
      detail: "正在让模型生成 timeline 和镜头方案。",
      doneDetail: "模型已返回制作方案。",
      errorDetail: "模型制作方案不可执行。",
      meta: "model"
    },
    enhance_creative_plan: {
      title: "增强创意方案",
      detail: "正在优化文案、节奏、包装和转场描述。",
      doneDetail: "已完成创意增强。",
      meta: "compose"
    },
    creative_model: {
      title: "创意模型增强",
      detail: "正在请求模型优化候选方案。",
      doneDetail: "创意模型已返回增强结果。",
      errorDetail: "创意模型增强失败。",
      meta: "model"
    },
    render_preview: {
      title: "渲染候选视频",
      detail: "正在按 Remotion/FFmpeg 制作候选视频。",
      doneDetail: "已输出候选视频。",
      errorDetail: "候选视频渲染失败。",
      meta: "render"
    },
    seedance_remotion_coder: {
      title: "Seedance 重写 Remotion",
      detail: "正在生成本轮受限 DSL 和 Remotion 代码。",
      doneDetail: "已生成本轮 Remotion 代码 artifact。",
      errorDetail: "Seedance 没有返回可执行 Remotion 代码。",
      meta: "model"
    },
    visual_benchmark_judge: {
      title: "抽帧基准评分",
      detail: "正在基于候选视频抽帧评估分数和打回原因。",
      doneDetail: "已完成候选视频视觉评分。",
      errorDetail: "视觉评审没有返回分数。",
      meta: "score"
    },
    seedance_candidate_iteration: {
      title: "记录候选迭代",
      detail: "正在保存本轮候选视频、代码、评分和下一轮 brief。",
      doneDetail: "已保存本轮候选证据。",
      meta: "result"
    },
    score_candidate: {
      title: "执行 benchmark",
      detail: "正在评分并判断是否继续迭代。",
      doneDetail: "已完成 benchmark 判断。",
      errorDetail: "benchmark 评分失败。",
      meta: "score"
    },
    fallback_pipeline: {
      title: "切换兜底流水线",
      detail: "正在用确定性流程完成本轮制作。",
      doneDetail: "兜底流水线已完成。",
      meta: "fallback"
    }
  };
  return labels[tool] ?? {
    title: tool.replace(/_/g, " "),
    detail: `正在执行 ${tool}。`,
    doneDetail: `${tool} 已完成。`,
    errorDetail: `${tool} 执行失败。`,
    meta: "tool"
  };
}

function summarizeEventPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return { count: value.length };
  if ("source" in value && "sampleVideoIds" in (value as Record<string, unknown>)) {
    return { source: "request_payload" };
  }
  if ("video" in value && "segments" in value) {
    const segments = (value as { segments?: unknown[] }).segments;
    return { segmentCount: Array.isArray(segments) ? segments.length : 0 };
  }
  if ("generated" in value) {
    const generated = (value as { generated?: { id?: string; timeline?: unknown[] } }).generated;
    return { generated: { id: generated?.id, timelineItems: generated?.timeline?.length ?? 0 } };
  }
  if ("benchmarkScore" in value) {
    const score = (value as { benchmarkScore?: { totalScore?: number; accepted?: boolean } }).benchmarkScore;
    return { benchmarkScore: score };
  }
  return value;
}
