/**
 * Canvas schematic of the same nodal model used by the 3D view.
 * Used for the WebGL fallback and the separated comparison inset.
 */

import type { FrameState } from "../model/timeline";
import type { Lattice, LatticeNode } from "../model/kinematics";

interface Projector {
  x: (value: number) => number;
  y: (value: number) => number;
}

function boundsOf(lattices: Lattice[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const lattice of lattices) {
    for (const node of lattice.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function projector(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
): Projector {
  const worldW = Math.max(0.001, bounds.maxX - bounds.minX);
  const worldH = Math.max(0.001, bounds.maxY - bounds.minY);
  const scale = Math.min((w - pad * 2) / worldW, (h - pad * 2) / worldH);
  const drawnW = worldW * scale;
  const drawnH = worldH * scale;
  const ox = x + (w - drawnW) / 2;
  const oy = y + (h - drawnH) / 2;
  return {
    x: (value) => ox + (value - bounds.minX) * scale,
    y: (value) => oy + drawnH - (value - bounds.minY) * scale,
  };
}

function strokeLattice(
  ctx: CanvasRenderingContext2D,
  lattice: Lattice,
  project: Projector,
  color: string,
  width: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const rib of lattice.ribs) {
    ctx.beginPath();
    rib.samples.forEach((sample, index) => {
      const px = project.x(sample.x);
      const py = project.y(sample.y);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.fillStyle = color;
  for (const node of lattice.nodes) {
    ctx.beginPath();
    ctx.arc(project.x(node.x), project.y(node.y), Math.max(1.5, width * 0.85), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeGrips(
  ctx: CanvasRenderingContext2D,
  nodes: LatticeNode[],
  project: Projector,
  y: number,
) {
  if (!nodes.length) return;
  const xs = nodes.map((node) => project.x(node.x));
  const py = project.y(y);
  ctx.save();
  ctx.strokeStyle = "#FFB703";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Math.min(...xs) - 16, py);
  ctx.lineTo(Math.max(...xs) + 16, py);
  ctx.stroke();
  ctx.fillStyle = "#FFB703";
  for (const node of nodes) {
    ctx.fillRect(project.x(node.x) - 4, py - 4, 8, 8);
  }
  ctx.restore();
}

export function drawFallback(
  ctx: CanvasRenderingContext2D,
  state: FrameState,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#11151C";
  ctx.fillRect(0, 0, width, height);
  const project = projector(boundsOf([state.lattice, state.ghost]), 0, 0, width, height * 0.86, 36);
  if (state.ghostOpacity > 0.02) {
    strokeLattice(ctx, state.ghost, project, "#9aa7b4", 1.25, 0.28 * state.ghostOpacity);
  }
  strokeLattice(ctx, state.lattice, project, "#8b98a6", 2.4, 1);
  strokeGrips(ctx, state.bottomGrips, project, -0.16);
  strokeGrips(ctx, state.topGrips, project, state.topY + 0.16);

  ctx.save();
  ctx.globalAlpha = state.bracketOpacity;
  ctx.strokeStyle = "#e6e2d6";
  ctx.lineWidth = 1.25;
  const x0 = project.x(state.strain.xLeft);
  const x1 = project.x(state.strain.xRight);
  const y0 = project.y(state.strain.yLower);
  const y1 = project.y(state.strain.yUpper);
  ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.restore();

  ctx.fillStyle = "#e6e2d6";
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("2D fallback · same illustrative kinematics", 16, height - 18);
}

export function drawComparison(
  ctx: CanvasRenderingContext2D,
  state: FrameState,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#161c24";
  ctx.fillRect(0, 0, width, height);
  const half = width / 2;
  const footer = 78;
  const viewH = Math.max(80, height - footer);
  const aux = projector(boundsOf([state.comparison.auxetic]), 0, 6, half, viewH, 14);
  const conv = projector(boundsOf([state.comparison.conventional]), half, 6, half, viewH, 14);
  strokeLattice(ctx, state.comparison.auxetic, aux, "#8b98a6", 1.7, 1);
  strokeLattice(ctx, state.comparison.conventional, conv, "#8b98a6", 1.7, 1);

  ctx.strokeStyle = "rgba(230,226,214,0.18)";
  ctx.beginPath();
  ctx.moveTo(half, 8);
  ctx.lineTo(half, viewH - 4);
  ctx.stroke();

  const auxText = `εy ${signed(state.comparison.auxeticStrain.ey)}   εx ${signed(state.comparison.auxeticStrain.ex)}`;
  const convText = `εy ${signed(state.comparison.conventionalStrain.ey)}   εx ${signed(state.comparison.conventionalStrain.ex)}`;
  const drawColumn = (x: number, title: string, title2: string, detail: string, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 4, viewH, half - 16, height - viewH);
    ctx.clip();
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(title, x, height - 54);
    if (title2) ctx.fillText(title2, x, height - 36);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#c5cdd6";
    ctx.fillText(detail, x, height - 16);
    ctx.restore();
  };
  drawColumn(12, "Auxetic: widens", "", auxText, "#06D6A0");
  drawColumn(half + 12, "Conventional example:", "narrows", convText, "#FFB703");
}

function signed(value: number): string {
  const text = value.toFixed(3);
  return value > 0 ? `+${text}` : text;
}
