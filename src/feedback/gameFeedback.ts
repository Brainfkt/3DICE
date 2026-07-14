export type GameSoundKind = "grab" | "throw" | "impact" | "result";
export type HapticKind = "impact" | "result";

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastImpactAt = -Infinity;
let lastHapticAt = -Infinity;

function getContext() {
  if (typeof window === "undefined") return null;
  if (context) return context;

  const AudioContextConstructor =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  context = new AudioContextConstructor();
  return context;
}

function getNoiseBuffer(audioContext: AudioContext) {
  if (noiseBuffer) return noiseBuffer;

  const length = Math.ceil(audioContext.sampleRate * 0.18);
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x3d1ce;

  for (let index = 0; index < length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[index] = (state / 0xffffffff) * 2 - 1;
  }

  noiseBuffer = buffer;
  return buffer;
}

function materialPitch(appearanceId: string, surfaceId: string) {
  const diePitch = appearanceId === "brushed-metal"
    ? 1.42
    : appearanceId === "translucent"
      ? 1.24
      : appearanceId === "obsidian"
        ? 0.82
        : 1;
  const surfacePitch = surfaceId === "felt"
    ? 0.76
    : surfaceId === "dark-wood"
      ? 0.9
      : surfaceId === "frosted-glass"
        ? 1.3
        : 1;
  return diePitch * surfacePitch;
}

function playTone(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "sine",
) {
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(frequency * 0.62, 24),
    now + duration,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0002), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playNoise(
  audioContext: AudioContext,
  frequency: number,
  duration: number,
  gainValue: number,
) {
  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = getNoiseBuffer(audioContext);
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(Math.max(gainValue, 0.0002), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter).connect(gain).connect(audioContext.destination);
  source.start(now);
  source.stop(now + duration);
}

export function playGameSound({
  appearanceId,
  enabled,
  kind,
  strength = 0.5,
  surfaceId,
}: {
  appearanceId: string;
  enabled: boolean;
  kind: GameSoundKind;
  strength?: number;
  surfaceId: string;
}) {
  if (!enabled) return;

  const audioContext = getContext();
  if (!audioContext) return;
  void audioContext.resume();

  const clampedStrength = Math.min(Math.max(strength, 0), 1);
  const pitch = materialPitch(appearanceId, surfaceId);

  if (kind === "impact") {
    const now = performance.now();
    if (now - lastImpactAt < 48) return;
    lastImpactAt = now;
    playTone(audioContext, 118 * pitch, 0.075, 0.018 + clampedStrength * 0.045, "triangle");
    playNoise(audioContext, 420 * pitch, 0.055, 0.012 + clampedStrength * 0.026);
    return;
  }

  if (kind === "throw") {
    playNoise(audioContext, 650 * pitch, 0.14, 0.035);
    playTone(audioContext, 92 * pitch, 0.12, 0.024, "sine");
    return;
  }

  if (kind === "grab") {
    playTone(audioContext, 220 * pitch, 0.045, 0.018, "triangle");
    return;
  }

  playTone(audioContext, 392 * pitch, 0.13, 0.034, "sine");
  window.setTimeout(() => {
    if (!context) return;
    playTone(context, 523.25 * pitch, 0.17, 0.028, "sine");
  }, 62);
}

export function triggerHaptic({
  enabled,
  kind,
  strength = 0.5,
}: {
  enabled: boolean;
  kind: HapticKind;
  strength?: number;
}) {
  if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  const now = performance.now();
  if (kind === "impact") {
    if (now - lastHapticAt < 90 || strength < 0.32) return;
    lastHapticAt = now;
    navigator.vibrate(strength > 0.72 ? 18 : 10);
    return;
  }

  lastHapticAt = now;
  navigator.vibrate([16, 34, 22]);
}

