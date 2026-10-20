import { ScorePlayer } from "./audio/score";
import { runChecks } from "./model/checks";
import { DURATION, SHOT_COPY, frameState, type FrameState } from "./model/timeline";
import { ExplainerView } from "./render/scene";
import { drawComparison, drawFallback } from "./render/schematic";

function required<T extends Element>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node as T;
}

const app = required<HTMLElement>("#app");
const stage = required<HTMLElement>("#stage");
const glCanvas = required<HTMLCanvasElement>("#gl");
const fallbackCanvas = required<HTMLCanvasElement>("#fallback");
const comparisonCanvas = required<HTMLCanvasElement>("#comparison-canvas");
const comparisonBox = required<HTMLElement>("#comparison");
const playOverlay = required<HTMLButtonElement>("#play-overlay");
const playButton = required<HTMLButtonElement>("#play");
const replayButton = required<HTMLButtonElement>("#replay");
const muteButton = required<HTMLButtonElement>("#mute");
const fullscreenButton = required<HTMLButtonElement>("#fullscreen");
const reducedButton = required<HTMLButtonElement>("#reduced");
const timeline = required<HTMLInputElement>("#timeline");
const musicInput = required<HTMLInputElement>("#music");
const sfxInput = required<HTMLInputElement>("#sfx");
const clock = required<HTMLElement>("#clock");
const status = required<HTMLElement>("#status");
const shotKicker = required<HTMLElement>("#shot-kicker");
const shotTitle = required<HTMLElement>("#shot-title");
const shotLines = required<HTMLElement>("#shot-lines");
const live = required<HTMLElement>("#live");
const anchors = required<HTMLElement>("#anchors");
const chapterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-shot]"));
const readout = {
  h0: required<HTMLElement>("#h0"),
  h: required<HTMLElement>("#h"),
  ey: required<HTMLElement>("#ey"),
  w0: required<HTMLElement>("#w0"),
  w: required<HTMLElement>("#w"),
  ex: required<HTMLElement>("#ex"),
  nu: required<HTMLElement>("#nu"),
};

const score = new ScorePlayer();
let view: ExplainerView | null = null;
let webgl = false;
let t = 0;
let playing = false;
let lastStamp = 0;
let shotSeen = 0;
let slowFrames = 0;
let syncTimer = 0;
const storedReduced = localStorage.getItem("auxetic-reduced");
let reduced = storedReduced === null
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : storedReduced === "1";
let muted = localStorage.getItem("auxetic-muted") === "1";

musicInput.value = localStorage.getItem("auxetic-music") ?? "72";
sfxInput.value = localStorage.getItem("auxetic-sfx") ?? "78";
score.setMusicLevel(Number(musicInput.value) / 100);
score.setSfxLevel(Number(sfxInput.value) / 100);
score.setMuted(muted);
applyReduced();
applyMute();

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

function setStatus(message: string, isError = false) {
  status.hidden = message.length === 0;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function formatClock(time: number): string {
  const clamped = Math.min(DURATION, Math.max(0, time));
  const seconds = clamped.toFixed(1).padStart(4, "0");
  return `0:${seconds}`;
}

function signed(value: number): string {
  const text = value.toFixed(3);
  return value > 0 ? `+${text}` : text;
}

function formatNu(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `−${abs}` : abs;
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const width = Math.min(1600, Math.max(1, Math.floor(rect.width)));
  const height = Math.min(1200, Math.max(1, Math.floor(rect.height)));
  view?.resize(width, height);
  fallbackCanvas.width = width;
  fallbackCanvas.height = height;
  const box = comparisonBox.getBoundingClientRect();
  comparisonCanvas.width = Math.max(280, Math.floor(box.width - 20));
  comparisonCanvas.height = Math.max(210, Math.floor(comparisonCanvas.width * 0.58));
}

function paint(state: FrameState) {
  if (webgl && view) view.render(state, reduced);
  else {
    const ctx = fallbackCanvas.getContext("2d");
    if (ctx) drawFallback(ctx, state, fallbackCanvas.width, fallbackCanvas.height);
  }
  const compareCtx = comparisonCanvas.getContext("2d");
  comparisonBox.hidden = !state.comparison.visible;
  if (state.comparison.visible && compareCtx) {
    const box = comparisonBox.getBoundingClientRect();
    const width = Math.max(320, Math.floor(box.width - 24));
    const height = Math.max(220, Math.floor(width * 0.56));
    if (comparisonCanvas.width !== width || comparisonCanvas.height !== height) {
      comparisonCanvas.width = width;
      comparisonCanvas.height = height;
    }
    drawComparison(compareCtx, state, comparisonCanvas.width, comparisonCanvas.height);
  }
  updateCopy(state);
  updateAnchors(state);
}

function updateCopy(state: FrameState) {
  const copy = SHOT_COPY[state.shot];
  shotKicker.textContent = copy.kicker;
  shotTitle.textContent = copy.title;
  shotLines.replaceChildren(...copy.lines.map((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    return item;
  }));
  if (shotSeen !== state.shot) {
    shotSeen = state.shot;
    live.textContent = `${copy.title}. ${copy.lines.join(" ")}`;
  }
  readout.h0.textContent = state.strain.H0.toFixed(3);
  readout.h.textContent = state.strain.H.toFixed(3);
  readout.ey.textContent = signed(state.strain.ey);
  readout.w0.textContent = state.strain.W0.toFixed(3);
  readout.w.textContent = state.strain.W.toFixed(3);
  readout.ex.textContent = signed(state.strain.ex);
  readout.nu.textContent = formatNu(state.strain.nu);
  clock.textContent = formatClock(state.t);
  timeline.value = state.t.toFixed(3);
  timeline.setAttribute("aria-valuenow", state.t.toFixed(3));
  timeline.setAttribute("aria-valuetext", `${state.t.toFixed(1)} seconds of 34`);
  playButton.textContent = playing ? "Pause" : "Play";
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  playOverlay.hidden = playing || state.t > 0.05;
  const ends: Record<number, number> = { 0: 5, 5: 10, 10: 17, 17: 25, 25: 34.001 };
  for (const button of chapterButtons) {
    const start = Number(button.dataset.shot);
    const active = state.t >= start && state.t < ends[start];
    button.setAttribute("aria-current", active ? "true" : "false");
  }
}

function updateAnchors(state: FrameState) {
  anchors.replaceChildren();
  if (!view || !webgl) return;
  for (const anchor of view.anchors(state)) {
    if (!anchor.visible) continue;
    const label = document.createElement("div");
    label.className = "anchor";
    label.textContent = anchor.text;
    label.style.left = `${anchor.x}px`;
    label.style.top = `${anchor.y}px`;
    anchors.appendChild(label);
  }
}

function draw() {
  paint(frameState(t));
}

async function startPlayback() {
  if (t >= DURATION) t = 0;
  playing = true;
  lastStamp = performance.now();
  playOverlay.hidden = true;
  try {
    await score.playFrom(t);
  } catch {
    setStatus("Sound could not start. The picture still plays.", true);
  }
  draw();
}

function pausePlayback() {
  playing = false;
  score.hold();
  draw();
}

function togglePlayback() {
  if (playing) pausePlayback();
  else void startPlayback();
}

function replay() {
  t = 0;
  void startPlayback();
}

function seekTo(next: number) {
  t = Math.min(DURATION, Math.max(0, next));
  if (t >= DURATION) playing = false;
  score.hold();
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    if (playing) void score.playFrom(t);
  }, 140);
  draw();
}

function scrub() {
  seekTo(Number(timeline.value));
}

function applyMute() {
  muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
  muteButton.textContent = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  score.setMuted(muted);
  localStorage.setItem("auxetic-muted", muted ? "1" : "0");
}

function applyReduced() {
  reducedButton.setAttribute("aria-pressed", reduced ? "true" : "false");
  localStorage.setItem("auxetic-reduced", reduced ? "1" : "0");
  draw();
}

async function toggleFullscreen() {
  if (!app) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen();
  } catch {
    setStatus("Full screen is not available in this browser.", true);
  }
}

function frame(now: number) {
  const dt = lastStamp ? (now - lastStamp) / 1000 : 0;
  lastStamp = now;
  if (playing) {
    t = Math.min(DURATION, t + dt);
    if (dt > 0.05) slowFrames += 1;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 10) view?.setQuality("low");
    if (t >= DURATION) {
      t = DURATION;
      playing = false;
      score.hold();
    } else if (dt > 0.25) {
      void score.playFrom(t);
    }
  }
  draw();
  requestAnimationFrame(frame);
}

playButton.addEventListener("click", togglePlayback);
playOverlay.addEventListener("click", () => void startPlayback());
replayButton.addEventListener("click", replay);
muteButton.addEventListener("click", () => {
  muted = !muted;
  applyMute();
});
fullscreenButton.addEventListener("click", () => void toggleFullscreen());
reducedButton.addEventListener("click", () => {
  reduced = !reduced;
  applyReduced();
});
timeline.addEventListener("input", scrub);
musicInput.addEventListener("input", () => {
  score.setMusicLevel(Number(musicInput.value) / 100);
  localStorage.setItem("auxetic-music", musicInput.value);
});
sfxInput.addEventListener("input", () => {
  score.setSfxLevel(Number(sfxInput.value) / 100);
  localStorage.setItem("auxetic-sfx", sfxInput.value);
});
for (const button of chapterButtons) {
  button.addEventListener("click", () => {
    seekTo(Number(button.dataset.shot));
  });
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (target instanceof HTMLButtonElement && (event.code === "Space" || event.key === "Enter")) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key === "m" || event.key === "M") {
    muted = !muted;
    applyMute();
  } else if (event.key === "f" || event.key === "F") {
    void toggleFullscreen();
  } else if (event.key === "r" || event.key === "R") {
    replay();
  } else if (event.key === "Home") {
    seekTo(0);
  } else if (event.key === "End") {
    playing = false;
    seekTo(DURATION);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const step = event.shiftKey ? 0.1 : 1;
    seekTo(t + (event.key === "ArrowRight" ? step : -step));
    event.preventDefault();
  }
});

document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === app;
  fullscreenButton.textContent = active ? "Exit full screen" : "Full screen";
  fullscreenButton.setAttribute("aria-label", active ? "Exit full screen" : "Enter full screen");
  resize();
});

window.addEventListener("resize", resize);

const report = runChecks();
if (!report.ok) {
  setStatus(report.failures[0] ?? "Geometric check failed.", true);
}

try {
  if (!webglAvailable()) throw new Error("WebGL is unavailable.");
  view = new ExplainerView(glCanvas);
  webgl = true;
  fallbackCanvas.hidden = true;
} catch (error) {
  webgl = false;
  glCanvas.hidden = true;
  fallbackCanvas.hidden = false;
  const message = error instanceof Error ? error.message : "WebGL failed.";
  setStatus(`${message} Showing the 2D model instead.`, true);
}

glCanvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  webgl = false;
  glCanvas.hidden = true;
  fallbackCanvas.hidden = false;
  setStatus("WebGL was interrupted. Showing the 2D model of the same kinematics.", true);
});

resize();
draw();
if (report.ok) setStatus("");
requestAnimationFrame(frame);
