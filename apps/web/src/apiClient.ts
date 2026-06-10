import { extractVideoFrameDataUrls } from "./videoFrames";
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

export async function generateStructureTransfer(payload: GeneratePayload): Promise<AgentRunResult> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return (await response.json()) as AgentRunResult;
}

export function downloadResultJson(result: AgentRunResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "structure-transfer-result.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
