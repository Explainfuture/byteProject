import { useEffect, useState, useTransition } from "react";
import type { SlotMatch, StructureSlot } from "@byteproject/shared";
import { downloadResultJson, fetchDemoResult, generateStructureTransfer, uploadVideoFile } from "./apiClient";
import { agentResultSummary } from "./resultPresentationModel";
import {
  buildGeneratePayload,
  defaultForm,
  defaultResultTab,
  validateStartInputs as validateStartInputsForForm
} from "./workbenchConfig";
import {
  createHistoryEntry,
  historyTurnFromEntry,
  persistHistoryEntry,
  readHistoryEntries,
  writeHistoryEntries
} from "./historyStore";
import type { AgentRunResult, AgentTurn, AppForm, AppScreen, HistoryEntry, ResultTab, StartValidationErrors, UploadedVideo, UploadRole } from "./workbenchTypes";

export function useWorkbenchController() {
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [activeTab, setActiveTabState] = useState<ResultTab>(() => readResultTabFromUrl());
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sampleVideo, setSampleVideo] = useState<UploadedVideo | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [form, setForm] = useState<AppForm>(defaultForm);
  const [startValidationErrors, setStartValidationErrors] = useState<StartValidationErrors>({});
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(readHistoryEntries);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void loadDemo();
  }, []);

  useEffect(() => {
    const handlePopState = () => setActiveTabState(readResultTabFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!sampleVideo) return;
    setStartValidationErrors((current) => {
      if (!current.sampleVideo) return current;
      const next = { ...current };
      delete next.sampleVideo;
      return next;
    });
  }, [sampleVideo]);

  useEffect(() => {
    if (!form.prompt.trim()) return;
    setStartValidationErrors((current) => {
      if (!current.prompt) return current;
      const next = { ...current };
      delete next.prompt;
      return next;
    });
  }, [form.prompt]);

  useEffect(() => {
    return () => {
      if (sampleVideo?.previewUrl) URL.revokeObjectURL(sampleVideo.previewUrl);
    };
  }, [sampleVideo?.previewUrl]);

  const slots = result?.samples[0]?.slots ?? [];
  const matches = result?.generated.compositionPlan.slotMatches ?? [];
  const totalDuration = result?.generated.timeline.at(-1)?.endSec ?? form.targetDurationSec;
  const canGenerate = Boolean(sampleVideo?.id) && Boolean(form.prompt.trim());

  function setActiveTab(tab: ResultTab) {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === defaultResultTab) {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function showStart() {
    setScreen("start");
  }

  function showResult() {
    setScreen("result");
  }

  function showHistory() {
    setScreen("history");
  }

  function showBenchmark() {
    setActiveTab("benchmark");
    setScreen("result");
  }

  function validateStartInputs() {
    const nextErrors = validateStartInputsForForm(form, sampleVideo);
    setStartValidationErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function loadDemo() {
    setIsLoading(true);
    const data = await fetchDemoResult();
    startTransition(() => {
      setResult(data);
      setScreen("start");
      setActiveTab(defaultResultTab);
      setIsLoading(false);
    });
  }

  async function uploadVideo(file: File, role: UploadRole) {
    const uploaded = await uploadVideoFile(file, role);
    replaceSampleVideo(uploaded);
  }

  async function generate(extraInstruction?: string, options?: { requireStartInputs?: boolean }) {
    if (!result || isGenerating) return;
    if (options?.requireStartInputs && !validateStartInputs()) {
      setScreen("start");
      return;
    }

    setStartValidationErrors({});
    const visiblePrompt = (extraInstruction?.trim() || form.prompt.trim() || "请根据上传视频生成短视频方案").trim();
    const turnId = `${Date.now()}`;
    const nextTurn: AgentTurn = { id: turnId, prompt: visiblePrompt, status: "running", startedAt: Date.now() };
    const runningTurns = extraInstruction?.trim() ? [...agentTurns, nextTurn] : [nextTurn];
    const sourceVideoName = sampleVideo?.name;
    setAgentTurns(runningTurns);
    setIsGenerating(true);
    setScreen("result");
    if (!extraInstruction?.trim()) setActiveTab("demo");

    const payload = buildGeneratePayload(form, sampleVideo, extraInstruction);
    const [data] = await Promise.all([generateStructureTransfer(payload), delay(1800)]);

    startTransition(() => {
      const completedTurns = runningTurns.map((turn) => (turn.id === turnId ? { ...turn, status: "done" as const, result: data } : turn));
      setResult(data);
      setAgentTurns(completedTurns);
      setHistoryEntries((entries) => persistHistoryEntry(createHistoryEntry(data, visiblePrompt, sourceVideoName, completedTurns, agentResultSummary(data)), entries));
      setScreen("result");
      setIsGenerating(false);
      setRevisionPrompt("");
    });
  }

  function generateFromStart() {
    void generate(undefined, { requireStartInputs: true });
  }

  function regenerateFromRevision() {
    void generate(revisionPrompt.trim() || undefined);
  }

  function exportResult() {
    if (!result) return;
    downloadResultJson(result);
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setResult(entry.result);
    setAgentTurns([historyTurnFromEntry(entry)]);
    replaceSampleVideo(null);
    setActiveTab(defaultResultTab);
    setRevisionPrompt("");
    setScreen("result");
  }

  function deleteHistoryEntry(entryId: string) {
    setHistoryEntries((entries) => {
      const next = entries.filter((entry) => entry.id !== entryId);
      writeHistoryEntries(next);
      return next;
    });
  }

  function clearHistoryEntries() {
    setHistoryEntries([]);
    writeHistoryEntries([]);
  }

  function replaceSampleVideo(next: UploadedVideo | null) {
    setSampleVideo((previous) => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return next;
    });
  }

  return {
    result,
    screen,
    activeTab,
    isLoading,
    isGenerating,
    sampleVideo,
    revisionPrompt,
    form,
    startValidationErrors,
    agentTurns,
    historyEntries,
    slots: slots as StructureSlot[],
    matches: matches as SlotMatch[],
    totalDuration,
    canGenerate,
    setForm,
    setRevisionPrompt,
    setActiveTab,
    showStart,
    showResult,
    showBenchmark,
    showHistory,
    uploadVideo,
    generateFromStart,
    regenerateFromRevision,
    exportResult,
    openHistoryEntry,
    deleteHistoryEntry,
    clearHistoryEntries
  };
}

export function readResultTabFromUrl(): ResultTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return isResultTab(value) ? value : defaultResultTab;
}

function isResultTab(value: string | null): value is ResultTab {
  return value === "demo" || value === "benchmark" || value === "structure" || value === "gaps" || value === "timeline" || value === "packaging" || value === "versions";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
