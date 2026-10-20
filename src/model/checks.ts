/**
 * Geometric consistency checks for the illustrative linkage.
 * These do not establish structural safety or physical validation.
 */

import {
  DURATION,
  extension01,
  frameOf,
  frameState,
  shotOf,
} from "./timeline";
import {
  MODEL,
  buildLattice,
  componentCount,
  gripNodes,
  measureGauge,
  nodeAt,
  segmentDistance,
  strainFrom,
  baselineGauge,
  fullExtensionStrain,
  convexThetaForAxialStrain,
} from "./kinematics";

export interface CheckReport {
  ok: boolean;
  failures: string[];
  notes: string[];
}

function nearly(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

export function runChecks(): CheckReport {
  const failures: string[] = [];
  const notes: string[] = [];
  const fail = (message: string) => failures.push(message);

  if (!(MODEL.ribWidth > 0 && MODEL.ribThickness > 0 && MODEL.junctionRadius > 0)) {
    fail("Rib thickness, width, or junction radius is not positive.");
  }

  const rest = buildLattice("reentrant", MODEL.theta0, 0);
  const opened = buildLattice("reentrant", MODEL.theta1, MODEL.maxSagitta);
  const convex = buildLattice("convex", MODEL.convexTheta0, 0);
  const matched = convexThetaForAxialStrain(fullExtensionStrain().ey);
  const convexOpen = buildLattice("convex", matched, 0.012);

  for (const lattice of [rest, opened, convex, convexOpen]) {
    if (componentCount(lattice) !== 1) {
      fail(`${lattice.mode} at θ=${lattice.theta.toFixed(3)} is not a single connected component.`);
    }

    for (const rib of lattice.ribs) {
      const target = rib.kind === "vertical" ? MODEL.hv : MODEL.li;
      const chordError = Math.abs(rib.chord - target) / target;
      const arcError = Math.abs(rib.arc - target) / target;
      if (chordError > 1e-6) {
        fail(`Rib ${rib.id} chord drifted by ${(chordError * 100).toFixed(4)}%.`);
        break;
      }
      if (arcError > 0.02) {
        fail(`Rib ${rib.id} arc length drifted by ${(arcError * 100).toFixed(2)}%.`);
        break;
      }
    }

    let minGap = Infinity;
    for (let i = 0; i < lattice.ribs.length; i += 1) {
      for (let j = i + 1; j < lattice.ribs.length; j += 1) {
        const left = lattice.ribs[i];
        const right = lattice.ribs[j];
        if (left.a === right.a || left.a === right.b || left.b === right.a || left.b === right.b) {
          continue;
        }
        const samplesA = left.samples;
        const samplesB = right.samples;
        for (let s = 0; s < samplesA.length - 1; s += 1) {
          for (let t = 0; t < samplesB.length - 1; t += 1) {
            const distance = segmentDistance(samplesA[s], samplesA[s + 1], samplesB[t], samplesB[t + 1]);
            if (distance < minGap) minGap = distance;
          }
        }
      }
    }
    if (minGap < MODEL.ribWidth * 0.72) {
      fail(`${lattice.mode} centerlines approach within ${minGap.toFixed(4)}, below the rib-width clearance.`);
    }

    const byColumn = new Map<number, { y0: number; y1: number }[]>();
    for (const node of lattice.nodes) {
      if (node.end !== "bot") continue;
      const top = nodeAt(lattice, node.i, node.j, "top");
      const list = byColumn.get(node.i) ?? [];
      list.push({ y0: node.y, y1: top.y });
      byColumn.set(node.i, list);
    }
    for (const [column, spans] of byColumn) {
      spans.sort((p, q) => p.y0 - q.y0);
      for (let k = 1; k < spans.length; k += 1) {
        const gap = spans[k].y0 - spans[k - 1].y1;
        if (gap <= MODEL.junctionRadius * 2) {
          fail(`Column ${column} verticals overlap or touch. Gap ${gap.toFixed(4)}.`);
          break;
        }
      }
    }
  }

  const grips = gripNodes(rest);
  const bottomY = grips.bottom.map((node) => node.y);
  const topY = grips.top.map((node) => node.y);
  if (!bottomY.every((y) => nearly(y, 0, 1e-9))) fail("Bottom grip nodes are not coplanar at y = 0.");
  if (!topY.every((y) => nearly(y, topY[0], 1e-9))) fail("Top grip nodes are not coplanar.");
  if (!(topY[0] > 0)) fail("Top grip is not above the bottom grip.");

  const base = baselineGauge("reentrant");
  const openGauge = measureGauge(opened);
  const openStrain = strainFrom(openGauge, base);
  if (!(openStrain.H > openStrain.H0)) fail("Gauge height does not increase at full extension.");
  if (!(openStrain.W > openStrain.W0)) fail("Gauge width does not increase at full extension.");
  if (!(openStrain.ey > 0 && openStrain.ex > 0)) fail("Engineering strains are not both positive at full extension.");
  if (openStrain.nu === null || !(openStrain.nu < 0)) fail("Secant ratio is not negative at full extension.");

  const zero = strainFrom(measureGauge(rest), base);
  if (zero.nu !== null) fail("Secant ratio should be withheld at zero axial strain.");
  if (!nearly(zero.ey, 0, 1e-12) || !nearly(zero.ex, 0, 1e-12)) {
    fail("Rest strains are not zero.");
  }

  for (const time of [10.2, 12, 14.5, 17, 20, 22.2, 24]) {
    const state = frameState(time);
    if (!(state.strain.H > state.strain.H0)) fail(`H(t) is not above H0 at t=${time}.`);
    if (!(state.strain.W > state.strain.W0)) fail(`W(t) is not above W0 at t=${time}.`);
    if (!(state.strain.ey > 0 && state.strain.ex > 0)) fail(`Strains lost sign at t=${time}.`);
    if (Math.abs(state.strain.ey) < MODEL.strainEpsilon) {
      if (state.strain.nu !== null) fail(`Near-zero axial strain should withhold the ratio at t=${time}.`);
    } else if (state.strain.nu === null || !(state.strain.nu < 0)) {
      fail(`Secant ratio is not negative at t=${time}.`);
    }
  }

  const start = frameState(0);
  const end = frameState(DURATION);
  let returnError = 0;
  for (let i = 0; i < start.lattice.nodes.length; i += 1) {
    returnError = Math.max(
      returnError,
      Math.hypot(
        start.lattice.nodes[i].x - end.lattice.nodes[i].x,
        start.lattice.nodes[i].y - end.lattice.nodes[i].y,
      ),
    );
  }
  if (returnError > 1e-9) fail(`Unloaded geometry differs from the start by ${returnError}.`);
  if (end.extension !== 0) fail("Extension is not zero at t = 34.");
  if (end.strain.nu !== null) fail("Secant ratio should be withheld after unloading.");

  const seekA = frameState(18.25);
  const seekB = frameState(18.25);
  if (seekA.theta !== seekB.theta || seekA.strain.H !== seekB.strain.H || seekA.strain.W !== seekB.strain.W) {
    fail("Seeking to the same time did not reproduce the gauge state.");
  }
  if (seekA.topY !== seekB.topY || seekA.lattice.nodes.length !== seekB.lattice.nodes.length) {
    fail("Seeking to the same time did not reproduce the node set.");
  }
  for (let i = 0; i < seekA.lattice.nodes.length; i += 1) {
    if (seekA.lattice.nodes[i].x !== seekB.lattice.nodes[i].x || seekA.lattice.nodes[i].y !== seekB.lattice.nodes[i].y) {
      fail("Node coordinates changed between identical seeks.");
      break;
    }
  }

  if (frameOf(0) !== 0 || frameOf(34) !== 1019 || frameOf(33.999) !== 1019) {
    fail("Frame index mapping does not cover 0–1019.");
  }
  if (shotOf(0) !== 1 || shotOf(4.999) !== 1 || shotOf(5) !== 2 || shotOf(10) !== 3 || shotOf(17) !== 4 || shotOf(25) !== 5) {
    fail("Shot boundaries do not match the 34-second breakdown.");
  }
  if (extension01(9.999) !== 0) fail("Extension begins before the loading shot.");
  if (extension01(22.2) < 0.999) fail("Maximum extension is not reached before the hold.");
  if (extension01(24.9) < 0.999) fail("Hold does not keep the maximum extension.");
  if (extension01(30.4) !== 0) fail("Unloading does not finish before the final composition.");

  const full = fullExtensionStrain();
  const solved = convexThetaForAxialStrain(full.ey);
  const conventional = strainFrom(
    measureGauge(buildLattice("convex", solved, 0)),
    baselineGauge("convex"),
  );
  if (Math.abs(conventional.ey - full.ey) > 2e-3) {
    fail(`Comparison axial strains differ: auxetic ${full.ey.toFixed(4)}, conventional ${conventional.ey.toFixed(4)}.`);
  }
  if (!(conventional.ex < 0)) fail("Conventional comparison does not narrow at the matched axial strain.");
  if (!(solved < MODEL.convexTheta0)) fail("Conventional comparison angle did not move toward a taller cell.");

  const early = frameState(12).strain.nu;
  const late = frameState(22).strain.nu;
  notes.push(
    `Full-extension illustrative secant ratio ${full.nu?.toFixed(3) ?? "—"}. ` +
      `εy ${full.ey.toFixed(3)}, εx ${full.ex.toFixed(3)}.`,
  );
  notes.push(
    `Matched comparison εy ${conventional.ey.toFixed(3)}, conventional εx ${conventional.ex.toFixed(3)}.`,
  );
  notes.push(`Mid-load ν ${early?.toFixed(3) ?? "—"}, near-max ν ${late?.toFixed(3) ?? "—"}.`);

  return { ok: failures.length === 0, failures, notes };
}
