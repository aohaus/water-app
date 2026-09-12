"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SoundButton } from "@/components/SoundButton";
import { DonateButton } from "@/components/DonateButton";
import { WaterChannel } from "@/components/WaterChannel";
import { DropIcon, WaveIcon, RainIcon } from "@/components/icons";
import { useSoundEngine } from "@/lib/audio/useSoundEngine";
import { useMediaSession } from "@/lib/audio/useMediaSession";
import { createWaterEngine } from "@/lib/audio/water";
import { createWavesEngine } from "@/lib/audio/waves";
import { createRainEngine } from "@/lib/audio/rain";
import { hasPlayedToday, markPlayedToday, resolveIdentity, type Identity } from "@/lib/puzzle/gate";

// The day's channel opens the app once, then dissolves into the sounds.
// "settling" keeps it mounted while it fades, so the two cross-fade
// instead of cutting.
type Stage = "channel" | "settling" | "relax";

export default function Home() {
  const water = useSoundEngine(createWaterEngine, "水の流れる音");
  const waves = useSoundEngine(createWavesEngine, "穏やかな波の音");
  const rain = useSoundEngine(createRainEngine, "雨の音");

  // Decided from local storage alone, so the first frame is never a wait:
  // the channel or the sounds are on screen immediately. Identity resolves
  // behind that, and only feeds the record of the day.
  const [stage, setStage] = useState<Stage>("relax");
  const identityRef = useRef<Identity | null>(null);

  useEffect(() => {
    if (!hasPlayedToday()) setStage("channel");
    let cancelled = false;
    void (async () => {
      const identity = await resolveIdentity();
      if (!cancelled) identityRef.current = identity;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChannelComplete = useCallback(() => {
    // Always record the day, even if identity never resolved — otherwise a
    // declined sheet would hand back the same puzzle on the next open.
    markPlayedToday(identityRef.current);
    setStage("settling");
    window.setTimeout(() => setStage("relax"), 1300);
  }, []);

  const anyPlaying = water.isPlaying || waves.isPlaying || rain.isPlaying;

  const stopAll = useCallback(() => {
    if (water.isPlaying) water.toggle();
    if (waves.isPlaying) waves.toggle();
    if (rain.isPlaying) rain.toggle();
  }, [water, waves, rain]);

  useMediaSession(anyPlaying, stopAll);

  const showSounds = stage === "settling" || stage === "relax";

  return (
    <>
      {showSounds && (
        <main className={`stage${stage === "settling" ? " stage--revealed" : ""}`}>
          <SoundButton
            icon={DropIcon}
            label="水の流れる音"
            isPlaying={water.isPlaying}
            isLoading={water.isLoading}
            onToggle={water.toggle}
          />
          <SoundButton
            icon={WaveIcon}
            label="穏やかな波の音"
            isPlaying={waves.isPlaying}
            isLoading={waves.isLoading}
            onToggle={waves.toggle}
          />
          <SoundButton
            icon={RainIcon}
            label="雨の音"
            isPlaying={rain.isPlaying}
            isLoading={rain.isLoading}
            onToggle={rain.toggle}
          />
          <DonateButton />
        </main>
      )}
      {(stage === "channel" || stage === "settling") && (
        <div className={`channel-stage${stage === "settling" ? " channel-stage--out" : ""}`}>
          <WaterChannel onComplete={handleChannelComplete} />
        </div>
      )}
    </>
  );
}
