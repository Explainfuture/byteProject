---
name: viral-video-structure-agent
description: "Runs the PRD workflow for an AI short-video structure-transfer agent: sample video understanding, structure extraction, material adaptation, gap diagnosis, creative composition, Remotion/FFmpeg preview, and natural-language revisions. Use when building, debugging, or operating this project as an agent that turns viral sample videos plus new material into explainable short-video plans and demos."
---

# Viral Video Structure Agent

## Core Rule

Transfer creative structure, not source content. Never copy the sample video's exact visuals, audio, brand, people, subtitles, or original copy into the new result. Extract reusable methods: hook pattern, pacing, slot sequence, packaging technique, transition logic, and CTA strategy.

## Load When Needed

Read `references/tool-contracts.md` before adding or modifying any agent tool, prompt, model adapter, orchestration step, or output schema.

## Agent Workflow

Run this pipeline in order. Each step must produce structured data that the next step can consume.

1. Ingest sample videos.
   - Read metadata, duration, resolution, fps, cover/keyframes, and rough shot count.
   - If FFmpeg and model credentials are available, extract keyframes and call multimodal video understanding.
   - If ASR is available, transcribe audio. Otherwise infer only from visible text/keyframes and mark confidence lower.
   - Output `SampleAnalysis`.

2. Extract transferable structure.
   - Convert sample observations into `StructureSlot[]`, `TechniqueAtom[]`, rhythm pattern, packaging pattern, and transcript overview.
   - Required P0 slot sequence: `hook`, `body`, `proof`, `offer`, `cta`.
   - Required structure layers: script/paragraph, rhythm, material slot. Packaging is a recommendation layer in P0.
   - Persist reusable atoms to the knowledge store.

3. Ingest new content and material.
   - Normalize prompt, product name, selling points, audience, tone, target duration, and strategy.
   - Segment a long material video into candidate segments.
   - Classify each segment by asset type: `product_closeup`, `usage`, `comparison`, `person`, `scene`, `text_card`, `cover`.
   - Output `MaterialSegment[]`.

4. Retrieve knowledge and match slots.
   - Retrieve relevant knowledge atoms for the vertical and prompt.
   - Match each `StructureSlot` to candidate material segments.
   - Assign `matched`, `weak_match`, or `missing` with confidence and reason.

5. Diagnose and fill gaps.
   - Identify missing hook shot, product closeup, usage process, comparison, and CTA at minimum.
   - Choose the least risky completion strategy:
     `reuse` existing material first, then `copy`/subtitle, then `packaging`, then `reorder`, then optional `aigc`.
   - Explain impact and completion plan in short product-facing language.

6. Compose the new video plan.
   - Build a new `CompositionPlan`; do not mechanically clone the sample timeline.
   - Produce script, storyboard, timeline, packaging suggestions, and rationale.
   - Keep default output duration around 10-20 seconds unless the user explicitly asks otherwise.
   - Timeline items must include timecode, slot id, asset ids, caption, packaging, transition, and beat hint.

7. Render or preview.
   - Use Remotion for the primary visual preview path.
   - Use FFmpeg for metadata, frame extraction, overlays, concatenation, and compression when available.
   - If MP4 rendering is unavailable, return a Remotion/player preview and structured export; do not block the workflow.

8. Revise from natural language.
   - Translate commands like "make the opening stronger" into parameter deltas: hook intensity, selling point order, subtitle density, rhythm, CTA, or packaging style.
   - Reuse prior analysis; rerun slot matching/composition/render only as needed.

## LLM Instructions

When acting as the creative model:

- Return strict JSON for machine steps. No Markdown inside JSON.
- Prefer concise Chinese copy for UI-facing captions.
- Preserve stable ids (`slotId`, `timeline.id`, `assetIds`) unless explicitly asked to regenerate from scratch.
- Keep captions short enough for vertical video: usually <= 22 Chinese characters.
- Explain decisions with observable evidence: sample structure, material match, gap, or selected atom.
- Mark uncertainty instead of inventing facts about unseen footage.
- If a tool fails, continue with the documented fallback and surface a product-facing status, not raw provider errors.

## Required Outputs

Every successful generation must include:

- `SampleAnalysis`: what was extracted from the sample.
- `KnowledgeEntry[]`: which reusable atoms were available or created.
- `MaterialSegment[]`: candidate segments from new material.
- `SlotMatch[]`: slot mapping and gap diagnosis.
- `CompositionPlan`: selected atoms, rationale, and strategy.
- `script`, `storyboard`, `timeline`, `packagingSuggestions`.
- A playable preview or a clear preview fallback.

## Safety Boundaries

- Do not expose API keys, endpoint ids, raw model errors, local absolute upload paths, or provider stack traces to the user UI.
- Do not persist user evaluation material into public repo files.
- Do not fetch remote video URLs unless explicitly enabled by configuration.
- Do not claim real video understanding if the model path fell back to mock/rules.
- Distinguish original user material, derived material, and AI/AIGC completion material in exports.
