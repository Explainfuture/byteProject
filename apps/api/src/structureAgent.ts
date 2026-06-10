import type { SourceInput, VideoMetadata } from "@byteproject/shared";
import { ensureBenchmarkScore } from "./agent/benchmarkIteration";
import { runFallbackPipeline } from "./agent/fallbackPipeline";
import { parseToolArguments, toolMessage } from "./agent/modelToolClient";
import { publicVideo as toPublicVideo } from "./agent/publicContracts";
import { buildRunResult, summarizeObservation } from "./agent/result";
import { defaultAgentRuntime } from "./agent/runtime";
import type { AgentRuntime } from "./agent/runtime";
import { createAgentTools, toolsForModel } from "./agent/tools";
import type { AgentContext, AgentRunResult, AgentTraceItem, ChatMessage } from "./agent/types";

export { analyzeSampleWithVision } from "./agent/sampleAnalysis";
export { normalizeSourceInput, sourceInputSchema, uploadedFileSchema, uploadRoleSchema } from "./agent/schemas";
export { publicSampleAnalysis, publicVideo, resolveOutputDir, safeModelStatus } from "./agent/publicContracts";
export type { AgentTraceItem } from "./agent/types";

export async function runStructureTransferAgent(input: {
  source: SourceInput;
  sampleVideo: VideoMetadata;
  materialVideo: VideoMetadata;
  outputDir: string;
}, runtime: AgentRuntime = defaultAgentRuntime): Promise<AgentRunResult> {
  const context: AgentContext = {
    source: input.source,
    sampleVideo: input.sampleVideo,
    materialVideo: input.materialVideo,
    outputDir: input.outputDir
  };
  const trace: AgentTraceItem[] = [];

  if (!runtime.canUseToolCallingModel()) {
    return runFallbackPipeline(context, trace, "tool-calling model is not configured", runtime);
  }

  try {
    const agentTools = createAgentTools(runtime);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are the main orchestrator for a short-video structure-transfer agent. First inspect the uploaded video and user brief, then select the suitable creative SKU/tool path, analyze key frames, retrieve knowledge, evaluate available visual segments, compose the plan, enhance it, render or stitch the preview, and score the generated candidate with the benchmark. Transfer creative method, not source content. Do not answer from memory. Call tools until a preview has been rendered and benchmarked. Final answer must be short JSON with status and calledTools."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Run the full PRD workflow. Transfer creative structure, not sample content.",
          source: input.source,
          availableVideos: {
            sample: toPublicVideo(input.sampleVideo),
            availableVisualSource: toPublicVideo(input.materialVideo)
          },
          requiredToolPath: [
            "inspect_uploaded_video",
            "select_creative_sku_and_tools",
            "analyze_sample_video",
            "retrieve_structure_knowledge",
            "evaluate_uploaded_video_segments",
            "compose_video_plan",
            "enhance_creative_plan",
            "render_preview",
            "score_candidate"
          ]
        })
      }
    ];

    for (let step = 0; step < 10; step += 1) {
      const response = await runtime.callToolModel(messages, toolsForModel(agentTools));
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error("Tool-calling model returned no message.");

      const toolCalls = message.tool_calls ?? [];
      if (!toolCalls.length) break;

      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls
      });

      for (const toolCall of toolCalls) {
        const tool = agentTools.find((candidate) => candidate.name === toolCall.function.name);
        if (!tool) {
          const observation = { error: `Unknown tool: ${toolCall.function.name}` };
          trace.push({ tool: toolCall.function.name, ok: false, input: {}, observation });
          messages.push(toolMessage(toolCall, observation));
          continue;
        }

        const rawInput = parseToolArguments(toolCall.function.arguments);
        try {
          const observation = await tool.execute(rawInput, context);
          const summarized = summarizeObservation(observation);
          trace.push({ tool: tool.name, ok: true, input: rawInput, observation: summarized });
          messages.push(toolMessage(toolCall, summarized));
        } catch (error) {
          const observation = { error: error instanceof Error ? error.message : "Tool execution failed." };
          trace.push({ tool: tool.name, ok: false, input: rawInput, observation });
          messages.push(toolMessage(toolCall, observation));
        }
      }

      if (context.generated?.demo.status === "rendered" && context.benchmarkScore) break;
    }

    if (!context.sample || !context.knowledge || !context.materialSegments || !context.generated) {
      return runFallbackPipeline(context, trace, "agent did not complete required tools", runtime);
    }

    await ensureBenchmarkScore(context, trace, runtime);
    return buildRunResult(context, trace, "tool-calling");
  } catch (error) {
    return runFallbackPipeline(context, trace, error instanceof Error ? error.message : "agent failed", runtime);
  }
}
