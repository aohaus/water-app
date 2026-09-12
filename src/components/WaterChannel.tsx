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

const CELEBRATE_MS = 1700;

type Phase = "playing" | "flowing" | "done";
type Ripple = { x: number; y: number; t0: number };
type Sparkle = { x: number; y: number; delay: number; dur: number; size: number };
type Mark = { x: number; y: number; homeX: number; homeY: number };

export function WaterChannel({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const puzzle: Puzzle = buildPuzzle();
    let phase: Phase = "playing";
    let flowStart = 0;
    let flowProgress = 0;
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
        phase = "flowing";
        flowStart = performance.now();
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

    function armTip(dir: number, len: number): [number, number] {
      if (dir === N) return [0, -len];
      if (dir === E) return [len, 0];
      if (dir === S) return [0, len];
      if (dir === W) return [-len, 0];
      return [0, 0];
    }

    function drawPipe(c: Cell, px: number, py: number, color: string, colorOff: string) {
      const spinT = c.spin ? Math.min(1, (performance.now() - c.spin) / 260) : 1;
      const ease = easeSettle(spinT);
      const dirs = rotateCW(c.trueDirs, ((c.rot % 4) + 4) % 4);
      const stroke = cellSolved(c) ? color : colorOff;
      const arm = cell * 0.46;

      ctx!.save();
      ctx!.translate(px, py);
      if (c.spin) ctx!.rotate((1 - ease) * (Math.PI / 2) * -1);
      ctx!.strokeStyle = stroke;
      ctx!.lineWidth = cell * 0.3;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      if (dirs & N) { ctx!.moveTo(0, 0); ctx!.lineTo(0, -arm); }
      if (dirs & E) { ctx!.moveTo(0, 0); ctx!.lineTo(arm, 0); }
      if (dirs & S) { ctx!.moveTo(0, 0); ctx!.lineTo(0, arm); }
      if (dirs & W) { ctx!.moveTo(0, 0); ctx!.lineTo(-arm, 0); }
      ctx!.stroke();
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

        let frontIdx = -1;
        let frontFrac = 0;
        if (phase === "flowing") {
          const elapsed = (now - flowStart) / 1000;
          const total = 1.0 + puzzle.path.length * 0.44;
          const raw = Math.min(1, elapsed / total);
          flowProgress = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          const dist = flowProgress * puzzle.path.length;
          frontIdx = Math.min(puzzle.path.length - 1, Math.floor(dist));
          frontFrac = Math.min(1, dist - frontIdx);
        }

        for (let i = 0; i < puzzle.path.length; i++) {
          const c = puzzle.cells[puzzle.path[i]];
          const bob = bobOffset(c, now);
          const px = gridLeft + c.x * cell + cell / 2 + bob.x;
          const py = gridTop + c.y * cell + cell / 2 + bob.y;
          const wet = phase === "flowing" && i < frontIdx;
          drawPipe(c, px, py, wet ? colorWet : colorDry, colorOff);
          if (phase === "flowing" && i === frontIdx) {
            drawWetting(c, px, py, frontFrac, colorWet);
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

        if (phase === "flowing" && flowProgress >= 1 && !celebrating && !mark) {
          celebrating = true;
          celebrateStart = now;
          void playCelebration();
          spawnSparkles();
        }

        // A real beat once the water arrives: the channel pulses twice —
        // an arrival, then a settle — while light glints along it.
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

          if (ct >= 1 && !mark) {
            celebrating = false;
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
        }
      }

      if (mark) {
        markProgress = Math.min(1, markProgress + (reducedMotion ? 0.2 : 0.02));
        const breathe = markProgress < 0.35 ? 1 + Math.sin((markProgress / 0.35) * Math.PI) * 0.25 : 1;
        const settle = markProgress < 0.35 ? 0 : (markProgress - 0.35) / 0.65;
        const ease = settle * settle * (3 - 2 * settle);
        const x = mark.x + (mark.homeX - mark.x) * ease;
        const y = mark.y + (mark.homeY - mark.y) * ease;
        const scale = markProgress < 0.35 ? breathe : 1 - ease * 0.55;
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
