"use client";

interface AudioHandles {
  ctx: AudioContext;
  master: GainNode;
}

let handlesPromise: Promise<AudioHandles> | null = null;
let workletReady = false;

let currentCtx: AudioContext | null = null;
const stateChangeLog: string[] = [];

function logStateChange(message: string) {
  const t = new Date().toISOString().slice(11, 23);
  stateChangeLog.push(`${t} ${message}`);
  if (stateChangeLog.length > 25) stateChangeLog.shift();
}

export function getStateChangeLog(): string[] {
  return stateChangeLog;
}

async function init(): Promise<AudioHandles> {
  const ctx = new AudioContext();
  currentCtx = ctx;
  logStateChange(`context created, initial state=${ctx.state}`);
  ctx.addEventListener("statechange", () => {
    logStateChange(`statechange -> ${ctx.state}`);
  });

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Resume as early as possible in the gesture-triggered call, before any
  // other awaits — some in-app WebViews are stricter than desktop/mobile
  // browsers about how far a resume() can drift from the tap that allowed it.
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Ignore — later ensureAudio() calls will retry.
    }
  }

  try {
    await ctx.audioWorklet.addModule("/worklets/white-noise-processor.js");
    workletReady = true;
  } catch {
    // AudioWorklet isn't available in every WebView. We fall back to
    // ScriptProcessorNode in createNoiseNode below.
    workletReady = false;
  }

  return { ctx, master };
}

// Must be called from a user gesture (tap) so the browser allows the
// AudioContext to start and, on iOS, to keep running once the tab backgrounds.
export async function ensureAudio(): Promise<AudioHandles> {
  if (!handlesPromise) handlesPromise = init();
  const handles = await handlesPromise;
  if (handles.ctx.state === "suspended") await handles.ctx.resume();
  return handles;
}

// If the platform suspends the AudioContext behind our back (e.g. an OS
// permission dialog stealing focus), try to bring it back the moment the
// page is visible/focused again, instead of waiting for the next tap.
if (typeof document !== "undefined") {
  const tryResume = () => {
    if (currentCtx && currentCtx.state === "suspended") {
      logStateChange(`auto-resume attempt (visibility=${document.visibilityState})`);
      void currentCtx.resume().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", tryResume);
  window.addEventListener("focus", tryResume);
  window.addEventListener("pageshow", tryResume);
}

export function isWorkletReady(): boolean {
  return workletReady;
}

export function createNoiseNode(ctx: AudioContext): AudioNode {
  if (workletReady && typeof AudioWorkletNode !== "undefined") {
    return new AudioWorkletNode(ctx, "white-noise-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
  }

  // Fallback for WebViews without AudioWorklet support: ScriptProcessorNode
  // is deprecated but far more broadly supported, and produces the same
  // continuous random-sample noise (just processed on the main thread).
  const node = ctx.createScriptProcessor(2048, 0, 1);
  node.onaudioprocess = (event) => {
    const output = event.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  };
  return node;
}
