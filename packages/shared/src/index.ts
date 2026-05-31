export type CreativeStrategy = "balanced" | "high_click" | "high_conversion" | "high_rhythm" | "premium";

export type VideoStyleTrack =
  | "ecommerce_burst"
  | "review_contrast"
  | "b2b_marketing"
  | "talking_head_knowledge"
  | "vlog_lifestyle"
  | "motion_graph_explainer"
  | "event_promo"
  | "tutorial_steps"
  | "premium_brand"
  | "cutting_beat";

export type SegmentKind = "hook" | "body" | "proof" | "offer" | "cta";

export type AssetType =
  | "product_closeup"
  | "usage"
  | "comparison"
  | "person"
  | "scene"
  | "text_card"
  | "cover";

export type MatchStatus = "matched" | "weak_match" | "missing";

export type GapStrategy = "copy" | "packaging" | "reorder" | "reuse" | "aigc";

export type SourceInput = {
  sampleVideoIds: string[];
  materialVideoId: string;
  prompt: string;
  productName: string;
  sellingPoints: string[];
  targetAudience: string;
  tone: string;
  targetDurationSec: number;
  auxiliaryAssetIds: string[];
  strategy: CreativeStrategy;
};

export type VideoMetadata = {
  id: string;
  fileName: string;
  role: "sample" | "material";
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  coverUrl?: string;
  localPath?: string;
  previewFrameDataUrls?: string[];
  previewFrameCount?: number;
};

export type TranscriptLine = {
  startSec: number;
  endSec: number;
  text: string;
};

export type StructureSlot = {
  id: string;
  segment: SegmentKind;
  intent: string;
  requiredAssetTypes: AssetType[];
  durationSec: number;
  importance: "high" | "medium" | "low";
  rhythmHint: "fast" | "medium" | "slow";
  packagingHints: string[];
};

export type TechniqueAtom = {
  id: string;
  kind: "hook" | "rhythm" | "slot" | "packaging" | "transition" | "cta" | "gap_fill";
  name: string;
  intent: string;
  applicableWhen: string[];
  constraints: string[];
  outputHint: string;
};

export type KnowledgeEntry = {
  id: string;
  title: string;
  source: "seed" | "sample_video" | "material_video";
  vertical: "marketing" | "vlog" | "talking_head" | "cutting" | "motion_graph";
  atoms: TechniqueAtom[];
  structureSlots: StructureSlot[];
  rhythmPattern: string;
  packagingPattern: string[];
  applicableWhen: string[];
};

export type SampleAnalysis = {
  video: VideoMetadata;
  transcript: TranscriptLine[];
  summary: string;
  slots: StructureSlot[];
  atoms: TechniqueAtom[];
  rhythmPattern: string;
  packagingPattern: string[];
  shotCount: number;
};

export type MaterialSegment = {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  assetTypes: AssetType[];
  confidence: number;
  notes: string;
};

export type SlotMatch = {
  slotId: string;
  status: MatchStatus;
  assetIds: string[];
  confidence: number;
  reason: string;
  gapPlan?: {
    strategy: GapStrategy;
    output: string;
  };
};

export type CompositionPlan = {
  id: string;
  strategy: CreativeStrategy;
  selectedAtomIds: string[];
  slotMatches: SlotMatch[];
  rationale: string[];
};

export type TimelineItem = {
  id: string;
  startSec: number;
  endSec: number;
  slotId: string;
  assetIds: string[];
  caption: string;
  packaging: string[];
  transition?: string;
  beatHint?: string;
};

export type PreviewVariant = {
  id: string;
  track: VideoStyleTrack;
  title: string;
  description: string;
  renderer: "remotion" | "hyperframes";
  targetDurationSec: number;
  frameBudget: {
    minFrames: number;
    maxFrames: number;
    secondsPerFrame: number;
  };
  promptHint: string;
};

export type StoryboardItem = {
  id: string;
  slotId: string;
  title: string;
  visual: string;
  caption: string;
  reason: string;
};

export type GeneratedPlan = {
  id: string;
  script: string;
  storyboard: StoryboardItem[];
  timeline: TimelineItem[];
  compositionPlan: CompositionPlan;
  packagingSuggestions: string[];
  rendererPrompt: string;
  previewVariants: PreviewVariant[];
  demo: {
    status: "mock_ready" | "rendered" | "failed";
    url?: string;
    note: string;
  };
};

export type RunResult = {
  mode: "mock" | "real";
  source: SourceInput;
  samples: SampleAnalysis[];
  knowledge: KnowledgeEntry[];
  material: {
    video: VideoMetadata;
    segments: MaterialSegment[];
  };
  generated: GeneratedPlan;
};
