/**
 * Three.js view of the shared kinematic state.
 * Mesh positions are rebuilt from absolute time. Nothing integrates forward.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MODEL, buildLattice, gripNodes, type Lattice, type LatticeRib } from "../model/kinematics";
import type { FrameState } from "../model/timeline";
import { cameraAt } from "./camera";

const POLYMER = 0x677482;
const AMBER = 0xffb703;
const CYAN = 0x00e5ff;
const MINT = 0x06d6a0;
const BONE = 0xe6e2d6;

export interface Anchor {
  id: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
}

interface RibbonSpec {
  samples: { x: number; y: number; z: number }[];
  halfW: number;
  halfT: number;
}

export class ExplainerView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly latticeGroup = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();
  private readonly fixtureGroup = new THREE.Group();
  private readonly overlayGroup = new THREE.Group();
  private readonly clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.3);
  private readonly polymerMat: THREE.MeshPhysicalMaterial;
  private readonly ghostMat: THREE.MeshPhysicalMaterial;
  private readonly flexMat: THREE.MeshBasicMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly highlightMat: THREE.MeshBasicMaterial;
  private readonly metalMat: THREE.MeshStandardMaterial;
  private readonly topRailMat: THREE.MeshStandardMaterial;
  private readonly shoeMat: THREE.MeshStandardMaterial;
  private readonly amberMat: THREE.MeshStandardMaterial;
  private readonly mintMat: THREE.MeshStandardMaterial;
  private readonly boneLine: THREE.LineBasicMaterial;
  private readonly mintLine: THREE.LineBasicMaterial;
  private readonly sphere: THREE.SphereGeometry;
  private viewWidth = 1;
  private viewHeight = 1;
  private readonly topSlot: THREE.Mesh;
  private readonly bottomSlot: THREE.Mesh;
  private meshKey = "";
  private ghostReady = false;
  private readonly guides: THREE.Mesh[] = [];
  private readonly boneGuide: THREE.MeshBasicMaterial;
  private readonly mintGuide: THREE.MeshBasicMaterial;
  private readonly loadArrows: THREE.Group[] = [];
  private readonly motionArrow: THREE.Group;
  private readonly mintArrows: THREE.Group[] = [];
  private readonly topConnectors: THREE.Mesh[] = [];
  private readonly bottomConnectors: THREE.Mesh[] = [];
  private readonly topShoes: THREE.Mesh[] = [];
  private readonly bottomShoes: THREE.Mesh[] = [];
  private readonly topRail: THREE.Mesh;
  private readonly bottomRail: THREE.Mesh;
  private quality: "high" | "low" = "high";

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x11151c, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.06, 80);
    this.scene.add(this.latticeGroup, this.ghostGroup, this.fixtureGroup, this.overlayGroup);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff6ea, 2.35);
    key.position.set(4.2, 7.4, 6.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 28;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0004;
    const fill = new THREE.DirectionalLight(0xc9d6e2, 0.55);
    fill.position.set(-6, 2.2, 4);
    const rim = new THREE.DirectionalLight(0x8fd8df, 0.28);
    rim.position.set(-1.5, 4, -5);
    const hemi = new THREE.HemisphereLight(0xd5dee6, 0x1b2129, 0.42);
    this.scene.add(key, fill, rim, hemi);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 24),
      new THREE.MeshStandardMaterial({ color: 0x171d25, roughness: 1, metalness: 0 }),
    );
    backdrop.position.set(0, 3.1, -0.62);
    backdrop.receiveShadow = true;
    this.scene.add(backdrop);

    this.polymerMat = new THREE.MeshPhysicalMaterial({
      color: POLYMER,
      metalness: 0.2,
      roughness: 0.48,
      clearcoat: 0.22,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide,
      clippingPlanes: [this.clipPlane],
    });
    this.ghostMat = new THREE.MeshPhysicalMaterial({
      color: 0x9aa6b2,
      metalness: 0.04,
      roughness: 0.72,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flexMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.haloMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.highlightMat = new THREE.MeshBasicMaterial({
      color: 0x7aefff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.metalMat = new THREE.MeshStandardMaterial({
      color: 0x8e99a4,
      metalness: 0.78,
      roughness: 0.28,
    });
    this.topRailMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4ae,
      metalness: 0.8,
      roughness: 0.26,
      emissive: 0x000000,
    });
    this.shoeMat = new THREE.MeshStandardMaterial({
      color: 0xb7c0c8,
      metalness: 0.7,
      roughness: 0.3,
    });
    this.amberMat = new THREE.MeshStandardMaterial({
      color: AMBER,
      emissive: AMBER,
      emissiveIntensity: 0.35,
      metalness: 0.15,
      roughness: 0.4,
    });
    this.mintMat = new THREE.MeshStandardMaterial({
      color: MINT,
      emissive: MINT,
      emissiveIntensity: 0.28,
      metalness: 0.1,
      roughness: 0.42,
    });
    this.boneLine = new THREE.LineBasicMaterial({ color: BONE, transparent: true, opacity: 0.9 });
    this.mintLine = new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.95 });
    this.boneGuide = new THREE.MeshBasicMaterial({ color: BONE, transparent: true, depthTest: false });
    this.mintGuide = new THREE.MeshBasicMaterial({ color: MINT, transparent: true, depthTest: false });
    this.sphere = new THREE.SphereGeometry(1, 22, 16);

    const open = buildLattice("reentrant", MODEL.theta1, 0);
    const openGrips = gripNodes(open);
    const reach = Math.max(
      ...openGrips.top.map((node) => Math.abs(node.x)),
      ...openGrips.bottom.map((node) => Math.abs(node.x)),
    );
    const railLength = reach * 2 + 0.9;
    const railGeo = new THREE.CylinderGeometry(0.046, 0.046, railLength, 24);
    this.topRail = new THREE.Mesh(railGeo, this.topRailMat);
    this.bottomRail = new THREE.Mesh(railGeo, this.metalMat);
    this.topRail.rotation.z = Math.PI / 2;
    this.bottomRail.rotation.z = Math.PI / 2;
    this.topRail.castShadow = true;
    this.bottomRail.castShadow = true;
    this.bottomRail.position.y = -0.18;
    this.fixtureGroup.add(this.topRail, this.bottomRail);

    const slotGeo = new THREE.BoxGeometry(railLength * 0.92, 0.014, 0.028);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x2c343c, metalness: 0.35, roughness: 0.62 });
    this.topSlot = new THREE.Mesh(slotGeo, slotMat);
    this.bottomSlot = new THREE.Mesh(slotGeo, slotMat);
    this.topSlot.position.z = 0.055;
    this.bottomSlot.position.set(0, -0.18, 0.055);
    this.fixtureGroup.add(this.topSlot, this.bottomSlot);

    const connectorGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 12);
    const shoeGeo = new THREE.BoxGeometry(0.1, 0.055, 0.11);
    for (let i = 0; i < openGrips.top.length; i += 1) {
      const topConnector = new THREE.Mesh(connectorGeo, this.metalMat);
      const bottomConnector = new THREE.Mesh(connectorGeo, this.metalMat);
      const topShoe = new THREE.Mesh(shoeGeo, this.shoeMat);
      const bottomShoe = new THREE.Mesh(shoeGeo, this.shoeMat);
      for (const mesh of [topConnector, bottomConnector, topShoe, bottomShoe]) {
        mesh.castShadow = true;
        this.fixtureGroup.add(mesh);
      }
      this.topConnectors.push(topConnector);
      this.bottomConnectors.push(bottomConnector);
      this.topShoes.push(topShoe);
      this.bottomShoes.push(bottomShoe);
    }

    for (let i = 0; i < 3; i += 1) this.loadArrows.push(this.makeArrow(this.amberMat));
    this.motionArrow = this.makeArrow(this.amberMat);
    this.mintArrows.push(this.makeArrow(this.mintMat), this.makeArrow(this.mintMat));
    this.overlayGroup.add(this.motionArrow, ...this.loadArrows, ...this.mintArrows);
  }

  setQuality(level: "high" | "low") {
    if (this.quality === level) return;
    this.quality = level;
    this.renderer.shadowMap.enabled = level === "high";
    this.renderer.setPixelRatio(level === "high" ? Math.min(window.devicePixelRatio || 1, 1.6) : 1);
    this.resize(this.viewWidth, this.viewHeight);
  }

  resize(width: number, height: number) {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.camera.aspect = this.viewWidth / this.viewHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewWidth, this.viewHeight, false);
  }

  render(state: FrameState, reducedMotion: boolean) {
    this.clipPlane.constant = reducedMotion ? 0.3 : state.section;
    this.syncLattice(state);
    this.ghostMat.opacity = 0.2 * state.ghostOpacity;
    this.ghostGroup.visible = state.ghostOpacity > 0.02;
    this.flexMat.opacity = 0.95 * state.flexureOpacity;
    this.haloMat.opacity = 0.5 * state.flexureOpacity;
    this.highlightMat.opacity = 0.92 * state.highlightOpacity;
    this.topRail.position.y = state.topY + 0.18;
    this.topSlot.position.y = state.topY + 0.18;
    this.topRailMat.emissive.setHex(state.loadArrow.visible ? AMBER : 0x000000);
    this.topRailMat.emissiveIntensity = state.loadArrow.visible ? 0.22 : 0;
    this.placeFixtures(state);
    this.placeArrows(state);
    this.placeLines(state);

    const pose = cameraAt(state.t, state.topY, reducedMotion);
    this.camera.position.set(pose.x, pose.y, pose.z);
    const aspect = this.viewWidth / Math.max(1, this.viewHeight);
    // Authored field of view assumes a landscape stage. On a narrow phone,
    // raise the vertical field so the free edges and side arrows stay in frame.
    const fov = aspect < 1.15
      ? Math.min(58, (2 * Math.atan(Math.tan((pose.fov * Math.PI) / 360) * 1.15 / Math.max(0.45, aspect)) * 180) / Math.PI)
      : pose.fov;
    this.camera.fov = fov;
    this.camera.lookAt(pose.tx, pose.ty, pose.tz);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  anchors(state: FrameState): Anchor[] {
    const midY = (state.strain.yLower + state.strain.yUpper) / 2;
    const edges = edgeX(state.lattice.nodes);
    const points = [
      { id: "y-load", text: "Y: loading", x: -1.65, y: state.topY + 0.95, z: 0.12, show: state.shot === 1 || state.shot === 3 },
      { id: "x-trans", text: "X: transverse", x: state.shot === 4 ? edges.max + 1.45 : edges.max + 0.2, y: state.shot === 4 ? midY : state.strain.yLower - 0.2, z: 0.12, show: state.shot === 1 || state.shot === 4 },
      { id: "gauge", text: "Central gauge region", x: state.strain.xLeft - 0.05, y: state.strain.yUpper + 0.42, z: 0.12, show: state.shot === 1 },
      { id: "ribs", text: "Continuous ribs", x: 0.42, y: 2.42, z: 0.12, show: state.shot === 2 && state.highlightOpacity > 0.35 },
      { id: "junctions", text: "Compliant junctions", x: -0.42, y: 1.42, z: 0.12, show: state.shot === 2 && state.highlightOpacity > 0.35 },
    ];
    return points.map((point) => {
      const projected = this.project(point.x, point.y, point.z);
      return {
        id: point.id,
        text: point.text,
        x: projected.x,
        y: projected.y,
        visible: point.show && projected.visible,
      };
    });
  }

  private project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const vector = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (vector.x * 0.5 + 0.5) * this.viewWidth,
      y: (-vector.y * 0.5 + 0.5) * this.viewHeight,
      visible: vector.z > -1 && vector.z < 1,
    };
  }

  private syncLattice(state: FrameState) {
    if (!this.ghostReady) {
      this.fillPolymer(state.ghost, this.ghostGroup, this.ghostMat, false);
      this.ghostReady = true;
    }
    const key = `${state.theta.toFixed(5)}|${state.flexureOpacity > 0.02 ? 1 : 0}|${state.highlightOpacity > 0.02 ? 1 : 0}`;
    if (key === this.meshKey) return;
    this.meshKey = key;
    this.clearGroup(this.latticeGroup);
    this.fillPolymer(state.lattice, this.latticeGroup, this.polymerMat, true);
    if (state.flexureOpacity > 0.02) {
      const inclined = state.lattice.ribs.filter((rib) => rib.kind === "inclined");
      this.addStripes(inclined, 0.09, 0.05, 0.006, this.haloMat);
      this.addStripes(inclined, 0.1, 0.026, 0.004, this.flexMat);
    }
    if (state.highlightOpacity > 0.02) {
      const focus = state.lattice.ribs.filter((rib) => this.isFocus(state.lattice, rib));
      this.addStripes(focus, 0.055, 0.008, 0.003, this.highlightMat);
    }
  }

  private isFocus(lattice: Lattice, rib: LatticeRib): boolean {
    const a = lattice.nodes[rib.a];
    const b = lattice.nodes[rib.b];
    return (a.i === 3 && a.j === 1) || (b.i === 3 && b.j === 1);
  }

  private fillPolymer(lattice: Lattice, group: THREE.Group, material: THREE.Material, cast: boolean) {
    for (const rib of lattice.ribs) {
      const geometry = ribbonGeometry({ samples: rib.samples, halfW: MODEL.ribWidth / 2, halfT: MODEL.ribThickness / 2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = cast;
      group.add(mesh);
    }
    const joints = new THREE.InstancedMesh(this.sphere, material, lattice.nodes.length);
    joints.userData.sharedGeo = true;
    joints.castShadow = cast;
    const dummy = new THREE.Object3D();
    lattice.nodes.forEach((node, index) => {
      dummy.position.set(node.x, node.y, 0);
      dummy.scale.set(0.044, 0.044, MODEL.ribThickness / 2);
      dummy.updateMatrix();
      joints.setMatrixAt(index, dummy.matrix);
    });
    joints.instanceMatrix.needsUpdate = true;
    group.add(joints);
  }

  private addStripes(
    ribs: LatticeRib[],
    z: number,
    halfW: number,
    halfT: number,
    material: THREE.Material,
  ) {
    for (const rib of ribs) {
      const samples = rib.samples.map((sample) => ({ x: sample.x, y: sample.y, z }));
      const mesh = new THREE.Mesh(ribbonGeometry({ samples, halfW, halfT }), material);
      this.latticeGroup.add(mesh);
    }
  }

  private placeFixtures(state: FrameState) {
    state.bottomGrips.forEach((node, index) => {
      const connector = this.bottomConnectors[index];
      const shoe = this.bottomShoes[index];
      if (!connector || !shoe) return;
      connector.position.set(node.x, -0.09, 0);
      shoe.position.set(node.x, node.y, 0);
    });
    state.topGrips.forEach((node, index) => {
      const connector = this.topConnectors[index];
      const shoe = this.topShoes[index];
      if (!connector || !shoe) return;
      connector.position.set(node.x, state.topY + 0.09, 0);
      shoe.position.set(node.x, node.y, 0);
    });
  }

  private placeArrows(state: FrameState) {
    const travel = Math.abs(state.topY - state.topY0);
    const shaft = 0.55 + Math.min(0.85, travel * 0.28);
    const downward = state.loadArrow.direction < 0;
    const xs = [-1.05, 0, 1.05];
    this.loadArrows.forEach((arrow, index) => {
      arrow.visible = state.loadArrow.visible && state.shot !== 2;
      arrow.scale.set(1, 1, 1);
      arrow.rotation.z = downward ? Math.PI : 0;
      this.layoutArrow(arrow, shaft, 1);
      const tail = downward ? state.topY + 0.36 + shaft + 0.34 : state.topY + 0.36;
      arrow.position.set(xs[index] ?? 0, tail, 0.14);
    });
    this.motionArrow.visible = state.loadArrow.direction !== 0 && state.shot >= 3 && state.shot <= 5;
    this.motionArrow.scale.set(1, 1, 1);
    this.motionArrow.rotation.z = downward ? Math.PI : 0;
    this.layoutArrow(this.motionArrow, 0.42, 0.82);
    const motionX = edgeX(state.topGrips).max + 0.42;
    this.motionArrow.position.set(
      motionX,
      downward ? state.topY + 0.72 : state.topY + 0.4,
      0.16,
    );

    const midY = (state.strain.yLower + state.strain.yUpper) / 2;
    const edges = edgeX(state.lattice.nodes);
    const mintShaft = 0.48 + Math.min(0.45, Math.max(0, state.spread) * 1.1);
    const showMint = state.mintOpacity > 0.05 && state.shot >= 3 && state.shot <= 4;
    this.mintArrows[0].visible = showMint;
    this.mintArrows[1].visible = showMint;
    this.mintArrows[0].scale.set(1, 1, 1);
    this.mintArrows[1].scale.set(1, 1, 1);
    this.layoutArrow(this.mintArrows[0], mintShaft, 0.9);
    this.layoutArrow(this.mintArrows[1], mintShaft, 0.9);
    this.mintArrows[0].position.set(edges.min - 0.08, midY, 0.14);
    this.mintArrows[1].position.set(edges.max + 0.08, midY, 0.14);
    this.mintArrows[0].rotation.z = Math.PI / 2;
    this.mintArrows[1].rotation.z = -Math.PI / 2;
  }

  private placeLines(state: FrameState) {
    for (const mesh of this.guides) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    this.guides.length = 0;
    if (state.bracketOpacity <= 0.04) return;
    const z = 0.12;
    const bone: number[] = [];
    const mint: number[] = [];
    const seg = (target: number[], x1: number, y1: number, x2: number, y2: number) => {
      target.push(x1, y1, z, x2, y2, z);
    };
    const x = state.strain.xRight + 0.42;
    seg(bone, x, state.strain.yLower, x, state.strain.yUpper);
    seg(bone, x - 0.14, state.strain.yLower, x + 0.1, state.strain.yLower);
    seg(bone, x - 0.14, state.strain.yUpper, x + 0.1, state.strain.yUpper);
    const y = state.strain.yLower - 0.38;
    const widthTarget = state.mintOpacity > 0.35 ? mint : bone;
    seg(widthTarget, state.strain.xLeft, y, state.strain.xRight, y);
    seg(widthTarget, state.strain.xLeft, y - 0.1, state.strain.xLeft, y + 0.1);
    seg(widthTarget, state.strain.xRight, y - 0.1, state.strain.xRight, y + 0.1);
    seg(bone, state.strain.xLeft, state.strain.yLower, state.strain.xRight, state.strain.yLower);
    seg(bone, state.strain.xRight, state.strain.yLower, state.strain.xRight, state.strain.yUpper);
    seg(bone, state.strain.xRight, state.strain.yUpper, state.strain.xLeft, state.strain.yUpper);
    seg(bone, state.strain.xLeft, state.strain.yUpper, state.strain.xLeft, state.strain.yLower);
    this.boneGuide.opacity = 0.92 * state.bracketOpacity;
    this.mintGuide.opacity = 0.95 * Math.max(state.bracketOpacity, state.mintOpacity);
    this.addGuides(bone, this.boneGuide);
    this.addGuides(mint, this.mintGuide);
  }

  private addGuides(points: number[], material: THREE.Material) {
    for (let i = 0; i < points.length; i += 6) {
      const x1 = points[i];
      const y1 = points[i + 1];
      const z = points[i + 2];
      const x2 = points[i + 3];
      const y2 = points[i + 4];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.028, 0.012), material);
      mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
      mesh.rotation.z = Math.atan2(dy, dx);
      mesh.renderOrder = 3;
      this.overlayGroup.add(mesh);
      this.guides.push(mesh);
    }
  }

  private makeArrow(material: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12), material);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 16), material);
    group.add(shaft, head);
    this.layoutArrow(group, 0.7, 1);
    return group;
  }

  private layoutArrow(group: THREE.Group, shaftLength: number, headScale: number) {
    const shaft = group.children[0] as THREE.Mesh;
    const head = group.children[1] as THREE.Mesh;
    shaft.scale.set(headScale, shaftLength, headScale);
    shaft.position.y = shaftLength / 2;
    head.scale.set(headScale, headScale, headScale);
    head.position.y = shaftLength + 0.16 * headScale;
  }

  private clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && !mesh.userData.sharedGeo) mesh.geometry.dispose();
    }
  }

  dispose() {
    this.renderer.dispose();
  }
}

function ribbonGeometry(spec: RibbonSpec): THREE.BufferGeometry {
  const { samples, halfW, halfT } = spec;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const p = samples[i];
    positions.push(
      p.x + nx * halfW, p.y + ny * halfW, p.z + halfT,
      p.x - nx * halfW, p.y - ny * halfW, p.z + halfT,
      p.x - nx * halfW, p.y - ny * halfW, p.z - halfT,
      p.x + nx * halfW, p.y + ny * halfW, p.z - halfT,
    );
  }
  const faces: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (let i = 0; i < samples.length - 1; i += 1) {
    for (const [c0, c1] of faces) {
      const a = i * 4 + c0;
      const b = i * 4 + c1;
      const c = (i + 1) * 4 + c1;
      const d = (i + 1) * 4 + c0;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function edgeX(nodes: { x: number }[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const node of nodes) {
    min = Math.min(min, node.x);
    max = Math.max(max, node.x);
  }
  if (!Number.isFinite(min)) return { min: -1, max: 1 };
  return { min, max };
}
