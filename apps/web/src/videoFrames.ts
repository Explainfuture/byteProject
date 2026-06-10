import { frameSampleCountForDuration } from "@byteproject/shared";

export async function extractVideoFrameDataUrls(file: File) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 18;
    const frameCount = frameSampleCountForDuration(duration);
    const width = Math.max(1, video.videoWidth || 480);
    const height = Math.max(1, video.videoHeight || 854);
    const scale = Math.min(480 / width, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return [];

    const frames: string[] = [];
    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(Math.max(duration - 0.05, 0), Math.max(0, (duration * (index + 0.5)) / frameCount));
      video.currentTime = time;
      await waitForVideoEvent(video, "seeked");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.68));
    }
    return frames;
  } catch {
    return [];
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 4500);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Video ${eventName} failed`));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}
