import { createNoiseNode } from "./context";
import { randomWalk, scheduleSparse, type Cancel } from "./scheduler";
import type { SoundEngine } from "./types";

// A soft, steady drizzle (しとしと) — quiet enough that indoor sounds
// still read over it. The character comes from a light, high, granular
// patter (short high-passed noise ticks) rather than a dense broadband
// hiss, with a very faint wash underneath and a rare, distant, quiet
// thunder rumble far off in the background.
export function createRainEngine(ctx: AudioContext, destination: AudioNode): SoundEngine {
  let cancels: Cancel[] = [];
  let nodes: AudioNode[] = [];
  let running = false;

  function patter(target: AudioNode) {
    const now = ctx.currentTime;
    const impulse = createNoiseNode(ctx);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, now);
    gate.gain.linearRampToValueAtTime(1, now + 0.001);
    gate.gain.linearRampToValueAtTime(0, now + 0.01);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3800 + Math.random() * 3200;
    filter.Q.value = 2 + Math.random() * 2;

    const tickGain = ctx.createGain();
    const peak = 0.0007 + Math.random() * 0.0008;
    tickGain.gain.setValueAtTime(0.0001, now);
    tickGain.gain.linearRampToValueAtTime(peak, now + 0.004);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.05);

    impulse.connect(gate).connect(filter).connect(tickGain).connect(target);
    setTimeout(() => {
      [impulse, gate, filter, tickGain].forEach((n) => n.disconnect());
    }, 300);
  }

  function thunder(target: AudioNode) {
    const now = ctx.currentTime;

    const crackNoise = createNoiseNode(ctx);
    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = "bandpass";
    crackFilter.frequency.value = 700 + Math.random() * 900;
    crackFilter.Q.value = 0.8;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime(0.03, now + 0.03);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    crackNoise.connect(crackFilter).connect(crackGain).connect(target);

    const rumbleNoise = createNoiseNode(ctx);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.value = 120 + Math.random() * 100;
    const rumbleGain = ctx.createGain();
    const rumbleDuration = 4 + Math.random() * 3;
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.05, now + 0.4);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + rumbleDuration);
    rumbleNoise.connect(rumbleFilter).connect(rumbleGain).connect(target);

    const cleanupMs = rumbleDuration * 1000 + 300;
    setTimeout(() => {
      [crackNoise, crackFilter, crackGain, rumbleNoise, rumbleFilter, rumbleGain].forEach((n) =>
        n.disconnect()
      );
    }, cleanupMs);
  }

  return {
    start() {
      if (running) return;
      running = true;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
      engineGain.connect(destination);

      const noise = createNoiseNode(ctx);

      // Faint, soft wash underneath the patter — not the main event.
      const bed = ctx.createBiquadFilter();
      bed.type = "highpass";
      bed.frequency.value = 2200;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.004;

      noise.connect(bed).connect(bedGain).connect(engineGain);

      nodes = [engineGain, noise, bed, bedGain];

      cancels = [
        randomWalk(ctx, bedGain.gain, { min: 0.0025, max: 0.0055, minSeconds: 4, maxSeconds: 10 }),
        randomWalk(ctx, bed.frequency, { min: 1900, max: 2600, minSeconds: 6, maxSeconds: 14 }),
        scheduleSparse(0.14, 0.45, () => patter(engineGain)),
        scheduleSparse(300, 900, () => thunder(engineGain)),
      ];
    },
    stop() {
      if (!running) return;
      running = false;
      cancels.forEach((c) => c());
      cancels = [];
      const engineGain = nodes[0] as GainNode;
      const now = ctx.currentTime;
      engineGain.gain.cancelScheduledValues(now);
      engineGain.gain.setValueAtTime(engineGain.gain.value, now);
      engineGain.gain.linearRampToValueAtTime(0, now + 0.8);
      const toDisconnect = nodes;
      setTimeout(() => toDisconnect.forEach((n) => n.disconnect()), 900);
      nodes = [];
    },
  };
}
