let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playShutterSound(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Mechanical shutter transient burst
  const bufferSize = ctx.sampleRate * 0.045;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.exp((-i / bufferSize) * 9);
    data[i] = (Math.random() * 2 - 1) * env * 0.45;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.setValueAtTime(1.4, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);

  // Subtle second curtain click
  const osc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now + 0.035);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.075);
  clickGain.gain.setValueAtTime(0.18, now + 0.035);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
  osc.connect(clickGain);
  clickGain.connect(ctx.destination);
  osc.start(now + 0.035);
  osc.stop(now + 0.08);
}

export function playCountdownBeep(final = false, muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(final ? 1046.5 : 659.25, now);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (final ? 0.18 : 0.1));

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + (final ? 0.2 : 0.12));
}
