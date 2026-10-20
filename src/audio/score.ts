/**
 * Original procedural score. No samples.
 * Two stems, music and effects, both exactly 34 seconds.
 * Playback seeks by buffer offset, so pause, replay, and scrub
 * cannot stack obsolete layers.
 */

const DURATION = 34;

interface Stems {
  music: Float32Array;
  sfx: Float32Array;
  sampleRate: number;
}

function addTone(
  buffer: Float32Array,
  sampleRate: number,
  time: number,
  freq: number,
  duration: number,
  gain: number,
  slide = 0,
) {
  const start = Math.floor(time * sampleRate);
  const count = Math.floor(duration * sampleRate);
  const fade = Math.floor(0.018 * sampleRate);
  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    if (index < 0 || index >= buffer.length) continue;
    const t = i / sampleRate;
    const freqNow = freq + slide * t;
    const attack = fade > 0 ? Math.min(1, i / fade) : 1;
    const release = Math.min(1, (count - i) / fade);
    const env = attack * release * Math.exp(-2.6 * t);
    buffer[index] += gain * env * Math.sin(2 * Math.PI * freqNow * t);
  }
}

export function renderStems(sampleRate: number): Stems {
  const length = Math.floor(sampleRate * DURATION);
  const music = new Float32Array(length);
  const sfx = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const fadeIn = Math.min(1, t / 1.1);
    const fadeOut = Math.min(1, Math.max(0, (DURATION - t) / 1.3));
    const env = fadeIn * fadeOut;
    const load = t >= 10 && t < 25 ? Math.min(1, (t - 10) / 4) * (t < 22.2 ? 1 : 1 - Math.min(1, (t - 22.2) / 2.6)) : 0;
    const lfo = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.07 * t);
    const drone =
      0.055 * Math.sin(2 * Math.PI * 110 * t) +
      0.034 * Math.sin(2 * Math.PI * 164.81 * t) +
      0.022 * Math.sin(2 * Math.PI * 220 * t + 0.4) +
      load * 0.02 * Math.sin(2 * Math.PI * 329.63 * t);
    const beat = t % 2;
    const knockEnv = beat < 0.09 ? Math.sin((beat / 0.09) * Math.PI) : 0;
    const knock = 0.03 * knockEnv * Math.sin(2 * Math.PI * 82.5 * t);
    music[i] = Math.tanh((drone * lfo + knock) * env * 1.7);
  }

  addTone(sfx, sampleRate, 5.05, 660, 0.55, 0.16);
  addTone(sfx, sampleRate, 5.05, 990, 0.4, 0.06);
  addTone(sfx, sampleRate, 10.02, 146.8, 0.7, 0.14, 40);
  addTone(sfx, sampleRate, 17.05, 523.25, 0.28, 0.1);
  addTone(sfx, sampleRate, 17.22, 659.25, 0.32, 0.08);
  addTone(sfx, sampleRate, 22.22, 392, 0.7, 0.11);
  addTone(sfx, sampleRate, 22.22, 587.33, 0.7, 0.05);
  addTone(sfx, sampleRate, 25.02, 349.23, 0.55, 0.1, -80);
  addTone(sfx, sampleRate, 30.62, 523.25, 0.34, 0.1);
  addTone(sfx, sampleRate, 30.92, 659.25, 0.4, 0.08);

  for (let i = 0; i < length; i += 1) {
    sfx[i] = Math.tanh(sfx[i] * 1.2);
    const t = i / sampleRate;
    if (t > DURATION - 0.05) {
      const g = Math.max(0, (DURATION - t) / 0.05);
      music[i] *= g;
      sfx[i] *= g;
    }
  }

  return { music, sfx, sampleRate };
}

export class ScorePlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private sfxBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private sfxSource: AudioBufferSourceNode | null = null;
  private musicLevel = 0.72;
  private sfxLevel = 0.78;
  private muted = false;
  ready = false;

  async prepare(): Promise<void> {
    if (this.ready) return;
    const Context = window.AudioContext;
    this.context = new Context();
    const stems = renderStems(this.context.sampleRate);
    this.musicBuffer = this.context.createBuffer(1, stems.music.length, stems.sampleRate);
    this.sfxBuffer = this.context.createBuffer(1, stems.sfx.length, stems.sampleRate);
    this.musicBuffer.getChannelData(0).set(stems.music);
    this.sfxBuffer.getChannelData(0).set(stems.sfx);
    this.master = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.context.destination);
    this.applyGains();
    this.ready = true;
  }

  private applyGains() {
    if (!this.master || !this.musicGain || !this.sfxGain) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.musicGain.gain.value = this.musicLevel;
    this.sfxGain.gain.value = this.sfxLevel;
  }

  hold() {
    this.stopSources();
  }

  async playFrom(time: number) {
    await this.prepare();
    if (!this.context || !this.musicBuffer || !this.sfxBuffer || !this.musicGain || !this.sfxGain) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.stopSources();
    const offset = Math.max(0, Math.min(DURATION - 0.02, time));
    if (time >= DURATION) return;
    this.musicSource = this.context.createBufferSource();
    this.musicSource.buffer = this.musicBuffer;
    this.musicSource.connect(this.musicGain);
    this.sfxSource = this.context.createBufferSource();
    this.sfxSource.buffer = this.sfxBuffer;
    this.sfxSource.connect(this.sfxGain);
    this.musicSource.start(0, offset);
    this.sfxSource.start(0, offset);
  }

  private stopSources() {
    for (const source of [this.musicSource, this.sfxSource]) {
      if (!source) continue;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    this.musicSource = null;
    this.sfxSource = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyGains();
  }

  setMusicLevel(level: number) {
    this.musicLevel = Math.min(1, Math.max(0, level));
    this.applyGains();
  }

  setSfxLevel(level: number) {
    this.sfxLevel = Math.min(1, Math.max(0, level));
    this.applyGains();
  }
}
