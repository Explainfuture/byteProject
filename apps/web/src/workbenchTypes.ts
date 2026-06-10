import type { CreativeStrategy, RunResult, VideoStyleTrack } from "@byteproject/shared";

export type UploadRole = "sample";

export type AppScreen = "start" | "result" | "history";

export type ResultTab = "demo" | "benchmark" | "structure" | "gaps" | "timeline" | "packaging" | "versions";

export type StartValidationErrors = {
  sampleVideo?: string;
  prompt?: string;
};

export type UploadedVideo = {
  id: string;
  name: string;
  previewUrl?: string;
  posterUrl?: string;
  templateTrack?: VideoStyleTrack;
};

export type AgentTraceItem = {
  tool: string;
  ok: boolean;
  input: unknown;
  observation: unknown;
};

export type AgentRunResult = RunResult & {
  agentTrace?: AgentTraceItem[];
  agentMode?: "tool-calling" | "fallback";
};

export type AgentTurn = {
  id: string;
  prompt: string;
  status: "running" | "done";
  startedAt: number;
  result?: AgentRunResult;
};

export type AgentToolStep = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  status: "pending" | "running" | "done" | "fallback";
};

export type HistoryEntry = {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  score: number;
  accepted: boolean;
  grade: RunResult["benchmarkScore"]["grade"];
  videoName?: string;
  result: AgentRunResult;
  turns: AgentTurn[];
};

export type AppForm = {
  prompt: string;
  productName: string;
  sellingPoints: string;
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  strategy: CreativeStrategy;
  hookStyle: string;
  aspectRatio: string;
  subtitleStyle: string;
  rhythm: string;
  ctaStyle: string;
  visualStyle: string;
};

export type GeneratePayload = {
  sampleVideoIds: string[];
  materialVideoId: string;
  prompt: string;
  productName: string;
  sellingPoints: string[];
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  strategy: CreativeStrategy;
};
