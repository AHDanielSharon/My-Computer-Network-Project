let ctx: AudioContext | null = null;
let ringTimer: number | null = null;
let ringNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  audio();
}

function tone(frequency: number, start: number, duration: number, volume = 0.12, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ac.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

export function playMessageSound() {
  tone(740, 0, 0.12, 0.07, 'sine');
  tone(988, 0.09, 0.18, 0.06, 'sine');
}

export function playSentSound() {
  tone(880, 0, 0.06, 0.035, 'sine');
}

export function playCallStart() {
  tone(523, 0, 0.14, 0.08);
  tone(659, 0.12, 0.14, 0.08);
  tone(784, 0.24, 0.22, 0.08);
}

export function playCallEnd() {
  tone(660, 0, 0.15, 0.08);
  tone(523, 0.13, 0.15, 0.08);
  tone(392, 0.26, 0.3, 0.08);
}

export function startRingtone() {
  stopRingtone();
  const ring = () => {
    const ac = audio();
    if (!ac) return;
    for (const extra of [0, 0.42, 0.84]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = extra === 0.42 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, ac.currentTime + extra);
      gain.gain.exponentialRampToValueAtTime(0.09, ac.currentTime + extra + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + extra + 0.32);
      osc.connect(gain).connect(ac.destination);
      osc.start(ac.currentTime + extra);
      osc.stop(ac.currentTime + extra + 0.36);
      ringNodes.push({ osc, gain });
    }
  };
  ring();
  ringTimer = window.setInterval(ring, 2200);
}

export function stopRingtone() {
  if (ringTimer !== null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  for (const { osc, gain } of ringNodes) {
    try {
      gain.gain.cancelScheduledValues(ctx?.currentTime || 0);
      gain.gain.setValueAtTime(0.0001, ctx?.currentTime || 0);
      osc.stop(ctx?.currentTime ? ctx.currentTime + 0.02 : 0);
    } catch {}
  }
  ringNodes = [];
}
