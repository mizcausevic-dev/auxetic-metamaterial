/**
 * Master timeline, t = 0 to t = 34 seconds.
 * Every visual quantity used by the scene is a function of absolute time.
 * Shot intervals are start-inclusive and end-exclusive. At t = 34 the final
 * state holds.
 */

import {
  MODEL,
  baselineGauge,
  buildLattice,
  convexThetaForAxialStrain,
  fullExtensionStrain,
  gripNodes,
  measureGauge,
  reentrantLattice,
  sagittaFor,
  strainFrom,
  type Lattice,
  type LatticeNode,
  type StrainReading,
} from "./kinematics";

export const DURATION = 34;
export const FPS = 30;
export const FRAME_COUNT = 1020;

export interface ArrowState {
  visible: boolean;
  length: number;
  /** +1 upward commanded motion, -1 return, 0 hold. */
  direction: 1 | -1 | 0;
}

export interface FrameState {
  t: number;
  frame: number;
  shot: 1 | 2 | 3 | 4 | 5;
  extension: number;
  theta: number;
  lattice: Lattice;
  ghost: Lattice;
  strain: StrainReading;
  bottomY: number;
  topY: number;
  topY0: number;
  bottomGrips: LatticeNode[];
  topGrips: LatticeNode[];
  loadArrow: ArrowState;
  spread: number;
  comparison: ComparisonState;
  section: number;
  ghostOpacity: number;
  flexureOpacity: number;
  highlightOpacity: number;
  bracketOpacity: number;
  mintOpacity: number;
}

export interface ComparisonState {
  visible: boolean;
  opacity: number;
  progress: number;
  auxetic: Lattice;
  conventional: Lattice;
  auxeticStrain: StrainReading;
  conventionalStrain: StrainReading;
  matchedAxial: number;
}

const smoothstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/** 0 at rest, 1 at the illustrated maximum extension. */
export function extension01(t: number): number {
  if (t < 10) return 0;
  if (t < 22.2) return smoothstep((t - 10) / 12.2);
  if (t < 25) return 1;
  if (t < 30.4) return 1 - smoothstep((t - 25) / 5.4);
  return 0;
}

export function shotOf(t: number): FrameState["shot"] {
  if (t < 5) return 1;
  if (t < 10) return 2;
  if (t < 17) return 3;
  if (t < 25) return 4;
  return 5;
}

export function frameOf(t: number): number {
  if (t >= DURATION) return FRAME_COUNT - 1;
  return Math.min(FRAME_COUNT - 1, Math.max(0, Math.floor(t * FPS)));
}

export function extensionVelocity(t: number): number {
  const dt = 1 / 120;
  return (extension01(t + dt) - extension01(Math.max(0, t - dt))) / (2 * dt);
}

let matchedTheta: number | null = null;
let matchedAxial: number | null = null;

function matchedConvexTheta(): { theta: number; ey: number } {
  if (matchedTheta === null || matchedAxial === null) {
    const full = fullExtensionStrain();
    matchedAxial = full.ey;
    matchedTheta = convexThetaForAxialStrain(full.ey);
  }
  return { theta: matchedTheta, ey: matchedAxial };
}

export function comparisonProgress(t: number): number {
  if (t < 30.5) return 0;
  if (t < 32.6) return smoothstep((t - 30.5) / 2.1);
  return 1;
}

function sectionCut(t: number): number {
  // Clip only the near face (z greater than this constant). A full mid-plane
  // cut turned the ribs into flat plates, so the dip stays inside the front skin.
  if (t < 5 || t >= 10) return 0.3;
  const u = (t - 5) / 5;
  const dip = Math.sin(Math.min(1, u * 1.05) * Math.PI);
  return 0.11 - dip * 0.055;
}

export function frameState(t: number): FrameState {
  const time = Math.min(DURATION, Math.max(0, t));
  const extension = extension01(time);
  const theta = MODEL.theta0 + extension * (MODEL.theta1 - MODEL.theta0);
  const lattice = reentrantLattice(theta);
  const ghost = buildLattice("reentrant", MODEL.theta0, 0);
  const strain = strainFrom(measureGauge(lattice), baselineGauge("reentrant"));
  const grips = gripNodes(lattice);
  const restGrips = gripNodes(ghost);
  const topY = grips.top[0].y;
  const topY0 = restGrips.top[0].y;
  const velocity = extensionVelocity(time);
  const direction: ArrowState["direction"] = velocity > 0.02 ? 1 : velocity < -0.02 ? -1 : 0;
  const loadArrow: ArrowState = {
    visible: extension > 0.012 || Math.abs(velocity) > 0.02,
    length: 0.18 + Math.abs(topY - topY0) * 0.42,
    direction,
  };

  const progress = comparisonProgress(time);
  const matched = matchedConvexTheta();
  const auxTheta = MODEL.theta0 + progress * (MODEL.theta1 - MODEL.theta0);
  const convTheta = MODEL.convexTheta0 + progress * (matched.theta - MODEL.convexTheta0);
  const auxetic = buildLattice("reentrant", auxTheta, sagittaFor(auxTheta) * progress);
  const conventional = buildLattice("convex", convTheta, 0.012 * progress);
  const comparison: ComparisonState = {
    visible: progress > 0.001,
    opacity: Math.min(1, progress / 0.18),
    progress,
    auxetic,
    conventional,
    auxeticStrain: strainFrom(measureGauge(auxetic), baselineGauge("reentrant")),
    conventionalStrain: strainFrom(measureGauge(conventional), baselineGauge("convex")),
    matchedAxial: matched.ey,
  };

  let ghostOpacity = 0;
  if (time >= 16.4 && time < 25.8) {
    const fadeIn = smoothstep((time - 16.4) / 0.8);
    const fadeOut = time < 25 ? 1 : 1 - smoothstep((time - 25) / 0.8);
    ghostOpacity = fadeIn * fadeOut;
  }

  const flexureOpacity = time < 10 || time > 30.6 ? 0 : Math.min(1, extension / 0.18) * (time > 29.4 ? 1 - smoothstep((time - 29.4) / 1.1) : 1);
  const highlightOpacity = time >= 5 && time < 10
    ? smoothstep((time - 5) / 0.55) * (1 - smoothstep((time - 9.15) / 0.75))
    : 0;
  let bracketOpacity = time < 0.4 ? smoothstep(time / 0.4) : 1;
  if (time >= 4.7 && time < 10.5) {
    const closed = time < 5.25 ? 1 - smoothstep((time - 4.7) / 0.55) : time < 10 ? 0 : smoothstep((time - 10) / 0.5);
    bracketOpacity *= closed;
  }
  const mintOpacity = Math.min(1, Math.max(0, strain.ex / 0.05)) * (time >= 12 && time < 30.8 ? 1 : time >= 10 && time < 12 ? (time - 10) / 2 : 0);

  return {
    t: time,
    frame: frameOf(time),
    shot: shotOf(time),
    extension,
    theta,
    lattice,
    ghost,
    strain,
    bottomY: 0,
    topY,
    topY0,
    bottomGrips: grips.bottom,
    topGrips: grips.top,
    loadArrow,
    spread: strain.W - strain.W0,
    comparison,
    section: sectionCut(time),
    ghostOpacity,
    flexureOpacity,
    highlightOpacity,
    bracketOpacity,
    mintOpacity,
  };
}

export const SHOT_COPY: Record<
  FrameState["shot"],
  { kicker: string; title: string; lines: string[] }
> = {
  1: {
    kicker: "Shot 1 · 0–5 s",
    title: "Re-entrant honeycomb",
    lines: [
      "Inward-pointing cells in a flat, finite-thickness coupon.",
      "Central gauge region. Baseline dimensions H0 and W0.",
      "Y: loading. X: transverse.",
    ],
  },
  2: {
    kicker: "Shot 2 · 5–10 s",
    title: "Continuous unit-cell mechanism",
    lines: [
      "Continuous ribs.",
      "Compliant junctions.",
      "No mechanical pin joints.",
    ],
  },
  3: {
    kicker: "Shot 3 · 10–17 s",
    title: "Tensile loading",
    lines: [
      "Bottom grip fixed. Top grip moves upward.",
      "Ribs bend and change orientation as the cells open.",
      "Lateral expansion starts with the opening.",
      "Illustrative flexure overlay.",
    ],
  },
  4: {
    kicker: "Shot 4 · 17–25 s",
    title: "Taller and wider",
    lines: [
      "Negative effective Poisson's ratio.",
      "Axial strain > 0.",
      "Transverse strain > 0.",
      "Illustrative effective secant ratio.",
    ],
  },
  5: {
    kicker: "Shot 5 · 25–34 s",
    title: "Unloading and comparison",
    lines: [
      "The top grip returns along the idealized elastic path.",
      "Equal axial strain.",
      "Auxetic: widens.",
      "Conventional example: narrows.",
      "Schematic comparison.",
    ],
  },
};
