// path: components/design-system/motion-section.tsx
"use client";

import { useState, type ReactElement } from "react";

import { FadeIn, Pressable, StaggerItem, StaggerList } from "@/components/motion/motion-primitives";
import { Button } from "@/components/ui/button";

const demoItems = ["Entrance fade", "Staggered list", "Press feedback", "Reduced-motion aware"];

/** Motion primitive demo; a replay button restarts the stagger sequence. */
export function MotionSection(): ReactElement {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setReplayKey((key) => key + 1)}
      >
        Replay animation
      </Button>
      <StaggerList key={replayKey} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {demoItems.map((item, index) => (
          <StaggerItem key={item}>
            <Pressable className="bg-card text-body-sm flex h-24 items-center justify-center rounded-lg border p-4 text-center font-medium shadow-sm">
              <FadeIn delay={index * 0.05}>{item}</FadeIn>
            </Pressable>
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}
