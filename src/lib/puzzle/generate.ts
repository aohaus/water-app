import { rngForDay, type Rng } from "./random";

export const GRID = 5;
export const N = 1, E = 2, S = 4, W = 8;

const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };

export type Cell = {
  x: number;
  y: number;
  /** Openings this piece must show when correctly oriented. */
  trueDirs: number;
  /** Quarter-turns applied by the player. */
  rot: number;
  onPath: boolean;
  /** Edge the water arrives through; null at the source. */
  dirIn: number | null;
  /** Edge the water leaves by; null at the outlet. */
  dirOut: number | null;
  /** Timestamp of the last tap, for the settle animation. */
  spin?: number;
};

export type Puzzle = {
  cells: Cell[];
  sourceIdx: number;
  outletIdx: number;
  /** Cell indices in flow order, source first. */
  path: number[];
};

export function rotateCW(mask: number, steps: number): number {
  let m = mask;
  for (let i = 0; i < steps; i++) m = ((m << 1) | (m >> 3)) & 0xf;
  return m;
}

// A straight segment looks identical rotated 0 or 180 degrees, so a piece is
// "right" when its visible openings match the target — not when its raw
// rotation count happens to be zero.
export function cellSolved(c: Cell): boolean {
  return rotateCW(c.trueDirs, ((c.rot % 4) + 4) % 4) === c.trueDirs;
}

export function isSolved(puzzle: Puzzle): boolean {
  return puzzle.path.every((idx) => cellSolved(puzzle.cells[idx]));
}

function dirTo(a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (b.x === a.x && b.y === a.y - 1) return N;
  if (b.x === a.x + 1 && b.y === a.y) return E;
  if (b.x === a.x && b.y === a.y + 1) return S;
  if (b.x === a.x - 1 && b.y === a.y) return W;
  return 0;
}

function shuffled(dirs: number[], rng: Rng): number[] {
  const out = dirs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A single self-avoiding walk is the whole puzzle. Only cells on that walk
// get a pipe, so nothing on screen is decorative — every piece the player
// sees is one they need.
export function buildPuzzle(rng: Rng = rngForDay()): Puzzle {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      cells.push({ x, y, trueDirs: 0, rot: 0, onPath: false, dirIn: null, dirOut: null });
    }
  }
  const at = (x: number, y: number) => cells[y * GRID + x];

  let best: { x: number; y: number }[] = [];
  for (let attempt = 0; attempt < 30 && best.length < 12; attempt++) {
    const sx = Math.floor(rng() * GRID);
    const sy = Math.floor(rng() * GRID);
    const visited = new Set<number>([sy * GRID + sx]);
    const walk = [{ x: sx, y: sy }];
    for (;;) {
      const cur = walk[walk.length - 1];
      let moved = false;
      for (const d of shuffled([N, E, S, W], rng)) {
        const nx = cur.x + DX[d];
        const ny = cur.y + DY[d];
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const key = ny * GRID + nx;
        if (visited.has(key)) continue;
        walk.push({ x: nx, y: ny });
        visited.add(key);
        moved = true;
        break;
      }
      if (!moved) break;
    }
    if (walk.length > best.length) best = walk;
  }

  const targetLen = Math.min(best.length, 12 + Math.floor(rng() * 6));
  const walk = best.slice(0, targetLen);

  for (let i = 0; i < walk.length; i++) {
    const c = at(walk[i].x, walk[i].y);
    c.onPath = true;
    c.dirIn = i > 0 ? dirTo(walk[i], walk[i - 1]) : null;
    c.dirOut = i < walk.length - 1 ? dirTo(walk[i], walk[i + 1]) : null;
    if (c.dirIn) c.trueDirs |= c.dirIn;
    if (c.dirOut) c.trueDirs |= c.dirOut;
    c.rot = 1 + Math.floor(rng() * 3); // never hand the player a solved board
  }

  const path = walk.map((p) => p.y * GRID + p.x);
  return { cells, sourceIdx: path[0], outletIdx: path[path.length - 1], path };
}
