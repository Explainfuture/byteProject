import React from "react";
import { Composition, registerRoot } from "remotion";
import {
  STORYBOARD_FPS,
  STORYBOARD_HEIGHT,
  STORYBOARD_WIDTH,
  StoryboardComposition,
  resolveStoryboardDurationInFrames
} from "./StoryboardComposition";
import type { StoryboardCompositionProps } from "./StoryboardComposition";

const defaultProps: StoryboardCompositionProps = {
  plan: {
    id: "preview",
    timeline: [
      {
        id: "preview-hook",
        startSec: 0,
        endSec: 4,
        slotId: "hook",
        caption: "Hook the first three seconds",
        packaging: ["strong opening", "fast rhythm"]
      },
      {
        id: "preview-body",
        startSec: 4,
        endSec: 13,
        slotId: "body",
        caption: "Unpack the structure in clear beats",
        packaging: ["step reveal", "proof cue"]
      },
      {
        id: "preview-cta",
        startSec: 13,
        endSec: 18,
        slotId: "cta",
        caption: "Close with one action",
        packaging: ["simple CTA"]
      }
    ]
  },
  variant: {
    track: "ecommerce_burst",
    title: "Remotion storyboard"
  }
};

function RemotionRoot() {
  return (
    <Composition
      id="ByteProjectStoryboard"
      component={StoryboardComposition}
      durationInFrames={STORYBOARD_FPS * 18}
      fps={STORYBOARD_FPS}
      width={STORYBOARD_WIDTH}
      height={STORYBOARD_HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: resolveStoryboardDurationInFrames(props),
        fps: STORYBOARD_FPS,
        width: STORYBOARD_WIDTH,
        height: STORYBOARD_HEIGHT
      })}
    />
  );
}

registerRoot(RemotionRoot);
