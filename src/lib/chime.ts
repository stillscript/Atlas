/**
 * The rest-timer chime, made with Web Audio (no audio files to cache).
 *
 * Browsers only allow sound after a tap, so `primeAudio()` runs inside the Done tap; the chime is
 * then scheduled on the audio clock for the moment the rest ends. It mixes with music already
 * playing and follows the phone's silent switch. When the screen locks, iPhone pauses web audio
 * entirely; Atlas keeps the screen awake during workouts for this reason (Settings › Keep screen on).
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let scheduled: OscillatorNode[] = [];

function audioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
}

/** Call from a tap handler. Creates or wakes the audio context so a later chime can play. */
export function primeAudio(): void {
  const Ctor = audioContextCtor();
  if (!Ctor) return;
  try {
    context ??= new Ctor();
    if (context.state !== 'running') void context.resume();
  } catch {
    context = null;
  }
}

function tone(ctx: AudioContext, frequency: number, at: number, duration: number, peak: number): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
  return osc;
}

export function cancelChime(): void {
  for (const osc of scheduled) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // Already finished.
    }
  }
  scheduled = [];
}

/** Schedules a soft two-note chime `delayMs` from now (replacing any pending one). */
export function scheduleChime(delayMs: number): void {
  cancelChime();
  if (!context || context.state !== 'running' || delayMs < 0) return;
  const at = context.currentTime + delayMs / 1000;
  scheduled = [tone(context, 784, at, 0.5, 0.22), tone(context, 1175, at + 0.16, 0.7, 0.18)];
}
