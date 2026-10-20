/**
 * Illustrative kinematic model of a re-entrant honeycomb coupon.
 *
 * This is a reduced-order linkage, not finite-element analysis.
 * Vertical ribs keep length `hv`. Inclined ribs keep chord length `li`.
 * One shared angle, measured from the vertical, moves every node.
 *
 * Re-entrant mode (fold = -1):
 *   axial pitch  ly = 2 (hv - li cos θ)
 *   column pitch dx = li sin θ
 * Increasing θ opens the inward ribs. Both the gauge height and the
 * gauge width increase. The effective secant ratio is therefore negative.
 *
 * Convex mode (fold = +1) is the schematic comparison cell:
 *   ly = 2 (hv + li cos θ)
 * Decreasing θ lengthens the cell and narrows it.
 *
 * End attachments are the coplanar even-column terminals. Their X
 * coordinates spread with the lattice. The fixture that holds them is
 * modeled as laterally accommodating. Odd columns are not clamped.
 * They join the gripped columns through continuous ribs.
 */

export const MODEL = {
  hv: 1.15,
  li: 0.62,
  theta0: (46 * Math.PI) / 180,
  theta1: (69 * Math.PI) / 180,
  convexTheta0: (72 * Math.PI) / 180,
  nAcross: 7,
  nUp: 4,
  ribWidth: 0.048,
  ribThickness: 0.14,
  junctionRadius: 0.034,
  maxSagitta: 0.02,
  strainEpsilon: 5e-4,
} as const;

export type LatticeMode = "reentrant" | "convex";
export type NodeEnd = "bot" | "top";

export interface LatticeNode {
  id: number;
  i: number;
  j: number;
  end: NodeEnd;
  x: number;
  y: number;
  z: number;
}

export interface RibSample {
  x: number;
  y: number;
  z: number;
}

export interface LatticeRib {
  id: number;
  a: number;
  b: number;
  kind: "vertical" | "inclined";
  chord: number;
  arc: number;
  samples: RibSample[];
}

export interface Lattice {
  mode: LatticeMode;
  theta: number;
  ly: number;
  nodes: LatticeNode[];
  ribs: LatticeRib[];
  index: Map<string, number>;
}

export interface GaugeReading {
  H: number;
  W: number;
  yLower: number;
  yUpper: number;
  xLeft: number;
  xRight: number;
}

export interface StrainReading {
  H0: number;
  W0: number;
  H: number;
  W: number;
  ey: number;
  ex: number;
  /** Illustrative effective secant ratio. Null near zero axial strain. */
  nu: number | null;
  yLower: number;
  yUpper: number;
  xLeft: number;
  xRight: number;
}

const nodeKey = (i: number, j: number, end: NodeEnd) => `${i}:${j}:${end}`;

export function pitch(mode: LatticeMode, theta: number): { ly: number; dx: number } {
  const fold = mode === "reentrant" ? -1 : 1;
  const ly = 2 * (MODEL.hv + fold * MODEL.li * Math.cos(theta));
  const dx = MODEL.li * Math.sin(theta);
  return { ly, dx };
}

function bowSamples(
  a: { x: number; y: number },
  b: { x: number; y: number },
  sagitta: number,
  segments = 8,
): RibSample[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * (2 * sagitta);
  const cy = my + ny * (2 * sagitta);
  const samples: RibSample[] = [];
  for (let k = 0; k <= segments; k += 1) {
    const t = k / segments;
    const u = 1 - t;
    samples.push({
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
      z: 0,
    });
  }
  return samples;
}

function polylineLength(samples: RibSample[]): number {
  let length = 0;
  for (let i = 1; i < samples.length; i += 1) {
    length += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  return length;
}

export function buildLattice(mode: LatticeMode, theta: number, sagitta = 0): Lattice {
  const { hv, nAcross, nUp } = MODEL;
  const { ly, dx } = pitch(mode, theta);
  if (!(ly > hv)) {
    throw new Error(`Axial pitch ${ly.toFixed(4)} overlaps vertical ribs of length ${hv}.`);
  }
  if (!(dx > 0)) {
    throw new Error("Column spacing collapsed.");
  }

  const nodes: LatticeNode[] = [];
  const index = new Map<string, number>();
  const mid = (nAcross - 1) / 2;

  const add = (i: number, j: number, end: NodeEnd) => {
    const yb = j * ly + (i % 2 === 1 ? ly / 2 : 0);
    const node: LatticeNode = {
      id: nodes.length,
      i,
      j,
      end,
      x: (i - mid) * dx,
      y: end === "bot" ? yb : yb + hv,
      z: 0,
    };
    nodes.push(node);
    index.set(nodeKey(i, j, end), node.id);
  };

  for (let i = 0; i < nAcross; i += 1) {
    const jMax = i % 2 === 0 ? nUp : nUp - 1;
    for (let j = 0; j < jMax; j += 1) {
      add(i, j, "bot");
      add(i, j, "top");
    }
  }

  const at = (i: number, j: number, end: NodeEnd) => {
    const id = index.get(nodeKey(i, j, end));
    return id === undefined ? null : nodes[id];
  };

  const ribs: LatticeRib[] = [];
  const seen = new Set<string>();

  const pushRib = (a: LatticeNode, b: LatticeNode, kind: LatticeRib["kind"]) => {
    const lo = Math.min(a.id, b.id);
    const hi = Math.max(a.id, b.id);
    const stamp = `${lo}:${hi}`;
    if (seen.has(stamp)) return;
    seen.add(stamp);
    const localSag = kind === "inclined" ? sagitta : 0;
    const samples = bowSamples(a, b, localSag);
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    ribs.push({
      id: ribs.length,
      a: a.id,
      b: b.id,
      kind,
      chord,
      arc: polylineLength(samples),
      samples,
    });
  };

  for (const node of nodes) {
    if (node.end !== "bot") continue;
    const top = at(node.i, node.j, "top");
    if (top) pushRib(node, top, "vertical");
  }

  for (let i = 0; i < nAcross; i += 2) {
    for (let j = 0; j <= nUp - 2; j += 1) {
      const top = at(i, j, "top");
      if (!top) continue;
      for (const ni of [i - 1, i + 1]) {
        const bot = at(ni, j, "bot");
        if (bot) pushRib(top, bot, "inclined");
      }
    }
  }

  for (let i = 1; i < nAcross; i += 2) {
    for (let j = 0; j <= nUp - 2; j += 1) {
      const top = at(i, j, "top");
      if (!top) continue;
      for (const ni of [i - 1, i + 1]) {
        const bot = at(ni, j + 1, "bot");
        if (bot) pushRib(top, bot, "inclined");
      }
    }
  }

  return { mode, theta, ly, nodes, ribs, index };
}

export function nodeAt(lattice: Lattice, i: number, j: number, end: NodeEnd): LatticeNode {
  const id = lattice.index.get(nodeKey(i, j, end));
  if (id === undefined) {
    throw new Error(`Missing node ${i}:${j}:${end}`);
  }
  return lattice.nodes[id];
}

export function gripNodes(lattice: Lattice): { bottom: LatticeNode[]; top: LatticeNode[] } {
  const bottom: LatticeNode[] = [];
  const top: LatticeNode[] = [];
  for (let i = 0; i < MODEL.nAcross; i += 2) {
    bottom.push(nodeAt(lattice, i, 0, "bot"));
    top.push(nodeAt(lattice, i, MODEL.nUp - 1, "top"));
  }
  return { bottom, top };
}

/**
 * Gauge dimensions from tracked interior material points.
 * Columns 2 and 4, levels 1 and 2, away from the gripped terminals.
 * H is the average Y separation of the upper station minus the lower station.
 * W is the average X separation of the right column minus the left column.
 */
export function measureGauge(lattice: Lattice): GaugeReading {
  const columns = [2, 3, 4];
  const lowerY: number[] = [];
  const upperY: number[] = [];
  const leftX: number[] = [];
  const rightX: number[] = [];

  for (const i of columns) {
    const jMax = i % 2 === 0 ? MODEL.nUp : MODEL.nUp - 1;
    if (1 >= jMax || 2 >= jMax) continue;
    for (const end of ["bot", "top"] as const) {
      lowerY.push(nodeAt(lattice, i, 1, end).y);
      upperY.push(nodeAt(lattice, i, 2, end).y);
    }
  }

  for (const j of [1, 2]) {
    for (const end of ["bot", "top"] as const) {
      leftX.push(nodeAt(lattice, 2, j, end).x);
      rightX.push(nodeAt(lattice, 4, j, end).x);
    }
  }

  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const yLower = avg(lowerY);
  const yUpper = avg(upperY);
  const xLeft = avg(leftX);
  const xRight = avg(rightX);
  return {
    H: yUpper - yLower,
    W: xRight - xLeft,
    yLower,
    yUpper,
    xLeft,
    xRight,
  };
}

export function strainFrom(current: GaugeReading, base: GaugeReading): StrainReading {
  const ey = (current.H - base.H) / base.H;
  const ex = (current.W - base.W) / base.W;
  const nu = Math.abs(ey) < MODEL.strainEpsilon ? null : -ex / ey;
  return {
    H0: base.H,
    W0: base.W,
    H: current.H,
    W: current.W,
    ey,
    ex,
    nu,
    yLower: current.yLower,
    yUpper: current.yUpper,
    xLeft: current.xLeft,
    xRight: current.xRight,
  };
}

let reentrantBaseline: GaugeReading | null = null;
let convexBaseline: GaugeReading | null = null;

export function baselineGauge(mode: LatticeMode): GaugeReading {
  if (mode === "reentrant") {
    if (!reentrantBaseline) {
      reentrantBaseline = measureGauge(buildLattice("reentrant", MODEL.theta0, 0));
    }
    return reentrantBaseline;
  }
  if (!convexBaseline) {
    convexBaseline = measureGauge(buildLattice("convex", MODEL.convexTheta0, 0));
  }
  return convexBaseline;
}

export function sagittaFor(theta: number): number {
  const span = MODEL.theta1 - MODEL.theta0;
  const opened = Math.min(1, Math.max(0, (theta - MODEL.theta0) / span));
  return opened * MODEL.maxSagitta;
}

export function reentrantLattice(theta: number): Lattice {
  return buildLattice("reentrant", theta, sagittaFor(theta));
}

export function fullExtensionStrain(): StrainReading {
  const current = measureGauge(buildLattice("reentrant", MODEL.theta1, 0));
  return strainFrom(current, baselineGauge("reentrant"));
}

/**
 * Solve the convex opening angle whose axial gauge strain matches `eyTarget`.
 * Smaller θ produces a taller, narrower conventional cell.
 */
export function convexThetaForAxialStrain(eyTarget: number): number {
  const base = baselineGauge("convex");
  let lo = (14 * Math.PI) / 180;
  let hi = MODEL.convexTheta0;
  for (let k = 0; k < 48; k += 1) {
    const mid = (lo + hi) / 2;
    const ey = (measureGauge(buildLattice("convex", mid, 0)).H - base.H) / base.H;
    if (ey > eyTarget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function componentCount(lattice: Lattice): number {
  const adj = new Map<number, number[]>();
  for (const node of lattice.nodes) adj.set(node.id, []);
  for (const rib of lattice.ribs) {
    adj.get(rib.a)!.push(rib.b);
    adj.get(rib.b)!.push(rib.a);
  }
  const seen = new Set<number>();
  let components = 0;
  for (const node of lattice.nodes) {
    if (seen.has(node.id)) continue;
    components += 1;
    const stack = [node.id];
    seen.add(node.id);
    while (stack.length) {
      const id = stack.pop()!;
      for (const next of adj.get(id)!) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  }
  return components;
}

/** Minimum distance between segments ab and cd. Ericson, Real-Time Collision Detection. */
export function segmentDistance(
  a: RibSample,
  b: RibSample,
  c: RibSample,
  d: RibSample,
): number {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = d.x - c.x;
  const d2y = d.y - c.y;
  const rx = a.x - c.x;
  const ry = a.y - c.y;
  const aa = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const cc = d1x * rx + d1y * ry;
  const bb = d1x * d2x + d1y * d2y;
  const eps = 1e-10;
  let s: number;
  let t: number;
  if (aa <= eps && e <= eps) {
    return Math.hypot(a.x - c.x, a.y - c.y);
  }
  if (aa <= eps) {
    s = 0;
    t = clamp01(f / e);
  } else if (e <= eps) {
    t = 0;
    s = clamp01(-cc / aa);
  } else {
    const denom = aa * e - bb * bb;
    s = denom > eps ? clamp01((bb * f - cc * e) / denom) : 0;
    t = (bb * s + f) / e;
    if (t < 0) {
      t = 0;
      s = clamp01(-cc / aa);
    } else if (t > 1) {
      t = 1;
      s = clamp01((bb - cc) / aa);
    }
  }
  const px = a.x + s * d1x;
  const py = a.y + s * d1y;
  const qx = c.x + t * d2x;
  const qy = c.y + t * d2y;
  return Math.hypot(px - qx, py - qy);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
