import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GeneratedPlan, TimelineItem, VideoMetadata } from "@byteproject/shared";

export type ToolProtocol<I, O> = {
  name: string;
  inputSchema: string;
  outputSchema: string;
  requiredEnv: string[];
  filePermissions: string[];
  timeoutMs: number;
  fallback: string;
  run(input: I): Promise<O>;
};

export const videoAnalyzerAdapter: ToolProtocol<
  { filePath: string; fileName: string; role: "sample" | "material"; sizeBytes?: number },
  VideoMetadata
> = {
  name: "FFmpeg Video Analyzer",
  inputSchema: "{ filePath, fileName, role, sizeBytes }",
  outputSchema: "VideoMetadata",
  requiredEnv: ["FFPROBE_PATH"],
  filePermissions: ["UPLOAD_DIR", "TMP_DIR"],
  timeoutMs: 15_000,
  fallback: "Use deterministic mock metadata when ffprobe is unavailable.",
  async run(input) {
    const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
    try {
      const raw = await execJson(ffprobe, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        input.filePath
      ]);
      const data = JSON.parse(raw) as {
        format?: { duration?: string; size?: string };
        streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
      };
      const videoStream = data.streams?.find((stream) => stream.codec_type === "video");
      return {
        id: stableId(input.role, input.fileName),
        role: input.role,
        fileName: input.fileName,
        durationSec: Number(Number(data.format?.duration ?? 18).toFixed(1)),
        width: videoStream?.width ?? 1080,
        height: videoStream?.height ?? 1920,
        fps: parseFps(videoStream?.r_frame_rate),
        sizeBytes: Number(data.format?.size ?? input.sizeBytes ?? 0),
        localPath: input.filePath
      };
    } catch {
      return {
        id: stableId(input.role, input.fileName),
        role: input.role,
        fileName: input.fileName,
        durationSec: input.role === "sample" ? 18 : 48,
        width: 1080,
        height: 1920,
        fps: 30,
        sizeBytes: input.sizeBytes ?? 0,
        localPath: input.filePath
      };
    }
  }
};

export const remotionStoryboardAdapter: ToolProtocol<
  { plan: GeneratedPlan; outputDir: string },
  { url: string; path: string }
> = {
  name: "Remotion Storyboard Renderer",
  inputSchema: "{ plan, outputDir }",
  outputSchema: "{ url, path }",
  requiredEnv: [],
  filePermissions: ["OUTPUT_DIR"],
  timeoutMs: 10_000,
  fallback: "Create an HTML storyboard preview when Remotion renderer is not installed.",
  async run(input) {
    await mkdir(input.outputDir, { recursive: true });
    const fileName = `${input.plan.id}.html`;
    const outputPath = join(input.outputDir, fileName);
    await writeFile(outputPath, renderTimelineHtml(input.plan.timeline, input.plan.script), "utf8");
    return {
      path: outputPath,
      url: `/outputs/${fileName}`
    };
  }
};

function renderTimelineHtml(timeline: TimelineItem[], script: string) {
  const blocks = timeline
    .map(
      (item) => `
        <section class="shot">
          <div class="time">${item.startSec}s - ${item.endSec}s</div>
          <h2>${escapeHtml(item.caption)}</h2>
          <p>${escapeHtml(item.packaging.join(" / "))}</p>
          <span>${escapeHtml(item.transition ?? "顺切")}</span>
        </section>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>低保真成片 Demo</title>
  <style>
    body { margin: 0; background: #101113; color: #f7f1e8; font-family: "Microsoft YaHei", sans-serif; }
    main { width: min(420px, 100vw); margin: 0 auto; min-height: 100vh; background: #191b1f; }
    .shot { min-height: 220px; padding: 28px; border-bottom: 1px solid rgba(255,255,255,.12); display: grid; align-content: center; gap: 12px; }
    .time { color: #70e0c1; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h2 { font-size: 34px; line-height: 1.08; margin: 0; }
    p { margin: 0; color: #d4d7dc; line-height: 1.6; }
    span { color: #ffcf66; font-size: 13px; }
    pre { white-space: pre-wrap; padding: 24px; color: #b7bec9; }
  </style>
</head>
<body>
  <main>${blocks}<pre>${escapeHtml(script)}</pre></main>
</body>
</html>`;
}

function execJson(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

function parseFps(rate?: string) {
  if (!rate) return 30;
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!numerator || !denominator) return 30;
  return Number((numerator / denominator).toFixed(2));
}

function stableId(role: string, fileName: string) {
  return `${role}-${Buffer.from(fileName).toString("base64url").slice(0, 12)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

