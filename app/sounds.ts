let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(audio: AudioContext, freq: number, start: number, duration: number, type: OscillatorType, peak: number) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(audio: AudioContext, start: number, duration: number, peak: number) {
  const size = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, size, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(start);
}

/** A card sliding off the deck. */
export function playDeal() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  noiseBurst(audio, now, 0.09, 0.18);
  tone(audio, 170, now, 0.07, 'triangle', 0.06);
}

/** A card flipping face-up. */
export function playReveal() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(560, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.22);
  noiseBurst(audio, now, 0.05, 0.08);
}

/** Cheerful ascending chime for a win. */
export function playWin() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(audio, freq, now + i * 0.09, 0.24, 'triangle', 0.15));
}

/** Descending buzz for a loss. */
export function playLose() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [220, 196, 174.61].forEach((freq, i) => tone(audio, freq, now + i * 0.13, 0.3, 'sawtooth', 0.11));
}

/** Bigger fanfare when the money limit ends the game. */
export function playLimitReached() {
  const audio = getContext();
  if (!audio) return;
  const now = audio.currentTime;
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(audio, freq, now + i * 0.12, 0.42, 'square', 0.1));
}
