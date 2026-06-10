import { modelCreativeAdapter, modelPlanComposerAdapter, modelVideoUnderstandingAdapter, remotionStoryboardAdapter, seedanceRemotionCoderAdapter, visualBenchmarkJudgeAdapter } from "@byteproject/adapters";
import { knowledgeStore, seedKnowledge } from "@byteproject/knowledge";
import type { KnowledgeEntry } from "@byteproject/shared";
import { callToolCallingModel, canUseToolCallingModel } from "./modelToolClient";

export type AgentRuntime = {
  videoUnderstanding: Pick<typeof modelVideoUnderstandingAdapter, "run">;
  creativeModel: Pick<typeof modelCreativeAdapter, "run">;
  planComposer: Pick<typeof modelPlanComposerAdapter, "run">;
  renderer: Pick<typeof remotionStoryboardAdapter, "run">;
  remotionCoder: Pick<typeof seedanceRemotionCoderAdapter, "run">;
  visualJudge: Pick<typeof visualBenchmarkJudgeAdapter, "run">;
  knowledge: Pick<typeof knowledgeStore, "add" | "retrieve" | "list">;
  seedKnowledge: KnowledgeEntry[];
  canUseToolCallingModel: () => boolean;
  callToolModel: typeof callToolCallingModel;
};

export const defaultAgentRuntime: AgentRuntime = {
  videoUnderstanding: modelVideoUnderstandingAdapter,
  creativeModel: modelCreativeAdapter,
  planComposer: modelPlanComposerAdapter,
  renderer: remotionStoryboardAdapter,
  remotionCoder: seedanceRemotionCoderAdapter,
  visualJudge: visualBenchmarkJudgeAdapter,
  knowledge: knowledgeStore,
  seedKnowledge,
  canUseToolCallingModel,
  callToolModel: callToolCallingModel
};
