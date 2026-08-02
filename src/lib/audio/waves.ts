import { createNoiseNode } from "./context";
import { scheduleSparse, type Cancel } from "./scheduler";
import type { SoundEngine } from "./types";

// A gentle tropical shore: soft, warm swells with low contrast between
// crest and trough (no crashing surf), a long soft foam decay as the wash
// settles back over sand, a faint infrequent trade breeze, and — roughly
// a quarter of the time — a lull where the breeze drops and the water
// goes nearly silent, the way a real tropical shore does between sets.
export function createWavesEngine(ctx: AudioContext, destination: AudioNode): SoundEngine {
  let cancels: Cancel[] = [];
  let nodes: AudioNode[] = [];
  let running = false;

  function scheduleSwell(bedGain: GainNode, foamGain: GainNode) {
    if (!running) return;
    const now = ctx.currentTime;
    const isLull = Math.random() < 0.25;
    const cycle = isLull ? 16 + Math.random() * 10 : 14 + Math.random() * 9;
    const peak = isLull ? 0.02 + Math.random() * 0.02 : 0.045 + Math.random() * 0.02;
    const trough = isLull ? 0.008 + Math.random() * 0.01 : 0.032;
    const swellIn = cycle * (0.45 + Math.random() * 0.15);
    const swellOut = cycle - swellIn;

    bedGain.gain.cancelScheduledValues(now);
    bedGain.gain.setValueAtTime(bedGain.gain.value, now);
    bedGain.gain.linearRampToValueAtTime(peak, now + swellIn);
    bedGain.gain.linearRampToValueAtTime(trough, now + cycle);

    const foamStart = now + swellIn - 0.5;
    const foamPeak = peak * (0.3 + Math.random() * 0.15);
    foamGain.gain.cancelScheduledValues(now);
    foamGain.gain.setValueAtTime(0.0001, foamStart);
    foamGain.gain.exponentialRampToValueAtTime(Math.max(foamPeak, 0.0005), foamStart + 0.7);
    foamGain.gain.exponentialRampToValueAtTime(0.0001, foamStart + 0.7 + swellOut * 0.9);

    const timeoutId = setTimeout(() => scheduleSwell(bedGain, foamGain), cycle * 1000);
    cancels.push(() => clearTimeout(timeoutId));
  }

  function breeze(target: AudioNode) {
    const now = ctx.currentTime;
    const gustNoise = createNoiseNode(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 450 + Math.random() * 250;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    const duration = 6 + Math.random() * 6;
    const peak = 0.008 + Math.random() * 0.006;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + duration * 0.45);
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);
    gustNoise.connect(filter).connect(gain).connect(target);
    setTimeout(() => {
      gustNoise.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, duration * 1000 + 200);
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

      const bed = ctx.createBiquadFilter();
      bed.type = "lowpass";
      bed.frequency.value = 550;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.035;

      const foam = ctx.createBiquadFilter();
      foam.type = "highpass";
      foam.frequency.value = 2600;
      const foamGain = ctx.createGain();
      foamGain.gain.value = 0.0001;

      noise.connect(bed).connect(bedGain).connect(engineGain);
      noise.connect(foam).connect(foamGain).connect(engineGain);

      nodes = [engineGain, noise, bed, bedGain, foam, foamGain];

      scheduleSwell(bedGain, foamGain);
      cancels.push(scheduleSparse(120, 300, () => breeze(engineGain)));
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
