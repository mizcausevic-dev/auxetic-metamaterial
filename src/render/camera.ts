/**
 * Camera choreography is a function of absolute time.
 * Reduced-motion inspection locks a single oblique view.
 */

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
}

const smoother = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

function mix(a: CameraPose, b: CameraPose, u: number): CameraPose {
  const s = smoother(u);
  return {
    x: a.x + (b.x - a.x) * s,
    y: a.y + (b.y - a.y) * s,
    z: a.z + (b.z - a.z) * s,
    tx: a.tx + (b.tx - a.tx) * s,
    ty: a.ty + (b.ty - a.ty) * s,
    tz: a.tz + (b.tz - a.tz) * s,
    fov: a.fov + (b.fov - a.fov) * s,
  };
}

export function cameraAt(t: number, topY: number, reducedMotion: boolean): CameraPose {
  const cy = Math.max(2.2, topY * 0.48);
  if (reducedMotion) {
    return { x: 3.1, y: cy + 0.15, z: 16.8, tx: -0.2, ty: cy, tz: 0, fov: 28 };
  }

  const keys: { t: number; pose: CameraPose }[] = [
    { t: 0, pose: { x: 4.6, y: 2.7, z: 14.8, tx: 0, ty: 3.05, tz: 0, fov: 32 } },
    { t: 4.7, pose: { x: 3.8, y: 3.15, z: 13.4, tx: 0, ty: 3.2, tz: 0, fov: 32 } },
    { t: 5.35, pose: { x: 1.05, y: 2.35, z: 2.55, tx: 0.02, ty: 2.08, tz: 0, fov: 32 } },
    { t: 9.5, pose: { x: 0.82, y: 2.22, z: 2.15, tx: 0, ty: 2.02, tz: 0, fov: 30 } },
    { t: 10.45, pose: { x: 4.5, y: 3.05, z: 14.6, tx: 0, ty: 3.15, tz: 0, fov: 32 } },
    { t: 16.7, pose: { x: 3.8, y: cy + 0.25, z: 15.2, tx: 0, ty: cy, tz: 0, fov: 32 } },
    { t: 17.8, pose: { x: 0.06, y: cy, z: 26, tx: 0, ty: cy, tz: 0, fov: 24 } },
    { t: 24.7, pose: { x: 0.04, y: cy, z: 26.4, tx: 0, ty: cy, tz: 0, fov: 24 } },
    { t: 26.2, pose: { x: 3.4, y: 2.85, z: 15.4, tx: -0.85, ty: 2.9, tz: 0, fov: 32 } },
    { t: 33, pose: { x: 3.55, y: 2.8, z: 15.6, tx: -0.95, ty: 2.85, tz: 0, fov: 32 } },
    { t: 34, pose: { x: 3.55, y: 2.8, z: 15.6, tx: -0.95, ty: 2.85, tz: 0, fov: 32 } },
  ];

  if (t <= keys[0].t) return keys[0].pose;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].pose;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const left = keys[i];
    const right = keys[i + 1];
    if (t >= left.t && t <= right.t) {
      const u = (t - left.t) / (right.t - left.t);
      return mix(left.pose, right.pose, u);
    }
  }
  return keys[keys.length - 1].pose;
}
