"use client";

import { createNoiseNode, ensureAudio } from "@/lib/audio/context";

// Routed through the app's shared AudioContext so the puzzle's sounds
// inherit the same iOS audio-session unlock the ambient engines rely on.

/**
 * Turning a piece sounds like handling water, not clicking a control: a
 * scrap of contact noise, then the rising bubble tone a real drip makes.
 * A piece that lands in its right orientation rings brighter and climbs
 * further — the only "correct" feedback the app gives, and it needs no
 * words. Every value is jittered so no two taps are the same sound.
 */
export async function playTap(landed: boolean): Promise<void> {
  try {
    const { ctx, master } = await ensureAudio();
    const now = ctx.currentTime;

    // Contact: a couple of milliseconds of filtered noise.
    const impulse = createNoiseNode(ctx);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, now);
    gate.gain.linearRampToValueAtTime(1, now + 0.002);
    gate.gain.linearRampToValueAtTime(0, now + 0.016);

    const contact = ctx.createBiquadFilter();
    contact.type = "bandpass";
    contact.frequency.value = 1400 + Math.random() * 900;
    contact.Q.value = 6 + Math.random() * 5;

    const contactGain = ctx.createGain();
    contactGain.gain.value = landed ? 0.05 : 0.035;

    impulse.connect(gate).connect(contact).connect(contactGain).connect(master);

    // Bubble: the pitch of a drip rises as the entrained bubble shrinks.
    const base = 330 + Math.random() * 90;
    const climb = landed ? 1.5 + Math.random() * 0.18 : 1.1 + Math.random() * 0.08;
    const decay = landed ? 0.28 + Math.random() * 0.08 : 0.19 + Math.random() * 0.06;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * climb, now + 0.07);

    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = 2200;

    const oscGain = ctx.createGain();
    const peak = landed ? 0.085 : 0.055;
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc.connect(body).connect(oscGain).connect(master);
    osc.start(now);
    osc.stop(now + decay + 0.05);

    window.setTimeout(() => {
      [impulse, gate, contact, contactGain, osc, body, oscGain].forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Already torn down.
        }
      });
    }, 700);
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
