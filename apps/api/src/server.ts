import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import { remotionStoryboardAdapter, videoAnalyzerAdapter } from "@byteproject/adapters";
import { analyzeSampleVideo, composePlan, createMockTranscript, runMockPipeline, segmentLongVideo } from "@byteproject/core";
import { knowledgeStore } from "@byteproject/knowledge";
import type { SourceInput, VideoMetadata } from "@byteproject/shared";

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const uploadDir = resolve(process.env.UPLOAD_DIR ?? "data/uploads");
const outputDir = resolve(process.env.OUTPUT_DIR ?? "data/outputs");

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
    adapters: ["ffmpeg", "model", "knowledge", "remotion-preview"]
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
    const role = request.params.role === "sample" ? "sample" : "material";
    if (!request.file) {
      response.status(400).json({ error: "Missing video file." });
      return;
    }
    const metadata = await videoAnalyzerAdapter.run({
      role,
      fileName: request.file.originalname,
      filePath: request.file.path,
      sizeBytes: request.file.size
    });
    uploadedVideos.set(metadata.id, metadata);
    response.json({ video: metadata });
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze/sample", async (request, response) => {
  const video = getVideoOrMock(request.body.videoId, "sample");
  const transcript = Array.isArray(request.body.transcript) ? request.body.transcript : createMockTranscript(request.body.productName);
  const analysis = analyzeSampleVideo(video, transcript);
  response.json({ analysis, knowledge: knowledgeStore.list() });
});

app.post("/api/generate", async (request, response, next) => {
  try {
    const source = normalizeSourceInput(request.body);
    const sampleVideo = getVideoOrMock(source.sampleVideoIds[0], "sample");
    const materialVideo = getVideoOrMock(source.materialVideoId, "material");
    const sample = analyzeSampleVideo(sampleVideo, createMockTranscript(source.productName));
    const knowledge = knowledgeStore.retrieve({ vertical: "marketing", prompt: source.prompt, limit: 3 });
    const segments = segmentLongVideo(materialVideo, source.prompt);
    const generated = composePlan({ source, samples: [sample], knowledge, materialSegments: segments });
    const preview = await remotionStoryboardAdapter.run({ plan: generated, outputDir });
    generated.demo = {
      status: "rendered",
      url: preview.url,
      note: "已生成低保真 HTML 视频分镜预览；后续可替换为 Remotion MP4 渲染。"
    };

    response.json({
      mode: process.env.ENABLE_MOCK_GENERATION === "false" ? "real" : "mock",
      source,
      samples: [sample],
      knowledge,
      material: {
        video: materialVideo,
        segments
      },
      generated
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({
    error: error instanceof Error ? error.message : "Unknown server error"
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
    fileName: role === "sample" ? "爆款样例.mp4" : "评测长视频素材.mp4",
    durationSec: role === "sample" ? 18 : 48,
    width: 1080,
    height: 1920,
    fps: 30,
    sizeBytes: 0
  };
}

function normalizeSourceInput(body: Partial<SourceInput>): SourceInput {
  return {
    sampleVideoIds: body.sampleVideoIds?.length ? body.sampleVideoIds : ["sample-mock"],
    materialVideoId: body.materialVideoId || "material-mock",
    prompt: body.prompt || "把这段素材重构成一个高转化商品短视频",
    productName: body.productName || "智能随行杯",
    sellingPoints: body.sellingPoints?.length ? body.sellingPoints : ["一眼看见余量", "三种提醒模式", "轻巧不占包"],
    targetAudience: body.targetAudience || "通勤和运动人群",
    tone: body.tone || "清晰、有节奏、偏转化",
    targetDurationSec: body.targetDurationSec || 18,
    auxiliaryAssetIds: body.auxiliaryAssetIds ?? [],
    strategy: body.strategy || "balanced"
  };
}

