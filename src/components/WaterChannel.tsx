"use client";

import { useEffect, useRef } from "react";
import {
  buildPuzzle,
  cellSolved,
  isSolved,
  rotateCW,
  GRID,
  N,
  E,
  S,
  W,
  type Cell,
  type Puzzle,
} from "@/lib/puzzle/generate";
import { playCelebration, playTap } from "@/lib/puzzle/sfx";
import { BREATH_STEPS, breathTiming, stepDuration, stepIsInhale } from "@/lib/puzzle/breath";

const CELEBRATE_MS = 1700;
/** The water rushes the finished channel — the reward lands here, not 20s later. */
const ARRIVAL_MS = 1300;

type Phase = "playing" | "arrival" | "breathing" | "done";
type Ripple = { x: number; y: number; t0: number };
type Sparkle = { x: number; y: number; delay: number; dur: number; size: number };
type Mark = { x: number; y: number; homeX: number; homeY: number };

export function WaterChannel({
  onComplete,
  daysCompleted = 0,
}: {
  onComplete: () => void;
  daysCompleted?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const daysRef = useRef(daysCompleted);
  daysRef.current = daysCompleted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const puzzle: Puzzle = buildPuzzle();
    const timing = breathTiming(daysRef.current);
    let phase: Phase = "playing";
    let arrivalStart = 0;
    let breathStep = 0;
    let stepStart = 0;
    let celebrating = false;
    let celebrateStart = 0;
    let sparkles: Sparkle[] = [];
    let tapRipples: Ripple[] = [];
    let mark: Mark | null = null;
    let markProgress = 0;
    let finalRipple: { x: number; y: number; r: number } | null = null;
    let raf = 0;
    let finished = false;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    let width = 0;
    let height = 0;
    let cell = 0;
    let gridLeft = 0;
    let gridTop = 0;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = Math.min(width * 0.95, height * 0.88, 560);
      cell = size / GRID;
      gridLeft = (width - size) / 2;
      gridTop = (height - size) / 2;
    }
    layout();
    window.addEventListener("resize", layout);

    // --- interaction -----------------------------------------------------
    function handlePointerDown(event: PointerEvent) {
      event.preventDefault();
      // Some days you just want the sounds: a touch anywhere leaves the
      // breathing early rather than holding you there.
      if (phase === "breathing") {
        breathStep = BREATH_STEPS;
        return;
      }
      if (phase !== "playing") return;
      const cx = Math.floor((event.clientX - gridLeft) / cell);
      const cy = Math.floor((event.clientY - gridTop) / cell);
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return;
      const c = puzzle.cells[cy * GRID + cx];
      if (!c.onPath) return;
      c.rot += 1;
      c.spin = performance.now();
      tapRipples.push({
        x: gridLeft + cx * cell + cell / 2,
        y: gridTop + cy * cell + cell / 2,
        t0: performance.now(),
      });
      void playTap(cellSolved(c));
      if (isSolved(puzzle)) {
        phase = "arrival";
        arrivalStart = performance.now();
      }
    }

    const blockDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("dragstart", blockDefault);
    canvas.addEventListener("selectstart", blockDefault);
    canvas.addEventListener("contextmenu", blockDefault);

    // --- drawing ---------------------------------------------------------
    // A touch of overshoot, so a piece feels like it has weight and gives
    // before it rests rather than snapping like a UI control.
    function easeSettle(t: number) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const x = t - 1;
      return 1 + c3 * x * x * x + c1 * x * x;
    }

    function bobOffset(c: Cell, now: number) {
      if (reducedMotion) return { x: 0, y: 0 };
      const seed = c.x * 12.9898 + c.y * 78.233;
      return {
        x: Math.sin((now / 1000) * 1.1 + seed * 1.7) * cell * 0.01,
        y: Math.sin((now / 1000) * 1.3 + seed) * cell * 0.018,
      };
    }

    function parseHex(value: string): [number, number, number] {
      const hex = value.replace("#", "").trim();
      const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      const n = Number.parseInt(full, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function mix(a: [number, number, number], b: [number, number, number], t: number): string {
      const r = Math.round(a[0] + (b[0] - a[0]) * t);
      const g = Math.round(a[1] + (b[1] - a[1]) * t);
      const bl = Math.round(a[2] + (b[2] - a[2]) * t);
      return `rgb(${r},${g},${bl})`;
    }

    /** `depth` 0 is the resting ground, 1 is the ground with a full channel. */
    function paintGround(depth: number) {
      const top = mix(parseHex(token("--channel-top")), parseHex(token("--channel-deep-top")), depth);
      const bottom = mix(
        parseHex(token("--channel-bottom")),
        parseHex(token("--channel-deep-bottom")),
        depth,
      );
      const grad = ctx!.createRadialGradient(
        width / 2,
        height * 0.2,
        0,
        width / 2,
        height * 0.2,
        Math.max(width, height) * 0.9,
      );
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, width, height);
    }

    function armTip(dir: number, len: number): [number, number] {
      if (dir === N) return [0, -len];
      if (dir === E) return [len, 0];
      if (dir === S) return [0, len];
      if (dir === W) return [-len, 0];
      return [0, 0];
    }

    function traceArms(dirs: number, arm: number) {
      ctx!.beginPath();
      if (dirs & N) { ctx!.moveTo(0, 0); ctx!.lineTo(0, -arm); }
      if (dirs & E) { ctx!.moveTo(0, 0); ctx!.lineTo(arm, 0); }
      if (dirs & S) { ctx!.moveTo(0, 0); ctx!.lineTo(0, arm); }
      if (dirs & W) { ctx!.moveTo(0, 0); ctx!.lineTo(-arm, 0); }
    }

    /**
     * Drawn as a cut channel rather than a bar: a shadow so it sits above
     * the ground, pale banks either side, and a darker bed between them
     * that something can run along. `fall` darkens the bed a little toward
     * the outlet, so the ground it runs down is legible.
     */
    function drawPipe(
      c: Cell,
      px: number,
      py: number,
      color: string,
      colorOff: string,
      fall = 0,
    ) {
      const spinT = c.spin ? Math.min(1, (performance.now() - c.spin) / 260) : 1;
      const ease = easeSettle(spinT);
      const dirs = rotateCW(c.trueDirs, ((c.rot % 4) + 4) % 4);
      const solved = cellSolved(c);
      const stroke = solved ? color : colorOff;
      const arm = cell * 0.46;

      ctx!.save();
      ctx!.translate(px, py);
      if (c.spin) ctx!.rotate((1 - ease) * (Math.PI / 2) * -1);
      ctx!.lineCap = "round";

      // Banks: the full width, lighter, with a shadow underneath.
      ctx!.save();
      ctx!.shadowColor = "rgba(4, 26, 38, 0.32)";
      ctx!.shadowBlur = cell * 0.09;
      ctx!.shadowOffsetY = cell * 0.045;
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = cell * 0.3;
      traceArms(dirs, arm);
      ctx!.stroke();
      ctx!.restore();

      // Bed: a narrower, darker channel sunk into the banks.
      ctx!.globalAlpha = solved ? 0.42 + fall * 0.22 : 0.28;
      ctx!.strokeStyle = "#04212f";
      ctx!.lineWidth = cell * 0.17;
      traceArms(dirs, arm * 0.96);
      ctx!.stroke();
      ctx!.globalAlpha = 1;

      ctx!.fillStyle = stroke;
      ctx!.beginPath();
      ctx!.arc(0, 0, cell * 0.12, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    // The cell the water is crossing right now: in through one edge, on
    // through the centre, out the other side — a fill, not a dot sliding
    // over a static drawing.
    function drawWetting(c: Cell, px: number, py: number, frac: number, color: string) {
      const arm = cell * 0.46;
      const inT = Math.min(1, frac * 2);
      const outT = Math.max(0, Math.min(1, frac * 2 - 1));
      ctx!.save();
      ctx!.translate(px, py);
      ctx!.strokeStyle = color;
      ctx!.lineWidth = cell * 0.32;
      ctx!.lineCap = "round";
      ctx!.shadowColor = color;
      ctx!.shadowBlur = cell * 0.18;
      if (c.dirIn && inT > 0) {
        const [tx, ty] = armTip(c.dirIn, arm);
        ctx!.beginPath();
        ctx!.moveTo(tx, ty);
        ctx!.lineTo(tx * (1 - inT), ty * (1 - inT));
        ctx!.stroke();
      }
      if (c.dirOut && outT > 0) {
        const [tx, ty] = armTip(c.dirOut, arm);
        ctx!.beginPath();
        ctx!.moveTo(0, 0);
        ctx!.lineTo(tx * outT, ty * outT);
        ctx!.stroke();
      }
      if (!c.dirIn || inT >= 1) {
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = color;
        ctx!.beginPath();
        ctx!.arc(0, 0, cell * 0.13, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    function spawnSparkles() {
      sparkles = [];
      for (let i = 0; i < 14; i++) {
        const c = puzzle.cells[puzzle.path[Math.floor(Math.random() * puzzle.path.length)]];
        sparkles.push({
          x: gridLeft + c.x * cell + cell / 2 + (Math.random() - 0.5) * cell * 0.7,
          y: gridTop + c.y * cell + cell / 2 + (Math.random() - 0.5) * cell * 0.7,
          delay: Math.random() * 900,
          dur: 500 + Math.random() * 500,
          size: cell * (0.05 + Math.random() * 0.05),
        });
      }
    }

    function render() {
      const now = performance.now();
      ctx!.clearRect(0, 0, width, height);

      if (phase !== "done") {
        const colorOff = token("--pipe-off");
        const colorDry = token("--pipe-on");
        const colorWet = token("--pipe-flow");

        // The water's level as two marks along the path: the head it has
        // reached, and the tail it has drained back to. Breathing in moves
        // the head forward; breathing out moves the tail after it, so the
        // water always travels the one way a channel runs.
        const len = puzzle.path.length;
        let headPos = 0;
        let tailPos = 0;
        if (phase === "arrival") {
          const raw = Math.min(1, (now - arrivalStart) / ARRIVAL_MS);
          const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          headPos = eased * len;
          if (raw >= 1) {
            // Reaching the outlet is the moment worth celebrating. The
            // breathing starts underneath it, so the glow dissolves into
            // the first exhale rather than queueing behind it.
            phase = "breathing";
            breathStep = 0;
            stepStart = now;
            celebrating = true;
            celebrateStart = now;
            void playCelebration();
            spawnSparkles();
          }
        } else if (phase === "breathing") {
          if (breathStep >= BREATH_STEPS) {
            headPos = len;
            tailPos = 0;
          } else {
            const dur = stepDuration(breathStep, timing);
            const raw = Math.min(1, (now - stepStart) / dur);
            const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
            if (stepIsInhale(breathStep)) {
              headPos = eased * len;
              tailPos = 0;
            } else {
              headPos = len;
              tailPos = eased * len;
            }
            if (raw >= 1) {
              breathStep += 1;
              stepStart = now;
            }
          }
        }
        const headIdx = Math.min(len - 1, Math.floor(headPos));
        const headFrac = Math.min(1, headPos - headIdx);
        const tailIdx = Math.floor(tailPos);
        const tailFrac = tailPos - tailIdx;

        // The ground breathes with the water: it deepens as the channel
        // fills and lifts as it drains, so the rhythm is on the whole
        // screen rather than only in the pipes. While the puzzle is still
        // being solved there is no water to follow, so it breathes on its
        // own — slower and shallower, enough that the screen is alive from
        // the first moment and the rhythm is already there to be joined.
        const held = Math.max(0, Math.min(1, (headPos - tailPos) / len));
        const idle = 0.16 + 0.16 * (0.5 - Math.cos((now / 1000) * ((Math.PI * 2) / 11)) / 2);
        paintGround(reducedMotion ? 0.3 : phase === "playing" ? idle : held);

        // Ripples sit under the pipes, so a piece reads as resting on the
        // water it carries.
        tapRipples = tapRipples.filter((r) => now - r.t0 < 520);
        for (const r of tapRipples) {
          const t = (now - r.t0) / 520;
          ctx!.globalAlpha = Math.max(0, 0.35 * (1 - t));
          ctx!.strokeStyle = token("--ring");
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.arc(r.x, r.y, cell * (0.15 + t * 0.55), 0, Math.PI * 2);
          ctx!.stroke();
        }
        ctx!.globalAlpha = 1;

        for (let i = 0; i < len; i++) {
          const c = puzzle.cells[puzzle.path[i]];
          const bob = bobOffset(c, now);
          const px = gridLeft + c.x * cell + cell / 2 + bob.x;
          const py = gridTop + c.y * cell + cell / 2 + bob.y;

          // Downhill: the bed sits deeper the further along the run it is.
          const fall = len > 1 ? i / (len - 1) : 0;
          drawPipe(c, px, py, colorDry, colorOff, fall);

          if (phase === "arrival" || phase === "breathing") {
            // How much water this stretch is still holding.
            let held = 0;
            if (i < tailIdx || i > headIdx) held = 0;
            else if (i === tailIdx && tailPos > 0) held = 1 - tailFrac;
            else if (i === headIdx) held = 0;
            else held = 1;

            if (held > 0) {
              ctx!.globalAlpha = held;
              drawPipe(c, px, py, colorWet, colorOff, fall);
              ctx!.globalAlpha = 1;
            }
            if (i === headIdx && headFrac > 0 && headIdx >= tailIdx) {
              drawWetting(c, px, py, headFrac, colorWet);
            }
          }
        }

        const src = puzzle.cells[puzzle.sourceIdx];
        const out = puzzle.cells[puzzle.outletIdx];
        const pulse = 0.5 + Math.sin(now / 900) * 0.5;
        ctx!.fillStyle = token("--pipe-on");
        ctx!.globalAlpha = 0.85;
        ctx!.beginPath();
        ctx!.arc(
          gridLeft + src.x * cell + cell / 2,
          gridTop + src.y * cell + cell / 2,
          cell * (0.14 + pulse * 0.03),
          0,
          Math.PI * 2,
        );
        ctx!.fill();
        ctx!.globalAlpha = 1;
        ctx!.strokeStyle = token("--ring");
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(
          gridLeft + out.x * cell + cell / 2,
          gridTop + out.y * cell + cell / 2,
          cell * (0.3 + pulse * 0.05),
          0,
          Math.PI * 2,
        );
        ctx!.stroke();

        // Breathing done, channel full: the drop can form and the day can
        // close.
        if (phase === "breathing" && breathStep >= BREATH_STEPS && !mark) {
          const x = gridLeft + out.x * cell + cell / 2;
          const y = gridTop + out.y * cell + cell / 2;
          mark = { x, y, homeX: 34, homeY: height - 34 };
          markProgress = 0;
          window.setTimeout(
            () => {
              finalRipple = { x, y, r: 0 };
            },
            reducedMotion ? 50 : 650,
          );
        }

        // A real beat the moment the water arrives: the channel pulses
        // twice — an arrival, then a settle — while light glints along it.
        if (celebrating) {
          const ct = Math.min(1, (now - celebrateStart) / CELEBRATE_MS);
          const first = Math.sin(Math.min(ct / 0.55, 1) * Math.PI);
          const second = ct > 0.5 ? Math.sin(Math.min((ct - 0.5) / 0.5, 1) * Math.PI) * 0.6 : 0;
          const glow = reducedMotion ? 0.6 : Math.max(first, second);
          const arm = cell * 0.46;

          ctx!.save();
          ctx!.shadowColor = colorWet;
          ctx!.shadowBlur = cell * 0.7 * glow;
          ctx!.globalAlpha = 0.85 * glow;
          ctx!.strokeStyle = colorWet;
          ctx!.lineWidth = cell * 0.5;
          for (const idx of puzzle.path) {
            const c = puzzle.cells[idx];
            const bob = bobOffset(c, now);
            const px = gridLeft + c.x * cell + cell / 2 + bob.x;
            const py = gridTop + c.y * cell + cell / 2 + bob.y;
            const dirs = rotateCW(c.trueDirs, ((c.rot % 4) + 4) % 4);
            ctx!.beginPath();
            if (dirs & N) { ctx!.moveTo(px, py); ctx!.lineTo(px, py - arm); }
            if (dirs & E) { ctx!.moveTo(px, py); ctx!.lineTo(px + arm, py); }
            if (dirs & S) { ctx!.moveTo(px, py); ctx!.lineTo(px, py + arm); }
            if (dirs & W) { ctx!.moveTo(px, py); ctx!.lineTo(px - arm, py); }
            ctx!.stroke();
          }
          ctx!.restore();

          ctx!.save();
          for (const s of sparkles) {
            const st = (now - celebrateStart - s.delay) / s.dur;
            if (st < 0 || st > 1) continue;
            const a = Math.sin(st * Math.PI);
            ctx!.globalAlpha = a;
            ctx!.fillStyle = "#ffffff";
            ctx!.beginPath();
            ctx!.arc(s.x, s.y - st * cell * 0.12, s.size * (0.6 + a * 0.4), 0, Math.PI * 2);
            ctx!.fill();
          }
          ctx!.restore();

          if (ct >= 1) celebrating = false;
        }
      }

      if (mark) {
        markProgress = Math.min(1, markProgress + (reducedMotion ? 0.2 : 0.02));
        const breathe = markProgress < 0.35 ? 1 + Math.sin((markProgress / 0.35) * Math.PI) * 0.25 : 1;
        const settle = markProgress < 0.35 ? 0 : (markProgress - 0.35) / 0.65;
        const ease = settle * settle * (3 - 2 * settle);
        const x = mark.x + (mark.homeX - mark.x) * ease;
        const y = mark.y + (mark.homeY - mark.y) * ease;
        // Lands at r=12 to match the resting mark the relax screen puts in
        // the same corner, so the handover between them is invisible.
        const scale = markProgress < 0.35 ? breathe : 1 - ease * 0.4;
        const r = 20 * scale;
        const grad = ctx!.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.18, token("--pipe-flow"));
        grad.addColorStop(1, token("--pipe-on"));
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (finalRipple) {
        finalRipple.r += reducedMotion ? 9999 : 22;
        ctx!.strokeStyle = token("--mark");
        ctx!.globalAlpha = Math.max(0, 1 - finalRipple.r / (Math.max(width, height) * 0.9));
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        ctx!.arc(finalRipple.x, finalRipple.y, finalRipple.r, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.globalAlpha = 1;
        if (finalRipple.r > Math.max(width, height) * 0.9) {
          finalRipple = null;
          phase = "done";
          if (!finished) {
            finished = true;
            onCompleteRef.current();
          }
        }
      }

      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("dragstart", blockDefault);
      canvas.removeEventListener("selectstart", blockDefault);
      canvas.removeEventListener("contextmenu", blockDefault);
    };
  }, []);

  return <canvas ref={canvasRef} className="channel" aria-label="水路" />;
}
