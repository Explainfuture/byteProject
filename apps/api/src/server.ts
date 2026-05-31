import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { ZodError } from "zod";
import { videoAnalyzerAdapter } from "@byteproject/adapters";
import { runMockPipeline } from "@byteproject/core";
import { knowledgeStore } from "@byteproject/knowledge";
import type { VideoMetadata } from "@byteproject/shared";
import {
  analyzeSampleWithVision,
  normalizeSourceInput,
  publicSampleAnalysis,
  publicVideo,
  safeModelStatus,
  runStructureTransferAgent,
  uploadedFileSchema,
  uploadRoleSchema
} from "./structureAgent";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config();

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const uploadDir = resolve(process.env.UPLOAD_DIR ?? "data/uploads");
const outputDir = resolve(process.env.OUTPUT_DIR ?? "data/outputs");
const defaultMinVisionFrames = 4;
const defaultMaxVisionFrames = 16;
const defaultSecondsPerVisionFrame = 4;

await mkdir(uploadDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB ?? 512) * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use("/outputs", express.static(outputDir));

const uploadedVideos = new Map<string, VideoMetadata>();

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    mode: process.env.ENABLE_MOCK_GENERATION === "false" ? "real" : "mock-ready",
    orchestration: process.env.ENABLE_AGENT_TOOL_CALLING === "false" ? "deterministic" : "agent-tool-calling",
    adapters: ["ffmpeg", "vision-model", "model", "knowledge", "remotion-preview"]
  });
});

app.get("/api/demo", (_request, response) => {
  response.json(runMockPipeline());
});

app.get("/api/knowledge", (_request, response) => {
  response.json({ entries: knowledgeStore.list() });
});

app.post("/api/upload/:role", upload.single("video"), async (request, response, next) => {
  try {
    const role = uploadRoleSchema.parse(request.params.role);
    if (!request.file) {
      response.status(400).json({ error: "Missing video file." });
      return;
    }
    const file = uploadedFileSchema.parse(request.file);
    const metadata = await videoAnalyzerAdapter.run({
      role,
      fileName: file.originalname,
      filePath: file.path,
      sizeBytes: file.size
    });
    metadata.previewFrameDataUrls = parsePreviewFrames(request.body.previewFrames, metadata.durationSec);
    metadata.previewFrameCount = metadata.previewFrameDataUrls?.length;
    uploadedVideos.set(metadata.id, metadata);
    response.json({ video: publicVideo(metadata) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze/sample", async (request, response, next) => {
  try {
    const source = normalizeSourceInput(request.body);
    const video = getVideoOrMock(source.sampleVideoIds[0], "sample");
    const analysisResult = await analyzeSampleWithVision(video, source);
    response.json({
      analysis: publicSampleAnalysis(analysisResult.analysis),
      model: safeModelStatus(analysisResult.model),
      knowledge: knowledgeStore.list()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate", async (request, response, next) => {
  try {
    const source = normalizeSourceInput(request.body);
    const sampleVideo = getVideoOrMock(source.sampleVideoIds[0], "sample");
    const materialVideo =
      source.materialVideoId === source.sampleVideoIds[0]
        ? { ...sampleVideo, role: "material" as const }
        : getVideoOrMock(source.materialVideoId, "material");
    const result = await runStructureTransferAgent({
      source,
      sampleVideo,
      materialVideo,
      outputDir
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Invalid request payload.",
      issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    });
    return;
  }
  response.status(500).json({
    error: "Internal server error. The workflow has hidden provider details and local paths."
  });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

function getVideoOrMock(id: string | undefined, role: "sample" | "material"): VideoMetadata {
  if (id && uploadedVideos.has(id)) return uploadedVideos.get(id)!;
  return {
    id: id || `${role}-mock`,
    role,
    fileName: role === "sample" ? "上传视频.mp4" : "上传视频候选画面.mp4",
    durationSec: role === "sample" ? 18 : 48,
    width: 1080,
    height: 1920,
    fps: 30,
    sizeBytes: 0
  };
}

function parsePreviewFrames(value: unknown, durationSec?: number): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const frameCount = resolveVisionFrameCount(durationSec);
    const frames = parsed.filter((item): item is string => typeof item === "string" && /^data:image\/(jpeg|png);base64,/.test(item)).slice(0, frameCount);
    return frames.length ? frames : undefined;
  } catch {
    return undefined;
  }
}

function resolveVisionFrameCount(durationSec: number | undefined) {
  const configuredMin = Number(process.env.VISION_MIN_FRAME_COUNT ?? defaultMinVisionFrames);
  const configuredMax = Number(process.env.VISION_MAX_FRAME_COUNT ?? defaultMaxVisionFrames);
  const configuredSecondsPerFrame = Number(process.env.VISION_SECONDS_PER_FRAME ?? defaultSecondsPerVisionFrame);
  const minFrames = Number.isFinite(configuredMin) && configuredMin > 0 ? Math.round(configuredMin) : defaultMinVisionFrames;
  const maxFrames = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.max(minFrames, Math.round(configuredMax)) : defaultMaxVisionFrames;
  const secondsPerFrame = Number.isFinite(configuredSecondsPerFrame) && configuredSecondsPerFrame > 0 ? configuredSecondsPerFrame : defaultSecondsPerVisionFrame;
  const safeDuration = Number.isFinite(durationSec) && Number(durationSec) > 0 ? Number(durationSec) : 18;
  return Math.max(minFrames, Math.min(maxFrames, Math.ceil(safeDuration / secondsPerFrame)));
}
