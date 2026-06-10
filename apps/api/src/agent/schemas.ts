import { z } from "zod";
import { inferCreativeSkillIds } from "@byteproject/shared";
import type { SourceInput } from "@byteproject/shared";

export const creativeStrategySchema = z.enum(["balanced", "high_click", "high_conversion", "high_rhythm", "premium"]);

export const sourceInputSchema = z
  .object({
    sampleVideoIds: z.array(z.string()).optional(),
    materialVideoId: z.string().optional(),
    prompt: z.string().trim().optional(),
    productName: z.string().trim().optional(),
    sellingPoints: z.array(z.string()).optional(),
    targetAudience: z.string().trim().optional(),
    tone: z.string().trim().optional(),
    targetDurationSec: z.coerce.number().min(6).max(60).optional(),
    auxiliaryAssetIds: z.array(z.string()).optional(),
    strategy: creativeStrategySchema.optional()
  })
  .passthrough();

export const uploadRoleSchema = z.enum(["sample", "material"]);

export const uploadedFileSchema = z.object({
  originalname: z.string().min(1),
  path: z.string().min(1),
  size: z.number().nonnegative()
});

export function normalizeSourceInput(body: unknown): SourceInput {
  const parsed = sourceInputSchema.parse(body);
  const sampleVideoIds = parsed.sampleVideoIds?.length ? parsed.sampleVideoIds : ["sample-mock"];
  const source = {
    sampleVideoIds,
    materialVideoId: parsed.materialVideoId || sampleVideoIds[0],
    prompt: parsed.prompt || "把这段素材重构成一个高转化商品短视频",
    productName: parsed.productName || "未命名商品",
    sellingPoints: parsed.sellingPoints?.length ? parsed.sellingPoints : [],
    targetAudience: parsed.targetAudience || "目标用户",
    tone: parsed.tone || "专业、清晰、有节奏",
    targetDurationSec: parsed.targetDurationSec || 18,
    auxiliaryAssetIds: parsed.auxiliaryAssetIds ?? [],
    strategy: parsed.strategy || "balanced"
  };
  return {
    ...source,
    creativeSkillIds: inferCreativeSkillIds(source)
  };
}
