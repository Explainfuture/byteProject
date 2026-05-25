import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type FakeVideoVariant = "click" | "conversion";

export const REMOTION_FAKE_VIDEO_FPS = 30;
export const REMOTION_FAKE_VIDEO_FRAMES = 540;
export const REMOTION_FAKE_VIDEO_WIDTH = 1080;
export const REMOTION_FAKE_VIDEO_HEIGHT = 1920;

type FakeVideoProps = {
  variant: FakeVideoVariant;
  productName: string;
  points: string[];
  audience: string;
};

const baseFont =
  '"Inter", "Geist", "SF Pro Text", "SF Pro Display", "Alibaba PuHuiTi", "HarmonyOS Sans SC", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

const variantCopy = {
  click: {
    eyebrow: "高点击版",
    hook: "通勤路上总忘喝水？",
    hookSub: "这个小提醒，比你想象中更懂你",
    tone: "#51406f",
    accent: "#c58a3a",
    cta: "先收藏，对照清单再选",
    closing: "3 秒看懂随行杯怎么挑"
  },
  conversion: {
    eyebrow: "高转化版",
    hook: "一只杯子，解决三件小事",
    hookSub: "看余量、提醒喝水、轻松带走",
    tone: "#3d2f55",
    accent: "#b47a2b",
    cta: "现在收藏，按需选择",
    closing: "适合通勤 / 健身 / 出行"
  }
} satisfies Record<FakeVideoVariant, Record<string, string>>;

export function MarketingFakeVideo(props: FakeVideoProps) {
  const frame = useCurrentFrame();
  const copy = variantCopy[props.variant];

  return (
    <AbsoluteFill style={canvasStyle(copy.tone)}>
      <BackgroundMotion tone={copy.tone} accent={copy.accent} />
      <Sequence from={0} durationInFrames={90}>
        <HookScene copy={copy} />
      </Sequence>
      <Sequence from={90} durationInFrames={120}>
        <ProductScene copy={copy} productName={props.productName} points={props.points} />
      </Sequence>
      <Sequence from={210} durationInFrames={150}>
        <UseCaseScene copy={copy} audience={props.audience} />
      </Sequence>
      <Sequence from={360} durationInFrames={90}>
        <BenefitScene copy={copy} points={props.points} />
      </Sequence>
      <Sequence from={450} durationInFrames={90}>
        <CtaScene copy={copy} productName={props.productName} />
      </Sequence>
      <BeatRail frame={frame} tone={copy.tone} />
    </AbsoluteFill>
  );
}

function BackgroundMotion(props: { tone: string; accent: string }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, REMOTION_FAKE_VIDEO_FRAMES], [-80, 80]);
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.52, 0.78]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 32%, rgba(0,0,0,0.3))"
        }}
      />
      <div
        style={{
          ...orbStyle,
          width: 520,
          height: 520,
          left: 620 + drift,
          top: 100,
          background: props.tone,
          opacity: pulse
        }}
      />
      <div
        style={{
          ...orbStyle,
          width: 440,
          height: 440,
          left: -120 - drift * 0.5,
          top: 1120,
          background: props.accent,
          opacity: 0.42
        }}
      />
      <div style={grainStyle} />
    </AbsoluteFill>
  );
}

function HookScene(props: { copy: Record<string, string> }) {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 34);
  const wordPop = spring({ frame: frame - 18, fps: REMOTION_FAKE_VIDEO_FPS, config: { damping: 14 } });

  return (
    <SceneShell progress={enter}>
      <Badge text={props.copy.eyebrow} tone={props.copy.tone} />
      <h1 style={{ ...headlineStyle, transform: `translateY(${(1 - enter) * 80}px)` }}>{props.copy.hook}</h1>
      <p style={subheadStyle}>{props.copy.hookSub}</p>
      <div style={{ ...questionMarkStyle, transform: `scale(${0.72 + wordPop * 0.28}) rotate(-8deg)` }}>?</div>
    </SceneShell>
  );
}

function ProductScene(props: { copy: Record<string, string>; productName: string; points: string[] }) {
  const frame = useCurrentFrame();
  const reveal = useSpring(0, 36);
  const lift = interpolate(frame, [0, 120], [36, -10]);

  return (
    <SceneShell progress={reveal}>
      <div style={productLayoutStyle}>
        <ProductCup tone={props.copy.tone} lift={lift} />
        <div style={productCardStyle}>
          <Badge text="商品亮相" tone={props.copy.tone} />
          <h2 style={titleStyle}>{props.productName}</h2>
          <ul style={pointListStyle}>
            {props.points.slice(0, 3).map((point, index) => (
              <li key={point} style={{ transform: `translateX(${(1 - reveal) * (36 + index * 14)}px)` }}>
                <span style={{ background: props.copy.tone }}>{index + 1}</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SceneShell>
  );
}

function UseCaseScene(props: { copy: Record<string, string>; audience: string }) {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 34);
  const cards = ["上班路上", "健身结束", "周末出行"];

  return (
    <SceneShell progress={enter}>
      <Badge text="场景证明" tone={props.copy.tone} />
      <h2 style={titleStyle}>{props.audience}</h2>
      <div style={useCaseGridStyle}>
        {cards.map((card, index) => {
          const local = frame - index * 10;
          const y = interpolate(Math.sin(local / 16), [-1, 1], [-10, 10]);
          return (
            <div key={card} style={{ ...useCaseCardStyle, transform: `translateY(${y}px)` }}>
              <span style={{ color: props.copy.tone }}>0{index + 1}</span>
              <strong>{card}</strong>
              <small>自动提醒，不打断节奏</small>
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
}

function BenefitScene(props: { copy: Record<string, string>; points: string[] }) {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 30], [80, 0], { extrapolateRight: "clamp" });
  const mainPoint = props.points[0] ?? "一眼看见余量";

  return (
    <SceneShell progress={1}>
      <div style={splitCardStyle}>
        <div style={{ ...beforeAfterStyle, background: "rgba(255,255,255,0.13)" }}>
          <span>Before</span>
          <strong>总是忘记补水</strong>
        </div>
        <div style={{ ...beforeAfterStyle, background: props.copy.tone, transform: `translateX(${slide}px)` }}>
          <span>After</span>
          <strong>{mainPoint}</strong>
        </div>
      </div>
      <p style={captionBarStyle}>用对比结构强化卖点可信度</p>
    </SceneShell>
  );
}

function CtaScene(props: { copy: Record<string, string>; productName: string }) {
  const enter = useSpring(0, 40);
  return (
    <SceneShell progress={enter}>
      <Badge text="CTA" tone={props.copy.tone} />
      <h2 style={headlineStyle}>{props.copy.closing}</h2>
      <div style={{ ...ctaCardStyle, transform: `scale(${0.9 + enter * 0.1})` }}>
        <strong>{props.productName}</strong>
        <span>{props.copy.cta}</span>
      </div>
    </SceneShell>
  );
}

function BeatRail(props: { frame: number; tone: string }) {
  const beats = [0, 90, 210, 360, 450];
  return (
    <div style={beatRailStyle}>
      {beats.map((beat, index) => (
        <span
          key={beat}
          style={{
            width: props.frame >= beat ? 92 : 42,
            background: props.frame >= beat ? props.tone : "rgba(255,255,255,0.18)"
          }}
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}

function ProductCup(props: { tone: string; lift: number }) {
  return (
    <div style={{ ...cupWrapStyle, transform: `translateY(${props.lift}px) rotate(-4deg)` }}>
      <div style={{ ...cupBodyStyle, background: `linear-gradient(160deg, #f9fafb, ${props.tone})` }}>
        <div style={cupWindowStyle} />
      </div>
      <div style={cupCapStyle} />
      <div style={cupGlowStyle} />
    </div>
  );
}

function Badge(props: { text: string; tone: string }) {
  return <span style={{ ...badgeStyle, color: props.tone, borderColor: props.tone }}>{props.text}</span>;
}

function SceneShell(props: { progress: number; children: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        padding: 92,
        justifyContent: "center",
        opacity: props.progress,
        transform: `scale(${0.96 + props.progress * 0.04})`
      }}
    >
      {props.children}
    </AbsoluteFill>
  );
}

function useSpring(fromFrame: number, duration: number) {
  const frame = useCurrentFrame();
  return spring({
    frame: Math.max(frame - fromFrame, 0),
    fps: REMOTION_FAKE_VIDEO_FPS,
    config: {
      damping: duration,
      stiffness: 120,
      mass: 0.8
    }
  });
}

function canvasStyle(tone: string): CSSProperties {
  return {
    overflow: "hidden",
    background: `linear-gradient(180deg, #1d1c19 0%, #2a2925 58%, ${tone} 150%)`,
    color: "#fff",
    fontFamily: baseFont
  };
}

const orbStyle: CSSProperties = {
  position: "absolute",
  borderRadius: "50%",
  filter: "blur(44px)"
};

const grainStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0.18,
  backgroundImage:
    "linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
  backgroundSize: "54px 54px"
};

const badgeStyle: CSSProperties = {
  width: "fit-content",
  border: "2px solid",
  borderRadius: 999,
  padding: "12px 20px",
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: "0.04em"
};

const headlineStyle: CSSProperties = {
  maxWidth: 820,
  margin: "34px 0 0",
  fontSize: 106,
  lineHeight: 1.02,
  fontWeight: 650,
  letterSpacing: 0
};

const titleStyle: CSSProperties = {
  margin: "28px 0 0",
  fontSize: 82,
  lineHeight: 1.08,
  fontWeight: 650,
  letterSpacing: 0
};

const subheadStyle: CSSProperties = {
  maxWidth: 760,
  margin: "28px 0 0",
  fontSize: 42,
  lineHeight: 1.35,
  color: "rgba(255,255,255,0.76)"
};

const questionMarkStyle: CSSProperties = {
  position: "absolute",
  right: 92,
  bottom: 180,
  width: 190,
  height: 190,
  display: "grid",
  placeItems: "center",
  borderRadius: 54,
  background: "rgba(255,255,255,0.12)",
  fontSize: 132,
  fontWeight: 650
};

const productLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "0.9fr 1.1fr",
  gap: 56,
  alignItems: "center"
};

const productCardStyle: CSSProperties = {
  minHeight: 620,
  padding: 54,
  borderRadius: 56,
  background: "rgba(255,255,255,0.12)",
  boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.12)"
};

const pointListStyle: CSSProperties = {
  display: "grid",
  gap: 24,
  margin: "52px 0 0",
  padding: 0,
  listStyle: "none",
  fontSize: 38,
  lineHeight: 1.25,
  fontWeight: 600
};

const cupWrapStyle: CSSProperties = {
  position: "relative",
  width: 310,
  height: 620,
  margin: "0 auto"
};

const cupBodyStyle: CSSProperties = {
  position: "absolute",
  inset: "80px 36px 0",
  borderRadius: "86px 86px 110px 110px",
  boxShadow: "0 50px 90px rgba(0,0,0,0.38)"
};

const cupCapStyle: CSSProperties = {
  position: "absolute",
  top: 24,
  left: 74,
  right: 74,
  height: 90,
  borderRadius: 42,
  background: "#f9fafb"
};

const cupWindowStyle: CSSProperties = {
  position: "absolute",
  left: 64,
  right: 64,
  top: 150,
  height: 210,
  borderRadius: 50,
  background: "rgba(17,24,39,0.72)"
};

const cupGlowStyle: CSSProperties = {
  position: "absolute",
  inset: "260px 78px auto",
  height: 110,
  borderRadius: 60,
  background: "rgba(255,255,255,0.42)",
  filter: "blur(22px)"
};

const useCaseGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 26,
  marginTop: 58
};

const useCaseCardStyle: CSSProperties = {
  minHeight: 186,
  display: "grid",
  gap: 8,
  alignContent: "center",
  padding: "34px 38px",
  borderRadius: 42,
  background: "rgba(255,255,255,0.12)",
  boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.1)"
};

const splitCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 20
};

const beforeAfterStyle: CSSProperties = {
  minHeight: 520,
  display: "grid",
  alignContent: "center",
  gap: 26,
  padding: 38,
  borderRadius: 52,
  fontSize: 42,
  fontWeight: 650
};

const captionBarStyle: CSSProperties = {
  marginTop: 36,
  padding: "22px 30px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 34,
  fontWeight: 600
};

const ctaCardStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  width: "100%",
  marginTop: 54,
  padding: 54,
  borderRadius: 56,
  background: "#fff",
  color: "#171717",
  boxShadow: "0 40px 90px rgba(0,0,0,0.32)"
};

const beatRailStyle: CSSProperties = {
  position: "absolute",
  left: 92,
  right: 92,
  bottom: 78,
  display: "flex",
  gap: 14
};
