import type { RunResult } from "@byteproject/shared";
import type { AgentRunResult, AgentTraceItem, AgentTurn, HistoryEntry } from "./workbenchTypes";

const HISTORY_STORAGE_KEY = "byteproject:migration-history";
const HISTORY_LIMIT = 20;

export function createHistoryEntry(
  result: AgentRunResult,
  prompt: string,
  videoName: string | undefined,
  turns: AgentTurn[],
  summary: string
): HistoryEntry {
  const createdAt = Date.now();
  const historyResult = compactRunResultForHistory(result);
  const visiblePrompt = compactAgentText(firstBriefLine(prompt));
  const score = historyResult.benchmarkScore;
  return {
    id: `${createdAt}-${historyResult.generated.id}`,
    title: historyTitle(historyResult, visiblePrompt),
    prompt: visiblePrompt || summary,
    createdAt,
    score: score.totalScore,
    accepted: score.accepted,
    grade: score.grade,
    videoName,
    result: historyResult,
    turns
  };
}

export function persistHistoryEntry(entry: HistoryEntry, entries: HistoryEntry[]) {
  const next = [entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, HISTORY_LIMIT);
  writeHistoryEntries(next);
  return next;
}

export function readHistoryEntries(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeHistoryEntries(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  } catch {
    // Ignore quota and privacy-mode failures. History is optional.
  }
}

export function historyTurnFromEntry(entry: HistoryEntry): AgentTurn {
  return {
    id: entry.id,
    prompt: entry.prompt,
    status: "done",
    startedAt: entry.createdAt,
    result: entry.result
  };
}

export function benchmarkGradeLabel(grade: RunResult["benchmarkScore"]["grade"]) {
  const labels: Record<RunResult["benchmarkScore"]["grade"], string> = {
    excellent: "优秀",
    pass: "通过",
    needs_iteration: "需迭代",
    fail: "失败"
  };
  return labels[grade];
}

export function formatHistoryTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function historyDuration(result: AgentRunResult) {
  const duration = result.generated.timeline.at(-1)?.endSec ?? result.source.targetDurationSec;
  return Math.round(duration);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry?.id === "string" &&
    typeof entry.title === "string" &&
    typeof entry.prompt === "string" &&
    typeof entry.createdAt === "number" &&
    typeof entry.score === "number" &&
    typeof entry.accepted === "boolean" &&
    Boolean(entry.result?.generated) &&
    Array.isArray(entry.turns)
  );
}

function compactRunResultForHistory(result: AgentRunResult): AgentRunResult {
  return {
    ...result,
    samples: result.samples.map((sample) => ({
      ...sample,
      transcript: sample.transcript.slice(0, 6),
      atoms: sample.atoms.slice(0, 8),
      video: {
        ...sample.video,
        previewFrameDataUrls: undefined
      }
    })),
    knowledge: result.knowledge.slice(0, 4).map((entry) => ({
      ...entry,
      atoms: entry.atoms.slice(0, 8),
      structureSlots: entry.structureSlots.slice(0, 8)
    })),
    material: {
      video: {
        ...result.material.video,
        previewFrameDataUrls: undefined
      },
      segments: result.material.segments.slice(0, 20)
    },
    agentTrace: result.agentTrace?.slice(-12).map((trace) => ({
      ...trace,
      input: compactTracePayload(trace.input),
      observation: compactTracePayload(trace.observation)
    }))
  };
}

function compactTracePayload(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[compact]";
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compactTracePayload(item, depth + 1));
  const compacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("dataurl") || lowerKey.includes("localpath") || lowerKey.includes("apikey")) continue;
    compacted[key] =
      typeof item === "string" && item.length > 240
        ? `${item.slice(0, 240)}...`
        : compactTracePayload(item, depth + 1);
  }
  return compacted;
}

function historyTitle(result: AgentRunResult, prompt: string) {
  const productName = result.source.productName.trim();
  if (productName) return productName;
  return prompt || "未命名迁移";
}

function firstBriefLine(value: string) {
  return (value.split("\n\n视频期望参数")[0] || value || "请根据上传视频生成短视频方案").trim();
}

function compactAgentText(value?: string) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 96);
}
