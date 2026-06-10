import { extractVideoFrameDataUrls } from "./videoFrames";
import type { AgentStreamEvent } from "@byteproject/shared";
import type { AgentRunResult, GeneratePayload, UploadedVideo, UploadRole } from "./workbenchTypes";

export async function fetchDemoResult(): Promise<AgentRunResult> {
  const response = await fetch("/api/demo");
  return (await response.json()) as AgentRunResult;
}

export async function uploadVideoFile(file: File, role: UploadRole): Promise<UploadedVideo> {
  const body = new FormData();
  body.append("video", file);
  const previewFrames = await extractVideoFrameDataUrls(file);
  if (previewFrames.length) body.append("previewFrames", JSON.stringify(previewFrames));
  const response = await fetch(`/api/upload/${role}`, {
    method: "POST",
    body
  });
  const data = (await response.json()) as { video: { id: string; fileName: string } };
  return {
    id: data.video.id,
    name: data.video.fileName || file.name,
    previewUrl: URL.createObjectURL(file),
    posterUrl: previewFrames[Math.min(2, previewFrames.length - 1)]
  };
}

export async function generateStructureTransferStream(
  payload: GeneratePayload,
  onEvent: (event: AgentStreamEvent) => void
): Promise<AgentRunResult> {
  const response = await fetch("/api/generate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Generate stream failed with HTTP ${response.status}`);
  if (!response.body) throw new Error("Generate stream is unavailable in this browser.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AgentRunResult | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (!event) continue;
      onEvent(event);
      if (event.type === "run_result") result = event.result as AgentRunResult;
      if (event.type === "run_error") throw new Error(event.error);
    }
  }

  if (buffer.trim()) {
    const event = parseSseFrame(buffer);
    if (event) {
      onEvent(event);
      if (event.type === "run_result") result = event.result as AgentRunResult;
      if (event.type === "run_error") throw new Error(event.error);
    }
  }

  if (!result) throw new Error("Generate stream ended before returning a result.");
  return result;
}

export function downloadResultJson(result: AgentRunResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "structure-transfer-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseSseFrame(frame: string): AgentStreamEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  return JSON.parse(data) as AgentStreamEvent;
}
