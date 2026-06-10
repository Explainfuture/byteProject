import type { modelVideoUnderstandingAdapter } from "@byteproject/adapters";
import type {
  AgentStreamEvent,
  BenchmarkScore,
  CandidateIteration,
  GeneratedPlan,
  KnowledgeEntry,
  MaterialSegment,
  RunResult,
  SampleAnalysis,
  SourceInput,
  VideoMetadata
} from "@byteproject/shared";

export type VideoUnderstandingResult = Awaited<ReturnType<typeof modelVideoUnderstandingAdapter.run>>;

export type AgentTraceItem = {
  tool: string;
  ok: boolean;
  input: unknown;
  observation: unknown;
};

export type AgentEventSink = (event: AgentStreamEvent) => void;

export type AgentContext = {
  source: SourceInput;
  sampleVideo: VideoMetadata;
  materialVideo: VideoMetadata;
  outputDir: string;
  sample?: SampleAnalysis;
  knowledge?: KnowledgeEntry[];
  materialSegments?: MaterialSegment[];
  generated?: GeneratedPlan;
  sampleVision?: VideoUnderstandingResult;
  benchmarkScore?: BenchmarkScore;
  iterations?: CandidateIteration[];
  eventSink?: AgentEventSink;
};

export type CompleteAgentContext = AgentContext & {
  sample: SampleAnalysis;
  knowledge: KnowledgeEntry[];
  materialSegments: MaterialSegment[];
  generated: GeneratedPlan;
};

export type AgentRunResult = RunResult & {
  agentTrace: AgentTraceItem[];
  agentMode: "tool-calling" | "fallback";
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown, context: AgentContext): Promise<unknown>;
};
