"use client";

interface AudioHandles {
  ctx: AudioContext;
  master: GainNode;
}

let handlesPromise: Promise<AudioHandles> | null = null;
let workletReady = false;
let currentCtx: AudioContext | null = null;

// iOS WebKit (Safari, and Chrome on iOS since Apple requires it to use
// WebKit too) has a known issue where an output-only AudioWorkletNode
// (numberOfInputs: 0) loads without error and reports the context as
// running, yet never actually reaches the speaker. Confirmed by testing:
// works on Windows Chrome and Android Chrome, silent on iPhone Safari and
// Chrome — i.e. it tracks the rendering engine (WebKit), not the browser.
// ScriptProcessorNode predates AudioWorklet by years and has always been
// reliable on iOS, so skip AudioWorklet there entirely rather than trust
// its (apparently unreliable, on this platform) success signal.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  const isIPadOSDesktopUA = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIPadOSDesktopUA;
}

// iOS WebKit (Safari and, since it's WebKit-based too, Chrome on iOS) can
// report an AudioContext as "running" while nothing actually reaches the
// speaker unless a real Web Audio source node is started synchronously
// within the same tap. AudioWorkletNode/ScriptProcessorNode alone don't
// count for this unlock — a classic silent one-sample buffer source does.
function unlockWebAudio(ctx: AudioContext) {
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Best effort.
  }
}

// Confirmed by on-device diagnostics: on iOS WebKit, a Web Audio graph on
// its own can generate correct sample data (verified via AnalyserNode) yet
// never reach the speaker — WebKit is putting the page's audio session in a
// category it's free to keep silent. Playing a real (inaudible but validly
// decodable) HTMLMediaElement clip, and keeping it looping for the life of
// the page, moves the session into a category where Web Audio output is
// also audible. Must be started synchronously within the tap, same as
// unlockWebAudio above.
let sessionUnlockEl: HTMLAudioElement | null = null;

function unlockAudioSession() {
  if (typeof Audio === "undefined") return;
  try {
    if (!sessionUnlockEl) {
      sessionUnlockEl = new Audio("/audio/silent.wav");
      sessionUnlockEl.loop = true;
    }
    void sessionUnlockEl.play().catch(() => {});
  } catch {
    // Best effort.
  }
}

async function init(): Promise<AudioHandles> {
  const ctx = new AudioContext();
  currentCtx = ctx;
  unlockWebAudio(ctx);
  unlockAudioSession();

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

  if (isIOS()) {
    // Skip AudioWorklet on iOS entirely — see note above.
    workletReady = false;
  } else {
    try {
      await ctx.audioWorklet.addModule("/worklets/white-noise-processor.js");
      workletReady = true;
    } catch {
      // AudioWorklet isn't available in every WebView. We fall back to
      // ScriptProcessorNode in createNoiseNode below.
      workletReady = false;
    }
  }

  return { ctx, master };
}

// Must be called from a user gesture (tap) so the browser allows the
// AudioContext to start and, on iOS, to keep running once the tab backgrounds.
export async function ensureAudio(): Promise<AudioHandles> {
  // Fire both unlocks synchronously, before any await, so they stay inside
  // the tap gesture even on repeat calls.
  unlockAudioSession();
  if (!handlesPromise) handlesPromise = init();
  const handles = await handlesPromise;
  // Re-unlock on every gesture, not just the first — cheap, and iOS has
  // been known to need it again after the context sits idle.
  unlockWebAudio(handles.ctx);
  if (handles.ctx.state === "suspended") await handles.ctx.resume();
  return handles;
}

// If the platform suspends the AudioContext behind our back (e.g. an OS
// permission dialog stealing focus), try to bring it back the moment the
// page is visible/focused again, instead of waiting for the next tap.
if (typeof document !== "undefined") {
  const tryResume = () => {
    if (currentCtx && currentCtx.state === "suspended") {
      void currentCtx.resume().catch(() => {});
    }
    if (sessionUnlockEl && sessionUnlockEl.paused) {
      void sessionUnlockEl.play().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", tryResume);
  window.addEventListener("focus", tryResume);
  window.addEventListener("pageshow", tryResume);
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
