"use client";

import { useCallback, useEffect, useState } from "react";
import { SoundButton } from "@/components/SoundButton";
import { DonateButton } from "@/components/DonateButton";
import { DropIcon, WaveIcon, RainIcon } from "@/components/icons";
import { useSoundEngine } from "@/lib/audio/useSoundEngine";
import { useMediaSession } from "@/lib/audio/useMediaSession";
import { createWaterEngine } from "@/lib/audio/water";
import { createWavesEngine } from "@/lib/audio/waves";
import { createRainEngine } from "@/lib/audio/rain";

// Temporary on-screen diagnostics: there is no remote console access while
// debugging "no sound" reports from inside World App, so surface any error
// directly on the page instead of only logging it.
function useGlobalErrors() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setMessages((prev) => [...prev, `window.onerror: ${event.message}`]);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error ? event.reason.message : String(event.reason);
      setMessages((prev) => [...prev, `unhandledrejection: ${reason}`]);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return messages;
}

export default function Home() {
  const water = useSoundEngine(createWaterEngine, "水の流れる音");
  const waves = useSoundEngine(createWavesEngine, "穏やかな波の音");
  const rain = useSoundEngine(createRainEngine, "雨の音");
  const globalErrors = useGlobalErrors();

  const anyPlaying = water.isPlaying || waves.isPlaying || rain.isPlaying;

  const stopAll = useCallback(() => {
    if (water.isPlaying) water.toggle();
    if (waves.isPlaying) waves.toggle();
    if (rain.isPlaying) rain.toggle();
  }, [water, waves, rain]);

  useMediaSession(anyPlaying, stopAll);

  const diagnostics = [
    water.error && `water: ${water.error}`,
    waves.error && `waves: ${waves.error}`,
    rain.error && `rain: ${rain.error}`,
    ...globalErrors,
  ].filter((m): m is string => Boolean(m));

  return (
    <main className="stage">
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
      {diagnostics.length > 0 && (
        <pre className="diagnostics">{diagnostics.join("\n")}</pre>
      )}
    </main>
  );
}
