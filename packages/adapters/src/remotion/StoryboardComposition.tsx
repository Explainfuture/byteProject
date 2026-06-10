import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const STORYBOARD_WIDTH = 1080;
export const STORYBOARD_HEIGHT = 1920;
export const STORYBOARD_FPS = 30;

type TimelineItem = {
  id: string;
  startSec: number;
  endSec: number;
  slotId: string;
  caption: string;
  packaging?: string[];
  transition?: string;
  beatHint?: string;
};

type PreviewVariant = {
  id?: string;
  track?: string;
  title?: string;
  description?: string;
  promptHint?: string;
};

type GeneratedPlanLike = {
  id: string;
  script?: string;
  timeline?: TimelineItem[];
  packagingSuggestions?: string[];
  previewVariants?: PreviewVariant[];
  rendererPrompt?: string;
};

export type StoryboardCompositionProps = {
  plan: GeneratedPlanLike;
  variant?: PreviewVariant;
};

type Theme = {
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  warm: string;
  cool: string;
};

const themes: Record<string, Theme> = {
  ecommerce_burst: {
    bg: "#12100c",
    bg2: "#1d2420",
    ink: "#fff7e8",
    muted: "#b9c2b8",
    accent: "#f2c94c",
    warm: "#ff735c",
    cool: "#5dd6c7"
  },
  review_contrast: {
    bg: "#0f1113",
    bg2: "#172525",
    ink: "#f7f4ea",
    muted: "#b8c6c3",
    accent: "#f5d36b",
    warm: "#e96b58",
    cool: "#6fc7d8"
  },
  b2b_marketing: {
    bg: "#101312",
    bg2: "#18201b",
    ink: "#f4fbf3",
    muted: "#b2c2b6",
    accent: "#72d09c",
    warm: "#dfb15f",
    cool: "#7ed7d1"
  },
  premium_brand: {
    bg: "#10100f",
    bg2: "#1f1d19",
    ink: "#f8f0de",
    muted: "#bdb5a5",
    accent: "#d3b46c",
    warm: "#e88960",
    cool: "#76c5b8"
  },
  cutting_beat: {
    bg: "#101112",
    bg2: "#201b22",
    ink: "#fff2ef",
    muted: "#c8bbc0",
    accent: "#ff8a4c",
    warm: "#f54f5f",
    cool: "#60d4e6"
  }
};

const fallbackTheme: Theme = {
  bg: "#111111",
  bg2: "#1d211e",
  ink: "#f7f1e4",
  muted: "#b7c0bb",
  accent: "#f0c85a",
  warm: "#f06f52",
  cool: "#61d2c2"
};

const fontStack =
  "Inter, Geist, SF Pro Display, SF Pro Text, Alibaba PuHuiTi, HarmonyOS Sans SC, Source Han Sans SC, Noto Sans SC, PingFang SC, Microsoft YaHei UI, Microsoft YaHei, sans-serif";

export function StoryboardComposition({ plan, variant }: StoryboardCompositionProps) {
  const frame = useCurrentFrame();
  const video = useVideoConfig();
  const timeline = normalizeTimeline(plan);
  const theme = resolveTheme(variant);

  return (
    <AbsoluteFill style={{ background: theme.bg, color: theme.ink, fontFamily: fontStack, overflow: "hidden" }}>
      <MotionField theme={theme} frame={frame} durationInFrames={video.durationInFrames} />
      {timeline.map((item, index) => {
        const from = Math.max(0, Math.round(item.startSec * video.fps));
        const durationInFrames = Math.max(1, Math.round((item.endSec - item.startSec) * video.fps));
        return (
          <Sequence key={item.id} from={from} durationInFrames={durationInFrames}>
            <Scene item={item} index={index} total={timeline.length} theme={theme} variant={variant} />
          </Sequence>
        );
      })}
      <PersistentHud plan={plan} variant={variant} theme={theme} frame={frame} durationInFrames={video.durationInFrames} />
    </AbsoluteFill>
  );
}

export function resolveStoryboardDurationInFrames(props: StoryboardCompositionProps) {
  return Math.max(1, Math.round(resolvePlanDuration(props.plan) * STORYBOARD_FPS));
}

function Scene(props: { item: TimelineItem; index: number; total: number; theme: Theme; variant?: PreviewVariant }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 120, mass: 0.65 } });
  const exit = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const kind = slotKind(props.item.slotId);
  const captionLines = splitForVideo(props.item.caption || fallbackCaption(), kind === "hook" ? 9 : 11, 4);
  const packaging = normalizePackaging(props.item.packaging);
  const y = interpolate(enter, [0, 1], [72, 0]);
  const opacity = enter * exit;

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${y}px)` }}>
        <SceneGlyph kind={kind} theme={props.theme} progress={progress} />
        <div style={{ position: "absolute", left: 74, right: 74, top: 128 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: props.theme.muted, fontSize: 24, letterSpacing: 3, textTransform: "uppercase" }}>
            <span>{`PART ${String(props.index + 1).padStart(2, "0")} / ${kind}`}</span>
            <span>{formatTime(props.item.startSec)}</span>
          </div>
          <div style={{ height: 1, marginTop: 24, background: `linear-gradient(90deg, ${props.theme.accent}, rgba(255,255,255,0.18), transparent)` }} />
        </div>

        <div style={{ position: "absolute", left: 86, right: 86, top: kind === "hook" ? 438 : 384 }}>
          <div style={{ color: props.theme.accent, fontSize: 26, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase", marginBottom: 34 }}>
            {sceneDirection(props.item.transition)}
          </div>
          <div>
            {captionLines.map((line, lineIndex) => {
              const lineIn = spring({ frame: frame - lineIndex * 4, fps, config: { damping: 18, stiffness: 130 } });
              return (
                <div
                  key={`${line}-${lineIndex}`}
                  style={{
                    fontSize: captionFontSize(captionLines, kind),
                    lineHeight: 0.98,
                    fontWeight: 900,
                    letterSpacing: 0,
                    textShadow: "0 10px 36px rgba(0,0,0,0.52)",
                    transform: `translateX(${(1 - lineIn) * -80}px)`,
                    opacity: lineIn,
                    marginBottom: 18
                  }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: "absolute", left: 92, right: 92, top: 1120 }}>
          <BeatList items={packaging} theme={props.theme} frame={frame} />
        </div>

        <div style={{ position: "absolute", left: 92, right: 92, bottom: 210, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
          <div style={{ color: props.theme.muted, fontSize: 26, lineHeight: 1.35, maxWidth: 640 }}>
            {props.item.beatHint || props.item.transition || "Kinetic cut, keep the structure visible."}
          </div>
          <div style={{ width: 206, height: 206 }}>
            <BeatDial progress={progress} theme={props.theme} label={String(props.index + 1).padStart(2, "0")} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function MotionField(props: { theme: Theme; frame: number; durationInFrames: number }) {
  const drift = interpolate(props.frame, [0, Math.max(1, props.durationInFrames)], [-90, 90]);
  const rotate = interpolate(props.frame, [0, Math.max(1, props.durationInFrames)], [-5, 5]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 22% 18%, ${hexAlpha(props.theme.cool, 0.2)}, transparent 32%), radial-gradient(circle at 84% 72%, ${hexAlpha(
            props.theme.warm,
            0.16
          )}, transparent 34%), linear-gradient(180deg, ${props.theme.bg}, ${props.theme.bg2})`
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          transform: `translateX(${drift * 0.24}px) translateY(${drift * -0.18}px)`
        }}
      />
      <svg width={STORYBOARD_WIDTH} height={STORYBOARD_HEIGHT} viewBox={`0 0 ${STORYBOARD_WIDTH} ${STORYBOARD_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
        <g fill="none" strokeLinecap="round" transform={`translate(${drift}, 0) rotate(${rotate} 540 960)`}>
          <circle cx="840" cy="360" r="300" stroke={props.theme.accent} strokeOpacity="0.24" strokeWidth="2" />
          <circle cx="828" cy="360" r="214" stroke={props.theme.ink} strokeOpacity="0.13" strokeWidth="1" />
          <path d="M-80 1538 C210 1476 322 1580 560 1518 S942 1408 1160 1484" stroke={props.theme.cool} strokeOpacity="0.32" strokeWidth="5" />
          <path d="M-120 320 C190 382 354 260 620 330 S908 450 1200 330" stroke={props.theme.warm} strokeOpacity="0.22" strokeWidth="3" />
        </g>
        {Array.from({ length: 7 }).map((_, index) => (
          <line
            key={index}
            x1={96 + index * 148}
            x2={96 + index * 148}
            y1="182"
            y2="1736"
            stroke={props.theme.ink}
            strokeOpacity={index % 2 ? 0.06 : 0.1}
            strokeWidth="1"
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
}

function SceneGlyph(props: { kind: string; theme: Theme; progress: number }) {
  const dash = 820 - props.progress * 620;
  const label = props.kind.toUpperCase();

  return (
    <svg width={STORYBOARD_WIDTH} height={STORYBOARD_HEIGHT} viewBox={`0 0 ${STORYBOARD_WIDTH} ${STORYBOARD_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="540" cy="824" r="390" stroke={props.theme.ink} strokeOpacity="0.1" strokeWidth="2" strokeDasharray="16 26" />
        <circle cx="540" cy="824" r="306" stroke={props.theme.accent} strokeOpacity="0.34" strokeWidth="7" strokeDasharray={`${dash} 980`} />
        {props.kind === "proof" ? (
          <>
            <path d="M250 716 C372 596 480 594 540 728 C612 872 748 866 858 704" stroke={props.theme.cool} strokeOpacity="0.66" strokeWidth="9" />
            <path d="M230 912 L854 912" stroke={props.theme.warm} strokeOpacity="0.66" strokeWidth="5" strokeDasharray="20 22" />
          </>
        ) : props.kind === "cta" ? (
          <>
            <circle cx="540" cy="824" r="180" stroke={props.theme.warm} strokeOpacity="0.54" strokeWidth="6" />
            <path d="M540 606 L540 1042 M322 824 L758 824" stroke={props.theme.cool} strokeOpacity="0.46" strokeWidth="5" />
          </>
        ) : props.kind === "body" ? (
          <path d="M264 984 L386 892 L500 910 L626 760 L752 786 L854 670" stroke={props.theme.cool} strokeOpacity="0.7" strokeWidth="9" />
        ) : props.kind === "offer" ? (
          <path d="M248 740 C344 662 442 660 540 740 S736 818 836 740 M288 944 C418 874 662 874 792 944" stroke={props.theme.warm} strokeOpacity="0.62" strokeWidth="8" />
        ) : (
          <path d="M250 824 L846 824 M540 526 L540 1122 M330 616 L750 1036 M750 616 L330 1036" stroke={props.theme.cool} strokeOpacity="0.5" strokeWidth="5" />
        )}
      </g>
      <text x="540" y="884" textAnchor="middle" fontFamily={fontStack} fontSize="178" fontWeight="900" fill={props.theme.ink} opacity="0.045" letterSpacing="0">
        {label}
      </text>
    </svg>
  );
}

function BeatList(props: { items: string[]; theme: Theme; frame: number }) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {props.items.slice(0, 4).map((item, index) => {
        const reveal = spring({ frame: props.frame - index * 7, fps: STORYBOARD_FPS, config: { damping: 16, stiffness: 110 } });
        return (
          <div
            key={`${item}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "52px 1fr",
              alignItems: "center",
              columnGap: 24,
              opacity: reveal,
              transform: `translateY(${(1 - reveal) * 28}px)`
            }}
          >
            <div style={{ height: 52, width: 52, borderRadius: 52, border: `2px solid ${hexAlpha(props.theme.accent, 0.8)}`, display: "grid", placeItems: "center", color: props.theme.accent, fontSize: 20, fontWeight: 900 }}>
              {index + 1}
            </div>
            <div style={{ borderBottom: `1px solid ${hexAlpha(props.theme.ink, 0.2)}`, paddingBottom: 14, color: props.theme.ink, fontSize: 34, lineHeight: 1.22, fontWeight: 750 }}>
              {limitText(item, 28)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BeatDial(props: { progress: number; theme: Theme; label: string }) {
  const radius = 82;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg viewBox="0 0 206 206" width="206" height="206">
      <circle cx="103" cy="103" r={radius} fill="none" stroke={props.theme.ink} strokeOpacity="0.13" strokeWidth="10" />
      <circle
        cx="103"
        cy="103"
        r={radius}
        fill="none"
        stroke={props.theme.accent}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - props.progress)}
        transform="rotate(-90 103 103)"
      />
      <text x="103" y="115" textAnchor="middle" fontFamily={fontStack} fontSize="52" fontWeight="900" fill={props.theme.ink}>
        {props.label}
      </text>
    </svg>
  );
}

function PersistentHud(props: { plan: GeneratedPlanLike; variant?: PreviewVariant; theme: Theme; frame: number; durationInFrames: number }) {
  const progress = interpolate(props.frame, [0, Math.max(1, props.durationInFrames - 1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const title = props.variant?.title || props.variant?.track || "Remotion render";

  return (
    <>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 84, height: 2, background: hexAlpha(props.theme.ink, 0.16) }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${props.theme.accent}, ${props.theme.cool})` }} />
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 30, display: "flex", justifyContent: "space-between", color: props.theme.muted, fontSize: 19, letterSpacing: 2, textTransform: "uppercase" }}>
        <span>{limitText(title, 28)}</span>
        <span>{props.plan.id}</span>
      </div>
    </>
  );
}

function resolveTheme(variant?: PreviewVariant) {
  if (!variant?.track) return fallbackTheme;
  return themes[variant.track] ?? fallbackTheme;
}

function normalizeTimeline(plan: GeneratedPlanLike) {
  const timeline = plan.timeline?.length ? plan.timeline : [];
  return timeline
    .filter((item) => Number.isFinite(item.startSec) && Number.isFinite(item.endSec) && item.endSec > item.startSec)
    .slice(0, 20)
    .map((item, index) => ({
      ...item,
      id: item.id || `beat-${index + 1}`,
      slotId: item.slotId || `beat-${index + 1}`,
      caption: item.caption || "",
      packaging: normalizePackaging(item.packaging)
    }));
}

function normalizePackaging(items?: string[]) {
  const filtered = (items ?? []).map((item) => item.trim()).filter(Boolean);
  return filtered.slice(0, 4);
}

function resolvePlanDuration(plan: GeneratedPlanLike) {
  const timeline = normalizeTimeline(plan);
  const end = timeline.at(-1)?.endSec ?? 18;
  return Math.max(1, Math.min(60, end));
}

function slotKind(slotId: string | undefined) {
  const value = (slotId ?? "").toLowerCase();
  if (value.includes("hook")) return "hook";
  if (value.includes("proof")) return "proof";
  if (value.includes("offer")) return "offer";
  if (value.includes("cta")) return "cta";
  if (value.includes("body") || value.includes("product")) return "body";
  return "beat";
}

function fallbackCaption() {
  return "";
}

function sceneDirection(transition?: string) {
  if (transition) return limitText(transition, 32);
  return "ANALYSIS BEAT";
}

function splitForVideo(value: string, maxChars: number, maxLines: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return [" "];
  const chars = Array.from(cleaned);
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(""));
  }
  return lines.slice(0, maxLines);
}

function captionFontSize(lines: string[], kind: string) {
  const longest = Math.max(...lines.map((line) => Array.from(line).length), 1);
  const base = kind === "hook" ? 128 : 108;
  if (longest > 16) return base - 28;
  if (longest > 12) return base - 16;
  return base;
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `00:${String(seconds).padStart(2, "0")}`;
}

function limitText(value: string, maxChars: number) {
  const chars = Array.from(value);
  return chars.length <= maxChars ? value : `${chars.slice(0, maxChars - 1).join("")}...`;
}

function hexAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
