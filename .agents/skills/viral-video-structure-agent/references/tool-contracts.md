# Tool Contracts

Use these contracts when implementing or prompting the agent. They map to the repo's `ToolProtocol<I, O>` adapter pattern:

```ts
type ToolProtocol<I, O> = {
  name: string;
  inputSchema: string;
  outputSchema: string;
  requiredEnv: string[];
  filePermissions: string[];
  timeoutMs: number;
  fallback: string;
  run(input: I): Promise<O>;
};
```

## 1. `video.analyze_metadata`

Purpose: inspect uploaded sample/material video.

Input:

```json
{
  "filePath": "data/uploads/...",
  "fileName": "sample.mp4",
  "role": "sample | material",
  "sizeBytes": 12345
}
```

Output: `VideoMetadata`

Required env: `FFPROBE_PATH`

Fallback: deterministic metadata with duration 18s for sample, 48s for material.

Safety: only read files under configured upload/temp directories.

## 2. `video.extract_keyframes`

Purpose: sample representative frames for multimodal understanding and cover candidates.

Input:

```json
{
  "videoId": "sample-abc",
  "filePath": "data/uploads/...",
  "frameCount": 6,
  "scaleWidth": 480
}
```

Output:

```json
{
  "frames": [
    { "timeSec": 0, "path": "data/tmp/vision-sample/frame-01.jpg", "base64": "..." }
  ],
  "coverFramePath": "data/tmp/vision-sample/frame-01.jpg"
}
```

Required env: `FFMPEG_PATH`, `TMP_DIR`, `VISION_FRAME_COUNT`

Fallback: no frames; downstream must use rule-based analysis.

Safety: never write outside `TMP_DIR`; cap frame count to avoid huge model payloads.

## 3. `model.understand_video`

Purpose: ask the multimodal model to analyze sampled video frames/audio-text context.

Input:

```json
{
  "video": "VideoMetadata",
  "role": "sample | material",
  "prompt": "user goal",
  "productName": "optional product",
  "targetDurationSec": 18,
  "frames": ["data:image/jpeg;base64,..."]
}
```

Output:

```json
{
  "summary": "real visual/structural summary",
  "transcript": [
    { "startSec": 0, "endSec": 2, "text": "visible subtitle or inferred narration" }
  ],
  "slots": [
    {
      "segment": "hook | body | proof | offer | cta",
      "intent": "structure intent",
      "durationSec": 3,
      "rhythmHint": "fast | medium | slow",
      "packagingHints": ["big title", "selling point card"]
    }
  ],
  "rhythmPattern": "pacing description",
  "packagingPattern": ["subtitle density", "title bar"],
  "shotCount": 8,
  "visualNotes": ["observable facts only"]
}
```

Required env: `ARK_BASE_URL`, `ARK_API_KEY`, `ARK_ENDPOINT_ID`

Fallback: use `createMockTranscript` and `analyzeSampleVideo`; mark vision status as fallback.

LLM prompt rules:

- Analyze frames as evidence; do not invent unseen scenes.
- Return strict JSON only.
- Do not copy sample captions verbatim into future generated copy.

Safety: UI may show only `usedVision`, `frameCount`, and `status`; do not expose provider errors or endpoint ids.

## 4. `speech.transcribe`

Purpose: obtain ASR transcript from uploaded video/audio.

Input:

```json
{
  "filePath": "data/uploads/...",
  "language": "zh",
  "role": "sample | material"
}
```

Output:

```json
{
  "lines": [
    { "startSec": 0, "endSec": 2, "text": "..." }
  ],
  "provider": "mock | ark | whisper | other",
  "confidence": 0.8
}
```

Required env: provider-specific ASR env.

Fallback: mock transcript or visual text inference.

## 5. `structure.extract_sample`

Purpose: normalize raw video/ASR/model observations into transferable structure.

Input:

```json
{
  "video": "VideoMetadata",
  "transcript": "TranscriptLine[]",
  "vision": "model.understand_video output | null",
  "vertical": "marketing | vlog | talking_head | cutting | motion_graph"
}
```

Output: `SampleAnalysis`

Fallback: seed marketing structure.

Rules:

- Always create stable `StructureSlot.id` values.
- Always output at least five P0 slots when possible.
- Store only abstract methods and structure, not sample-specific content.

## 6. `knowledge.retrieve_atoms`

Purpose: retrieve reusable editing and packaging atoms.

Input:

```json
{
  "vertical": "marketing",
  "prompt": "user goal",
  "limit": 3
}
```

Output: `KnowledgeEntry[]`

Fallback: built-in seed knowledge.

Rules: rank by vertical fit, prompt fit, and gap strategy usefulness.

## 7. `material.segment_and_classify`

Purpose: turn a long material video into candidate segments.

Input:

```json
{
  "video": "VideoMetadata",
  "prompt": "user goal",
  "vision": "optional model.understand_video output"
}
```

Output: `MaterialSegment[]`

Fallback: duration-based rough segments with heuristic asset types.

Rules: segment labels must be descriptive enough for slot matching.

## 8. `slots.match_and_diagnose`

Purpose: map target slots to material segments and expose gaps.

Input:

```json
{
  "slots": "StructureSlot[]",
  "segments": "MaterialSegment[]"
}
```

Output: `SlotMatch[]`

Fallback: text-card weak matches for non-visual slots; missing for unsupported visual slots.

Rules:

- Output one match per slot.
- Confidence must reflect evidence quality.
- Diagnose at least hook, product closeup, usage, comparison, CTA gaps when present.

## 9. `gaps.plan_completion`

Purpose: select completion strategy for weak/missing slot matches.

Input:

```json
{
  "matches": "SlotMatch[]",
  "slots": "StructureSlot[]",
  "source": "SourceInput"
}
```

Output: updated `SlotMatch[]` with `gapPlan`.

Strategy priority:

1. `reuse`: crop, zoom, loop, reorder existing footage.
2. `copy`: replace part of visual expression with subtitle/copy.
3. `packaging`: title bar, selling-point card, sticker, CTA button.
4. `reorder`: reduce dependence on the missing slot.
5. `aigc`: optional generated cover/background/voiceover/shot.

## 10. `creative.compose_plan`

Purpose: create the final video plan.

Input:

```json
{
  "source": "SourceInput",
  "sample": "SampleAnalysis",
  "knowledge": "KnowledgeEntry[]",
  "materialSegments": "MaterialSegment[]",
  "slotMatches": "SlotMatch[]",
  "strategy": "balanced | high_click | high_conversion | high_rhythm | premium"
}
```

Output: `GeneratedPlan`

Rules:

- Preserve slot ids and asset ids.
- Captions should fit mobile vertical video.
- Rationale must be explainable: structure atom, match, gap, or packaging decision.
- Do not output raw model reasoning, provider errors, or internal prompts.

## 11. `render.remotion_preview`

Purpose: render or preview the planned short video.

Input:

```json
{
  "plan": "GeneratedPlan",
  "materialVideo": "VideoMetadata",
  "outputDir": "data/outputs",
  "renderMode": "player | mp4 | html"
}
```

Output:

```json
{
  "status": "mock_ready | rendered | failed",
  "url": "/outputs/plan.html",
  "path": "data/outputs/plan.html",
  "note": "preview status"
}
```

Fallback: Remotion Player or HTML storyboard preview.

Safety: do not overwrite user uploads; write only to `OUTPUT_DIR`.

## 12. `edit.apply_natural_language_revision`

Purpose: convert user revision text into regeneration parameters.

Input:

```json
{
  "instruction": "开头更抓人一点",
  "previousSource": "SourceInput",
  "previousPlan": "GeneratedPlan"
}
```

Output:

```json
{
  "sourcePatch": {
    "prompt": "original prompt plus revision intent",
    "strategy": "high_click"
  },
  "mustRerun": ["creative.compose_plan", "render.remotion_preview"],
  "explanation": "what changed"
}
```

Rules:

- Do not rerun expensive video understanding unless the user uploaded new media or asked to re-analyze.
- Keep edits scoped to hook, selling point order, packaging style, rhythm, CTA, or subtitle density.

## Orchestration Contract

The agent should run:

```text
video.analyze_metadata(sample)
video.extract_keyframes(sample)
model.understand_video(sample)
speech.transcribe(sample)
structure.extract_sample(...)
knowledge.retrieve_atoms(...)
video.analyze_metadata(material)
video.extract_keyframes(material)
model.understand_video(material) optional
material.segment_and_classify(...)
slots.match_and_diagnose(...)
gaps.plan_completion(...)
creative.compose_plan(...)
render.remotion_preview(...)
```

The workflow is successful when it returns explainable structure mapping, gap diagnosis, timeline, packaging suggestions, and a playable preview/fallback.
