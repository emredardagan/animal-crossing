// toybox.js Sfx: a tiny synth for blips, chimes and noise hits, on react-native-audio-api (Web Audio API).
import { AudioContext, type GainNode } from 'react-native-audio-api';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
type Filter = 'lowpass' | 'highpass' | 'bandpass';

export class Sfx {
  ctx: AudioContext | null = null;
  out: GainNode | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {}); }

  tone(freq: number, dur = 0.1, { type = 'sine' as Wave, vol = 0.3, slide = 0, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.out || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur = 0.3, { vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass' as Filter, delay = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.out || this.muted) return;
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.out); src.start(t);
  }
}
