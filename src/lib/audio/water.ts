import { createNoiseNode } from "./context";
import { randomWalk, scheduleSparse, type Cancel } from "./scheduler";
import type { SoundEngine } from "./types";

// A shallow garden pond heard from the engawa — not a deep, churning pool.
// The character comes from individual resonant droplet "plinks" (a short
// noise burst ringing through a high-Q bandpass filter, pitched high and
// decaying quickly so it stays light rather than boomy) with only a
// faint, narrow-band wash underneath. A very rare, quiet bird call keeps
// it reading as outdoors. Droplet nodes are capped so a run of unlucky
// clustering can never pile up and overload the audio graph.
export function createWaterEngine(ctx: AudioContext, destination: AudioNode): SoundEngine {
  let cancels: Cancel[] = [];
  let nodes: AudioNode[] = [];
  let running = false;
  let activeDroplets = 0;
  const MAX_ACTIVE_DROPLETS = 8;

  function fireDroplet(target: AudioNode) {
    if (activeDroplets >= MAX_ACTIVE_DROPLETS) return;
    activeDroplets++;
    const now = ctx.currentTime;

    const impulse = createNoiseNode(ctx);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, now);
    gate.gain.linearRampToValueAtTime(1, now + 0.002);
    gate.gain.linearRampToValueAtTime(0, now + 0.018);

    const resonant = ctx.createBiquadFilter();
    resonant.type = "bandpass";
    const baseFreq = 1800 + Math.random() * 1800;
    resonant.frequency.setValueAtTime(baseFreq, now);
    resonant.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, now + 0.15);
    resonant.Q.value = 14 + Math.random() * 10;

    const dropletGain = ctx.createGain();
    const peak = 0.032 + Math.random() * 0.023;
    dropletGain.gain.setValueAtTime(0.0001, now);
    dropletGain.gain.linearRampToValueAtTime(peak, now + 0.01);
    dropletGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15 + Math.random() * 0.15);

    impulse.connect(gate).connect(resonant).connect(dropletGain).connect(target);

    setTimeout(() => {
      [impulse, gate, resonant, dropletGain].forEach((n) => n.disconnect());
      activeDroplets--;
    }, 500);
  }

  // Streams often "plink" in quick little clusters rather than perfectly
  // evenly — fire a possible second drop right away, never a chain, so
  // there is no way for this to run away over a long session.
  function droplet(target: AudioNode) {
    fireDroplet(target);
    if (Math.random() < 0.15) {
      const delay = 60 + Math.random() * 120;
      setTimeout(() => {
        if (running) fireDroplet(target);
      }, delay);
    }
  }

  function chirp(target: AudioNode) {
    const now = ctx.currentTime;
    const notes = Math.random() < 0.35 ? 2 : 1;
    for (let n = 0; n < notes; n++) {
      const start = now + n * (0.12 + Math.random() * 0.1);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const baseFreq = 2200 + Math.random() * 1200;
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.02, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain);
      gain.connect(target);
      osc.start(start);
      osc.stop(start + 0.16);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      activeDroplets = 0;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
      engineGain.connect(destination);

      // Faint, narrow-band wash underneath — a hum, not a rumble, so it
      // doesn't read as a large body of moving water.
      const noise = createNoiseNode(ctx);
      const bed = ctx.createBiquadFilter();
      bed.type = "bandpass";
      bed.frequency.value = 320;
      bed.Q.value = 0.8;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.0055;

      noise.connect(bed).connect(bedGain).connect(engineGain);

      nodes = [engineGain, noise, bed, bedGain];

      cancels = [
        randomWalk(ctx, bed.frequency, { min: 250, max: 400, minSeconds: 8, maxSeconds: 18 }),
        randomWalk(ctx, bedGain.gain, { min: 0.004, max: 0.0075, minSeconds: 5, maxSeconds: 12 }),
        scheduleSparse(0.4, 1.3, () => droplet(engineGain)),
        scheduleSparse(45, 150, () => chirp(engineGain)),
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
