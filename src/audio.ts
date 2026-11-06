// Procedural sticker sounds (no samples needed): a peel is a stream of tiny
// adhesive crackles over a breathy bed; a stick is a soft pat + a snap.
import { params } from './params';

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c.state === 'suspended') c.resume();
}

function vol() {
  return params.sound.enabled ? params.sound.volume : 0;
}

function grain(time: number, freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass') {
  const c = ensure();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.loopStart = Math.random() * 1.5;
  src.loopEnd = src.loopStart + 0.3;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(f).connect(g).connect(master);
  src.start(time, src.loopStart);
  src.stop(time + dur + 0.02);
}

function tone(time: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const c = ensure();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, time);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), time + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g).connect(master);
  o.start(time);
  o.stop(time + dur + 0.02);
}

/** Continuous peel: call every frame with how much the front advanced (px) and the speed. */
let crackleDebt = 0;
export function peelTick(advancePx: number, speedPxPerSec: number, intensity = 1) {
  if (!ctx || advancePx <= 0 || vol() === 0) return;
  const c = ctx;
  const now = c.currentTime;
  // crackles: density scales with distance peeled
  crackleDebt += advancePx * 0.09 * params.sound.peelCrackle;
  let t = now;
  const pitch = params.sound.peelPitch;
  while (crackleDebt >= 1) {
    crackleDebt -= 1;
    const f = (1400 + Math.random() * 4200) * pitch;
    const dur = 0.006 + Math.random() * 0.016;
    grain(t, f, 6 + Math.random() * 10, dur, (0.12 + Math.random() * 0.18) * vol() * intensity);
    t += Math.random() * 0.012;
  }
  // breathy bed, louder when fast
  const bed = Math.min(1, speedPxPerSec / 900);
  if (bed > 0.05 && Math.random() < 0.5) {
    grain(now, (2600 + Math.random() * 1500) * pitch, 0.9, 0.05, 0.035 * bed * vol() * intensity, 'highpass');
  }
}

/** The moment the last bit of adhesive lets go. */
export function popFree() {
  if (!ctx || vol() === 0) return;
  const t = ctx.currentTime;
  grain(t, 3200 * params.sound.peelPitch, 2.5, 0.03, 0.22 * vol());
  tone(t, 1900, 1200, 0.04, 0.06 * vol(), 'triangle');
}

/** First contact with the lid. */
export function land(strength = 1) {
  if (!ctx || vol() === 0) return;
  const t = ctx.currentTime;
  const v = vol() * params.sound.stickThump;
  tone(t, 190, 55, 0.09, 0.5 * v * strength); // thump
  grain(t, 900, 0.8, 0.045, 0.25 * v * strength, 'lowpass'); // pat
}

/** The adhesive front spreading outward: call with px of new contact per frame. */
let stickDebt = 0;
export function stickTick(advancePx: number) {
  if (!ctx || advancePx <= 0 || vol() === 0) return;
  const t0 = ctx.currentTime;
  stickDebt += advancePx * 0.03 * params.sound.stickSnap;
  let t = t0;
  while (stickDebt >= 1) {
    stickDebt -= 1;
    grain(t, 2200 + Math.random() * 2600, 8, 0.008 + Math.random() * 0.01, 0.07 * vol() * params.sound.stickSnap);
    t += Math.random() * 0.01;
  }
}

/** Final seal: a crisp little snap. */
export function seal() {
  if (!ctx || vol() === 0) return;
  const t = ctx.currentTime;
  const v = vol() * params.sound.stickSnap;
  grain(t, 5200, 4, 0.025, 0.18 * v);
  tone(t, 2600, 2100, 0.03, 0.05 * v, 'triangle');
}
