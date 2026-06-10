import { resolve } from "node:path";
import type { SampleAnalysis, VideoMetadata } from "@byteproject/shared";
import type { VideoUnderstandingResult } from "./types";

export function publicVideo(video: VideoMetadata): VideoMetadata {
  return {
    id: video.id,
    role: video.role,
    fileName: video.fileName,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    fps: video.fps,
    sizeBytes: video.sizeBytes,
    coverUrl: video.coverUrl,
    previewFrameCount: video.previewFrameCount ?? video.previewFrameDataUrls?.length
  };
}

export function publicSampleAnalysis(sample: SampleAnalysis): SampleAnalysis {
  return {
    ...sample,
    video: publicVideo(sample.video)
  };
}

export function safeModelStatus(model: VideoUnderstandingResult) {
  return {
    provider: model.provider,
    usedVision: Boolean(model.analysis),
    frameCount: model.frameCount ?? 0,
    status: model.analysis ? "ok" : "fallback",
    error: model.analysis ? undefined : publicModelFailureReason(model.error)
  };
}

export function publicFallbackReason(reason: string) {
  if (/401|api key|authentication|bearer|credential|not configured/i.test(reason)) return "在线工具调用鉴权失败";
  if (/endpoint/i.test(reason)) return "在线模型 endpoint 配置不可用";
  if (/fetch failed|network|ENOTFOUND|ECONN/i.test(reason)) return "在线模型网络请求失败";
  if (/ark/i.test(reason)) return "在线工具调用暂不可用";
  return reason.slice(0, 120);
}

export function publicModelFailureReason(error: string | undefined) {
  if (!error) return "在线模型未返回有效视觉结果";
  if (/401|api key|authentication|bearer/i.test(error)) return "在线模型鉴权失败，未生成预设兜底结果";
  if (/credential|not configured|replace_me/i.test(error)) return "在线模型凭证未配置，未生成预设兜底结果";
  if (/endpoint/i.test(error)) return "在线模型 endpoint 配置不可用";
  if (/fetch failed|network|ENOTFOUND|ECONN/i.test(error)) return "在线模型网络请求失败";
  if (/No frames|spawn|ffmpeg|frame/i.test(error)) return "视频关键帧抽取失败";
  return "在线模型暂不可用";
}

export function resolveOutputDir(value?: string) {
  return resolve(value ?? process.env.OUTPUT_DIR ?? "data/outputs");
}

export function getFrameCount(video: VideoMetadata, model?: VideoUnderstandingResult) {
  return model?.frameCount ?? video.previewFrameDataUrls?.length ?? 0;
}

export function hasUploadedVideo(video: VideoMetadata) {
  return Boolean(video.localPath || video.previewFrameDataUrls?.length || video.sizeBytes > 0);
}
