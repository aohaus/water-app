// Once the channel connects, the water keeps moving at the pace of a
// breath: it fills as you breathe in, drains as you breathe out. Nobody is
// told to breathe — a thing moving slowly enough is simply easy to breathe
// along with, which is how visual breathing guides work at all.
//
// The exhale lengthens a little for each day someone comes back, settling
// at six breaths a minute — slow, but well inside what stays comfortable.
// This is a calm practice, not a medical one, and it is capped so it never
// turns into an endurance test.

export const BREATH_INHALES = 3;

const INHALE_MS = 4000;
const EXHALE_START_MS = 4000;
const EXHALE_CAP_MS = 6000;
const EXHALE_STEP_MS = 200;

export type BreathTiming = { inhaleMs: number; exhaleMs: number };

export function breathTiming(daysCompleted: number): BreathTiming {
  const grown = EXHALE_START_MS + Math.max(0, daysCompleted) * EXHALE_STEP_MS;
  return { inhaleMs: INHALE_MS, exhaleMs: Math.min(EXHALE_CAP_MS, grown) };
}

/**
 * Breathe in, out, in, out, in — ending full, so the drop has somewhere to
 * form. Even steps fill, odd steps drain.
 */
export const BREATH_STEPS = BREATH_INHALES * 2 - 1;

export function stepIsInhale(step: number): boolean {
  return step % 2 === 0;
}

export function stepDuration(step: number, timing: BreathTiming): number {
  return stepIsInhale(step) ? timing.inhaleMs : timing.exhaleMs;
}
