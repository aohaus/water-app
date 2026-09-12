"use client";

import { ensureAudio } from "@/lib/audio/context";

// Routed through the app's shared AudioContext so the puzzle's sounds
// inherit the same iOS audio-session unlock the ambient engines rely on.

export async function playTick(): Promise<void> {
  try {
    const { ctx, master } = await ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // Sound is a garnish here; never let it break the puzzle.
  }
}

export async function playCelebration(): Promise<void> {
  try {
    const { ctx, master } = await ensureAudio();
    const run = [523.25, 659.25, 784.0, 987.77];
    run.forEach((f, i) => {
      const t0 = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
    // The run rises, then a held chord lands: that landing is the reward.
    const chordAt = ctx.currentTime + run.length * 0.13 + 0.04;
    [523.25, 659.25, 784.0, 1046.5].forEach((f) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, chordAt);
      gain.gain.setValueAtTime(0.0001, chordAt);
      gain.gain.exponentialRampToValueAtTime(0.065, chordAt + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, chordAt + 1.3);
      osc.connect(gain);
      gain.connect(master);
      osc.start(chordAt);
      osc.stop(chordAt + 1.35);
    });
  } catch {
    // As above.
  }
}
