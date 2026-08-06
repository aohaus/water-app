"use client";

import { useCallback, useRef, useState } from "react";
import { ensureAudio, isWorkletReady, unlockHtmlAudio } from "./context";
import type { EngineFactory, SoundEngine } from "./types";

export function useSoundEngine(factory: EngineFactory, label: string) {
  const engineRef = useRef<SoundEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    // Must happen synchronously, before any await, to stay tied to the tap.
    unlockHtmlAudio();

    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
      setIsPlaying(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { ctx, master } = await ensureAudio();
      const engine = factory(ctx, master);
      engine.start();
      engineRef.current = engine;
      setIsPlaying(true);
      setDiagnostic(`${label}: ctx.state=${ctx.state} workletReady=${isWorkletReady()}`);
    } catch (err) {
      setError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [factory, label]);

  return { isPlaying, isLoading, error, diagnostic, toggle, label };
}
