/**
 * Sound effects synthesised with WebAudio: no audio files to download. Off by
 * default. The AudioContext is created on the first sound after the toggle is
 * turned on, which is always inside a user gesture, as browsers require.
 */
import { KEYS, load, save } from "./storage";

type Listener = () => void;

let enabled: boolean | null = null;
let context: AudioContext | null = null;
const listeners = new Set<Listener>();

function isEnabled(): boolean {
  if (enabled === null) enabled = load(KEYS.sound) === true;
  return enabled;
}

export const soundStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: isEnabled,
  getServerSnapshot: () => false,
};

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  save(KEYS.sound, on);
  for (const listener of listeners) listener();
  if (on) play("toggle");
}

function audio(): AudioContext | null {
  if (!isEnabled() || typeof window === "undefined") return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface Note {
  /** Hz at the start and (optionally) the end of the note. */
  freq: number;
  to?: number;
  /** Seconds after "now". */
  at?: number;
  length: number;
  gain: number;
  type?: OscillatorType;
}

function tone(ctx: AudioContext, note: Note): void {
  const start = ctx.currentTime + (note.at ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = note.type ?? "sine";
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, start + note.length);
  // A fast attack and an exponential tail: a pluck, not a beep.
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(note.gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + note.length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + note.length + 0.02);
}

/** A major pentatonic scale from C5: any run of these notes sounds consonant. */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export type SoundName = "place" | "rotate" | "remove" | "deny" | "hint" | "win" | "toggle";

export function play(name: SoundName): void {
  const ctx = audio();
  if (!ctx) return;
  switch (name) {
    case "place":
      tone(ctx, { freq: 420, to: 250, length: 0.09, gain: 0.16, type: "triangle" });
      break;
    case "rotate":
      tone(ctx, { freq: 980, to: 760, length: 0.045, gain: 0.07, type: "triangle" });
      break;
    case "remove":
      tone(ctx, { freq: 300, to: 170, length: 0.11, gain: 0.11, type: "triangle" });
      break;
    case "deny":
      tone(ctx, { freq: 150, to: 110, length: 0.12, gain: 0.12, type: "square" });
      break;
    case "hint":
      tone(ctx, { freq: 880, length: 0.25, gain: 0.08 });
      tone(ctx, { freq: 1318.51, at: 0.09, length: 0.35, gain: 0.07 });
      break;
    case "toggle":
      tone(ctx, { freq: 659.25, length: 0.18, gain: 0.08 });
      break;
    case "win":
      [0, 2, 4, 5, 7].forEach((step, i) => {
        tone(ctx, { freq: SCALE[step], at: i * 0.085, length: 0.6, gain: 0.1 });
        tone(ctx, { freq: SCALE[step] * 2, at: i * 0.085, length: 0.3, gain: 0.03 });
      });
      break;
  }
}

/** A bell for a target lighting up; it climbs the scale as more targets light. */
export function playLit(lit: number, total: number): void {
  const ctx = audio();
  if (!ctx) return;
  const step = Math.min(SCALE.length - 1, Math.max(0, lit - 1 + Math.max(0, 5 - total)));
  tone(ctx, { freq: SCALE[step], length: 0.5, gain: 0.11 });
  tone(ctx, { freq: SCALE[step] * 2.01, length: 0.22, gain: 0.035 });
}
