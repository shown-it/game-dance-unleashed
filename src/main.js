const CONFIG = {
  bpm: 125,
  beatDuration: 60 / 125,
  maxScheduledBeats: 4096,
  hitWindow: 0.09,
  scoreLockDuration: 1.5,
  scheduleLookahead: 0.18,
  guideVisibleBeatsAhead: 4,
  guideVisibleBeatsBehind: 1,
  crowdKeyframes: [
    { streak: 0, crowd: 0 },
    { streak: 8, crowd: 0 },
    { streak: 9, crowd: 1 },
    { streak: 13, crowd: 5 },
    { streak: 17, crowd: 10 },
    { streak: 25, crowd: 100 },
    { streak: 33, crowd: 200 },
    { streak: 41, crowd: 300 },
    { streak: 49, crowd: 400 },
    { streak: 57, crowd: 500 },
    { streak: 65, crowd: 1000 },
    { streak: 81, crowd: 2000 },
    { streak: 97, crowd: 3000 },
    { streak: 113, crowd: 4000 },
    { streak: 129, crowd: 5000 },
    { streak: 145, crowd: 10000 },
    { streak: 161, crowd: 20000 },
    { streak: 177, crowd: 30000 },
    { streak: 193, crowd: 40000 },
    { streak: 209, crowd: 50000 },
    { streak: 225, crowd: 100000 },
    { streak: 241, crowd: 200000 },
    { streak: 257, crowd: 300000 },
    { streak: 273, crowd: 400000 },
    { streak: 289, crowd: 500000 },
    { streak: 300, crowd: 1000000 },
  ],
  crowdMilestones: [
    1,
    5,
    10,
    100,
    200,
    300,
    400,
    500,
    1000,
    2000,
    3000,
    4000,
    5000,
    10000,
    20000,
    30000,
    40000,
    50000,
    100000,
    200000,
    300000,
    400000,
    500000,
    1000000,
  ],
  phaseThresholds: [0, 16, 48, 96, 160, 220],
  audioPhaseStartBeat: 9,
  audioPhaseIntervalBeats: 8,
  milestoneFxDuration: 1.9,
};

const PHASE_COLORS = [
  ["#05060d", "#0c1324", "#ff8e47"],
  ["#05070f", "#11182d", "#ff6f59"],
  ["#040a12", "#0b1d29", "#78ef7d"],
  ["#040814", "#102036", "#63d5ff"],
  ["#070616", "#1c1135", "#ff83d1"],
  ["#040a12", "#0a231f", "#fff176"],
];

class AudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.runBus = null;
    this.noiseBuffer = null;
  }

  async init() {
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextCtor();

      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 20;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;

      this.master = this.context.createGain();
      this.master.gain.value = 0.9;

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.8;

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = 0.95;

      this.musicBus.connect(compressor);
      this.sfxBus.connect(compressor);
      compressor.connect(this.master);
      this.master.connect(this.context.destination);

      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  createNoiseBuffer() {
    const length = this.context.sampleRate * 0.6;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  now() {
    return this.context ? this.context.currentTime : performance.now() / 1000;
  }

  startRunBus() {
    this.stopRunBus();
    this.runBus = this.context.createGain();
    this.runBus.gain.setValueAtTime(0.84, this.now());
    this.runBus.connect(this.musicBus);
  }

  stopRunBus() {
    if (!this.runBus) {
      return;
    }

    const releaseAt = this.now();
    this.runBus.gain.cancelScheduledValues(releaseAt);
    this.runBus.gain.setValueAtTime(this.runBus.gain.value, releaseAt);
    this.runBus.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.12);
    const bus = this.runBus;
    window.setTimeout(() => bus.disconnect(), 220);
    this.runBus = null;
  }

  pulseOscillator({
    time,
    duration,
    type,
    from,
    to,
    gain,
    destination,
    attack = 0.002,
    release = duration,
  }) {
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 30), time + duration);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(gain, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + release);

    osc.connect(amp);
    amp.connect(destination);

    osc.start(time);
    osc.stop(time + Math.max(duration, release) + 0.02);
  }

  pulseNoise({ time, duration, gain, highpass, bandpass, destination }) {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;

    const amp = this.context.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    const high = this.context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = highpass;

    source.connect(high);

    if (bandpass) {
      const band = this.context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = bandpass;
      band.Q.value = 0.8;
      high.connect(band);
      band.connect(amp);
    } else {
      high.connect(amp);
    }

    amp.connect(destination);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  playKick(time = this.now(), accent = 1) {
    this.pulseOscillator({
      time,
      duration: 0.18,
      type: "sine",
      from: 132,
      to: 42,
      gain: 0.58 * accent,
      destination: this.sfxBus,
      release: 0.22,
    });

    this.pulseOscillator({
      time,
      duration: 0.055,
      type: "triangle",
      from: 220,
      to: 62,
      gain: 0.15 * accent,
      destination: this.sfxBus,
      release: 0.08,
    });
  }

  playMilestoneKick(time = this.now(), accent = 1) {
    this.playKick(time, accent * 1.05);

    this.pulseOscillator({
      time,
      duration: 0.2,
      type: "square",
      from: 320,
      to: 118,
      gain: 0.24 * accent,
      destination: this.sfxBus,
      release: 0.24,
    });

    this.pulseOscillator({
      time,
      duration: 0.11,
      type: "sawtooth",
      from: 1180,
      to: 420,
      gain: 0.08 * accent,
      destination: this.sfxBus,
      release: 0.13,
    });
  }

  playMilestoneStinger(time = this.now(), intensity = 0.5) {
    const peak = 0.04 + intensity * 0.1;
    this.pulseOscillator({
      time,
      duration: 0.16 + intensity * 0.12,
      type: "triangle",
      from: 720 + intensity * 260,
      to: 260 + intensity * 110,
      gain: peak,
      destination: this.sfxBus,
      release: 0.22 + intensity * 0.16,
    });

    if (intensity >= 0.45) {
      this.playClap(time + 0.01, this.sfxBus);
    }
  }

  playGuideClick(time, accent = 1) {
    this.pulseOscillator({
      time,
      duration: 0.045,
      type: "square",
      from: accent > 1 ? 1680 : 1420,
      to: accent > 1 ? 1260 : 1080,
      gain: 0.24 * accent,
      destination: this.runBus || this.sfxBus,
      release: 0.055,
    });

    this.pulseOscillator({
      time,
      duration: 0.028,
      type: "triangle",
      from: 920,
      to: 760,
      gain: 0.05 * accent,
      destination: this.runBus || this.sfxBus,
      release: 0.035,
    });
  }

  playBass(time, accent = 1, variant = "main") {
    const voicings = {
      main: {
        lowFrom: accent > 1 ? 108 : 96,
        lowTo: accent > 1 ? 102 : 90,
        lowGain: 0.12 * accent,
        midFrom: accent > 1 ? 216 : 192,
        midTo: accent > 1 ? 204 : 180,
        midGain: 0.07 * accent,
        length: 0.24,
        release: 0.28,
      },
      off: {
        lowFrom: accent > 1 ? 122 : 110,
        lowTo: accent > 1 ? 112 : 100,
        lowGain: 0.1 * accent,
        midFrom: accent > 1 ? 244 : 220,
        midTo: accent > 1 ? 224 : 198,
        midGain: 0.06 * accent,
        length: 0.18,
        release: 0.22,
      },
      entry: {
        lowFrom: accent > 1 ? 132 : 118,
        lowTo: accent > 1 ? 118 : 104,
        lowGain: 0.14 * accent,
        midFrom: accent > 1 ? 264 : 236,
        midTo: accent > 1 ? 238 : 210,
        midGain: 0.08 * accent,
        length: 0.22,
        release: 0.26,
      },
    };
    const voice = voicings[variant] || voicings.main;

    this.pulseOscillator({
      time,
      duration: voice.length,
      type: "square",
      from: voice.lowFrom,
      to: voice.lowTo,
      gain: voice.lowGain,
      destination: this.runBus,
      release: voice.release,
    });

    this.pulseOscillator({
      time,
      duration: Math.max(voice.length - 0.02, 0.12),
      type: "triangle",
      from: voice.midFrom,
      to: voice.midTo,
      gain: voice.midGain,
      destination: this.runBus,
      release: Math.max(voice.release - 0.02, 0.14),
    });
  }

  playBassGroove(beatTime, beatInBar, accent = 1) {
    this.playBass(beatTime, accent, "main");
    this.playBass(beatTime + CONFIG.beatDuration / 2, beatInBar === 3 ? accent * 1.05 : 1, "off");
  }

  playBassEntry(time, beatInBar, accent = 1) {
    this.playBass(time, accent * 1.1, "entry");
    this.playBass(time + CONFIG.beatDuration / 2, beatInBar === 3 ? accent * 1.2 : accent * 1.05, "entry");
    this.pulseOscillator({
      time: time + CONFIG.beatDuration / 2,
      duration: 0.16,
      type: "sawtooth",
      from: 196,
      to: 124,
      gain: 0.05 * accent,
      destination: this.runBus,
      release: 0.18,
    });
  }

  playHat(time, gain = 0.055) {
    this.pulseNoise({
      time,
      duration: 0.06,
      gain: gain * 1.35,
      highpass: 3600,
      bandpass: 6200,
      destination: this.runBus || this.sfxBus,
    });

    this.pulseOscillator({
      time,
      duration: 0.03,
      type: "square",
      from: 2100,
      to: 1500,
      gain: gain * 0.18,
      destination: this.runBus || this.sfxBus,
      release: 0.04,
    });
  }

  playSnare(time = this.now(), gain = 0.14, destination = this.sfxBus) {
    this.pulseNoise({
      time,
      duration: 0.16,
      gain,
      highpass: 1200,
      bandpass: 2400,
      destination,
    });

    this.pulseOscillator({
      time,
      duration: 0.08,
      type: "triangle",
      from: 240,
      to: 170,
      gain: 0.04,
      destination,
      release: 0.09,
    });
  }

  playClap(time = this.now(), destination = this.sfxBus) {
    [0, 0.012, 0.025].forEach((offset, index) => {
      this.pulseNoise({
        time: time + offset,
        duration: 0.07,
        gain: 0.08 - index * 0.01,
        highpass: 1800,
        bandpass: 3100,
        destination,
      });
    });
  }

  playChord(time, root, gain = 0.05) {
    [1, 5 / 4, 3 / 2].forEach((ratio) => {
      this.pulseOscillator({
        time,
        duration: 0.42,
        type: "sawtooth",
        from: root * ratio,
        to: root * ratio * 0.995,
        gain,
        destination: this.runBus,
        attack: 0.02,
        release: 0.48,
      });
    });
  }

  playPad(time, root, gain = 0.03) {
    [1, 3 / 2].forEach((ratio) => {
      this.pulseOscillator({
        time,
        duration: 0.8,
        type: "sine",
        from: root * ratio,
        to: root * ratio,
        gain,
        destination: this.runBus,
        attack: 0.04,
        release: 0.9,
      });
    });
  }

  playLead(time, beatInBar, gain = 0.04) {
    const sequence = [440, 554, 659, 740];
    const note = sequence[beatInBar % sequence.length];
    this.pulseOscillator({
      time,
      duration: 0.11,
      type: "square",
      from: note,
      to: note * 0.98,
      gain,
      destination: this.runBus,
      release: 0.15,
    });
  }

  playCountdownTick(time, finalTick = false) {
    this.pulseOscillator({
      time,
      duration: 0.06,
      type: "square",
      from: finalTick ? 900 : 620,
      to: finalTick ? 780 : 520,
      gain: finalTick ? 0.08 : 0.05,
      destination: this.sfxBus,
      release: 0.09,
    });
  }

  playMiss() {
    const time = this.now();
    this.playSnare(time, 0.17, this.sfxBus);
    this.pulseOscillator({
      time,
      duration: 0.2,
      type: "sawtooth",
      from: 180,
      to: 44,
      gain: 0.08,
      destination: this.sfxBus,
      release: 0.22,
    });
  }

  playRunEndJingle(tier = 0) {
    const time = this.now() + 0.09;
    const patterns = [
      { notes: [196, 174.61, 146.83], gain: 0.038, wave: "square", spacing: 0.12 },
      { notes: [220, 261.63, 329.63], gain: 0.046, wave: "triangle", spacing: 0.11 },
      { notes: [261.63, 329.63, 392, 523.25], gain: 0.056, wave: "triangle", spacing: 0.1 },
      { notes: [329.63, 392, 493.88, 659.25], gain: 0.068, wave: "sawtooth", spacing: 0.09 },
      { notes: [392, 523.25, 659.25, 783.99, 1046.5], gain: 0.08, wave: "sawtooth", spacing: 0.08 },
    ];
    const pattern = patterns[Math.max(0, Math.min(patterns.length - 1, tier))];

    pattern.notes.forEach((note, index) => {
      const noteTime = time + index * pattern.spacing;
      this.pulseOscillator({
        time: noteTime,
        duration: 0.14,
        type: pattern.wave,
        from: note,
        to: note * 0.992,
        gain: pattern.gain,
        destination: this.sfxBus,
        attack: 0.01,
        release: 0.18,
      });
    });

    if (tier >= 2) {
      this.playClap(time + pattern.spacing, this.sfxBus);
    }

    if (tier >= 4) {
      this.playMilestoneStinger(time + pattern.spacing * 2, 1);
    }
  }

  scheduleBeat(beatIndex, beatTime, phase) {
    if (!this.runBus) {
      return;
    }

    const beatInBar = beatIndex % 4;
    const accent = beatInBar === 0 ? 1.25 : 1;
    const densityLevel = Math.max(0, phase - 5);
    const guideHatGain = phase >= 2 ? 0.028 : 0.016;

    if (phase === 0) {
      this.playGuideClick(beatTime, accent);
    }

    this.playHat(beatTime + CONFIG.beatDuration / 2, guideHatGain);

    if (phase >= 1) {
      this.playBassGroove(beatTime, beatInBar, accent);
    }

    if (phase >= 2) {
      this.playHat(beatTime, 0.038 + Math.min(densityLevel, 4) * 0.003);
      if (beatInBar === 1 || beatInBar === 3) {
        this.playClap(beatTime + CONFIG.beatDuration * 0.02, this.runBus);
      }
    }

    if (phase >= 3 && (beatInBar === 0 || beatInBar === 2)) {
      const roots = [146.83, 164.81, 174.61, 130.81];
      this.playChord(
        beatTime,
        roots[Math.floor(beatIndex / 4) % roots.length],
        (beatInBar === 0 ? 0.07 : 0.05) + Math.min(densityLevel, 5) * 0.004
      );
    }

    if (phase >= 4 && beatInBar === 0) {
      const pads = [73.42, 82.41, 87.31, 65.41];
      this.playPad(
        beatTime,
        pads[Math.floor(beatIndex / 4) % pads.length],
        0.05 + Math.min(densityLevel, 6) * 0.003
      );
    }

    if (phase >= 4) {
      this.playHat(beatTime + CONFIG.beatDuration * 0.75, 0.024 + Math.min(densityLevel, 4) * 0.002);
    }

    if (phase >= 5) {
      this.playLead(
        beatTime + CONFIG.beatDuration / 2,
        beatInBar,
        0.05 + Math.min(densityLevel, 6) * 0.003
      );
      if (beatInBar === 1 || beatInBar === 3) {
        this.playLead(
          beatTime + CONFIG.beatDuration * 0.75,
          beatInBar + 1,
          0.032 + Math.min(densityLevel, 5) * 0.002
        );
      }
    }

    if (densityLevel >= 1) {
      this.playBass(beatTime + CONFIG.beatDuration * 0.25, 0.82, "off");
      if (beatInBar === 1 || beatInBar === 3) {
        this.playClap(beatTime + CONFIG.beatDuration * 0.18, this.runBus);
      }
    }

    if (densityLevel >= 2 && beatInBar === 3) {
      const roots = [146.83, 164.81, 174.61, 130.81];
      this.playChord(
        beatTime + CONFIG.beatDuration * 0.5,
        roots[Math.floor(beatIndex / 4) % roots.length],
        0.052
      );
    }

    if (densityLevel >= 3) {
      this.playHat(beatTime + CONFIG.beatDuration * 0.875, 0.022);
      if (beatInBar === 0 || beatInBar === 2) {
        this.playPad(beatTime + CONFIG.beatDuration * 0.25, 82.41, 0.028);
      }
    }

    if (densityLevel >= 4 && (beatInBar === 1 || beatInBar === 3)) {
      this.playLead(beatTime + CONFIG.beatDuration * 0.25, beatInBar + 2, 0.028);
    }

    if (densityLevel >= 5 && (beatInBar === 0 || beatInBar === 2)) {
      this.playBass(beatTime + CONFIG.beatDuration * 0.125, 0.72, "off");
    }

    if (densityLevel >= 6) {
      this.playHat(beatTime + CONFIG.beatDuration * 0.125, 0.018);
    }

    if (densityLevel >= 7 && beatInBar === 1) {
      const roots = [146.83, 164.81, 174.61, 130.81];
      this.playChord(beatTime + CONFIG.beatDuration * 0.25, roots[Math.floor(beatIndex / 4) % roots.length], 0.042);
    }

    if (densityLevel >= 8 && (beatInBar === 1 || beatInBar === 3)) {
      this.playClap(beatTime + CONFIG.beatDuration * 0.34, this.runBus);
    }

    if (densityLevel >= 9) {
      this.playLead(beatTime + CONFIG.beatDuration * 0.125, beatInBar + 3, 0.022);
    }
  }

  playPhaseEntry(phase, beatIndex, time) {
    if (!this.runBus || phase <= 0) {
      return;
    }

    const beatInBar = beatIndex % 4;
    const accent = beatInBar === 0 ? 1.25 : 1;

    if (phase === 1) {
      this.playBassEntry(time, beatInBar, accent * 1.2);
      return;
    }

    if (phase === 2) {
      this.playHat(time, 0.045);
      this.playClap(time + CONFIG.beatDuration * 0.02, this.runBus);
      return;
    }

    if (phase === 3) {
      const roots = [146.83, 164.81, 174.61, 130.81];
      this.playChord(time, roots[Math.floor(beatIndex / 4) % roots.length], 0.08);
      return;
    }

    if (phase === 4) {
      const pads = [73.42, 82.41, 87.31, 65.41];
      this.playPad(time, pads[Math.floor(beatIndex / 4) % pads.length], 0.055);
      return;
    }

    if (phase === 5) {
      this.playLead(time, beatInBar, 0.06);
      return;
    }

    if (phase === 6) {
      this.playBass(time + CONFIG.beatDuration * 0.25, 0.9, "off");
      this.playClap(time + CONFIG.beatDuration * 0.18, this.runBus);
      return;
    }

    if (phase === 7) {
      const roots = [146.83, 164.81, 174.61, 130.81];
      this.playChord(time + CONFIG.beatDuration * 0.5, roots[Math.floor(beatIndex / 4) % roots.length], 0.065);
      return;
    }

    if (phase === 8) {
      this.playPad(time + CONFIG.beatDuration * 0.25, 82.41, 0.034);
      this.playHat(time + CONFIG.beatDuration * 0.875, 0.03);
      return;
    }

    if (phase === 9) {
      this.playLead(time + CONFIG.beatDuration * 0.25, beatInBar + 2, 0.036);
      return;
    }

    if (phase > 9) {
      this.playLead(time + CONFIG.beatDuration * 0.125, beatInBar + 3, 0.028);
      this.playHat(time + CONFIG.beatDuration * 0.125, 0.02);
    }
  }

  triggerPercussion(type) {
    if (!this.context) {
      return;
    }

    const time = this.now();
    if (type === "snare") {
      this.playSnare(time);
      return;
    }

    if (type === "hat") {
      this.playHat(time, 0.11);
      return;
    }

    if (type === "clap") {
      this.playClap(time);
    }
  }
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.backlineDancers = Array.from({ length: CONFIG.crowdMilestones.length }, (_, index) => ({
      lane: index,
      seed: Math.random() * Math.PI * 2,
      scale: 0.72 + (index % 5) * 0.08,
      offsetY: (index % 3) * 8,
    }));
    this.agents = Array.from({ length: 1500 }, (_, index) => ({
      lane: index % 48,
      row: Math.floor(index / 48),
      seed: Math.random() * Math.PI * 2,
      sway: 0.25 + Math.random() * 0.75,
      scale: 0.7 + Math.random() * 1.2,
    }));
  }

  resize(width, height) {
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  snap(value, step = 4) {
    return Math.round(value / step) * step;
  }

  pixelRect(x, y, width, height, step = 4) {
    const ctx = this.ctx;
    ctx.fillRect(
      this.snap(x, step),
      this.snap(y, step),
      Math.max(step, this.snap(width, step)),
      Math.max(step, this.snap(height, step))
    );
  }

  pixelCircle(cx, cy, radius, color, step = 4, mode = "stroke") {
    const ctx = this.ctx;
    const r = Math.max(step, radius);
    const outer = r * r;
    const inner = Math.max(0, r - step * 1.4);
    const innerSq = inner * inner;

    ctx.fillStyle = color;

    for (let y = -r; y <= r; y += step) {
      for (let x = -r; x <= r; x += step) {
        const dist = x * x + y * y;
        if (mode === "fill") {
          if (dist <= outer) {
            ctx.fillRect(this.snap(cx + x, step), this.snap(cy + y, step), step, step);
          }
          continue;
        }

        if (dist <= outer && dist >= innerSq) {
          ctx.fillRect(this.snap(cx + x, step), this.snap(cy + y, step), step, step);
        }
      }
    }
  }

  draw(snapshot) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const [bg0, bg1, accent] = PHASE_COLORS[snapshot.phase];
    const pulse = snapshot.pulse;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = bg0;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = bg1;
    this.pixelRect(0, height * 0.58, width, height * 0.42, 8);

    ctx.fillStyle = `${accent}22`;
    for (let index = 0; index < 12; index += 1) {
      this.pixelRect(index * 32, 40 + ((index % 3) * 8), 16, height * 0.44, 8);
    }

    this.drawLights(snapshot, accent, width, height);
    this.drawPixelGrid(snapshot, width, height);
    this.drawCrowd(snapshot, accent, width, height);
    this.drawPulse(snapshot, accent, width, height, pulse);
    this.drawMilestoneFx(snapshot, accent, width, height);
    this.drawAuxFx(snapshot, width, height);
    this.drawTimingGuide(snapshot, accent, width, height);
    this.drawGuideLabel(snapshot, width, height);
    this.drawScanlines(snapshot, width, height);
    this.drawGlitchStrips(snapshot, width, height);
  }

  drawPixelGrid(snapshot, width, height) {
    const ctx = this.ctx;
    const cell = 16;
    const alpha = 0.08 + Math.min(snapshot.phase, 5) * 0.01;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
    for (let x = 0; x < width; x += cell) {
      this.pixelRect(x, 0, 2, height, 2);
    }
    for (let y = 0; y < height; y += cell) {
      this.pixelRect(0, y, width, 2, 2);
    }
    ctx.restore();
  }

  drawLights(snapshot, accent, width, height) {
    const ctx = this.ctx;
    const count = Math.min(snapshot.backlineCount || 0, this.backlineDancers.length);

    ctx.save();

    ctx.fillStyle = `${accent}14`;
    this.pixelRect(0, height * 0.66, width, 12, 4);

    if (count <= 0) {
      ctx.restore();
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const dancer = this.backlineDancers[index];
      const x = this.snap((width / (count + 1)) * (index + 1), 8);
      const sway = this.snap(Math.sin(snapshot.sceneTime * (1.4 + index * 0.09) + dancer.seed) * 18, 4);
      const bounce = this.snap((snapshot.pulse * 10 + Math.sin(snapshot.sceneTime * 2.1 + dancer.seed) * 3), 4);
      const scale = dancer.scale;
      const baseY = height * 0.69 + dancer.offsetY;

      ctx.fillStyle = `${accent}10`;
      this.pixelRect(x - 36, baseY - 132, 72, 116, 8);

      this.drawBackDancer({
        x: x + sway,
        baseY: baseY - bounce,
        scale,
        fill: index % 2 === 0 ? "rgba(8, 10, 18, 0.92)" : "rgba(14, 18, 32, 0.9)",
        accent,
        pulse: snapshot.pulse,
      });
    }

    ctx.restore();
  }

  drawBackDancer({ x, baseY, scale, fill, accent, pulse }) {
    const bodyWidth = this.snap(18 * scale, 4);
    const bodyHeight = this.snap(42 * scale, 4);
    const headSize = this.snap(14 * scale, 4);
    const armReach = this.snap((14 + pulse * 10) * scale, 4);
    const legHeight = this.snap(24 * scale, 4);
    const shoulderY = baseY - legHeight - bodyHeight + 8;
    const torsoX = x - bodyWidth / 2;
    const torsoY = baseY - legHeight - bodyHeight;

    this.ctx.fillStyle = fill;
    this.pixelRect(x - headSize / 2, torsoY - headSize + 4, headSize, headSize, 4);
    this.pixelRect(torsoX, torsoY, bodyWidth, bodyHeight, 4);
    this.pixelRect(torsoX - armReach, shoulderY, armReach, 8, 4);
    this.pixelRect(torsoX + bodyWidth, shoulderY + 4, armReach, 8, 4);
    this.pixelRect(x - bodyWidth / 2, baseY - legHeight, 8, legHeight, 4);
    this.pixelRect(x + bodyWidth / 2 - 8, baseY - legHeight + 4, 8, legHeight, 4);

    this.ctx.fillStyle = `${accent}22`;
    this.pixelRect(torsoX + 4, torsoY + 8, bodyWidth - 8, 8, 4);
    this.pixelRect(x - 4, torsoY - headSize + 8, 8, 4, 4);
  }

  drawCrowd(snapshot, accent, width, height) {
    const ctx = this.ctx;
    const visible = Math.min(
      this.agents.length,
      Math.floor(60 + Math.log10(snapshot.displayedCrowd + 10) * 260)
    );

    ctx.save();
    ctx.translate(0, snapshot.shakeY);

    for (let index = 0; index < visible; index += 1) {
      const agent = this.agents[index];
      const rowFactor = agent.row / 31;
      const x = ((agent.lane + 0.5) / 48) * width;
      const baseY = height * 0.92 - rowFactor * height * 0.44;
      const sway =
        Math.sin(snapshot.sceneTime * (2.1 + rowFactor * 1.7) + agent.seed) *
        (4 + snapshot.phase * 1.3) *
        agent.sway;
      const bounce =
        Math.max(snapshot.pulse * 1.8 - rowFactor, 0) * 8 * agent.scale;
      const size = (5 + rowFactor * 11) * agent.scale;
      const glow = Math.min(snapshot.phase * 0.06 + snapshot.pulse * 0.1, 0.38);

      ctx.fillStyle = `rgba(247, 242, 233, ${0.08 + rowFactor * 0.34 + glow})`;
      ctx.fillRect(Math.round(x + sway), Math.round(baseY - bounce), 2, Math.round(size));
      ctx.fillRect(
        Math.round(x + sway - 1),
        Math.round(baseY - size - bounce - (2 + rowFactor * 1.2)),
        Math.round(4 + rowFactor * 1.2),
        Math.round(4 + rowFactor * 1.2)
      );
    }

    ctx.restore();

    ctx.fillStyle = `${accent}18`;
    this.pixelRect(0, height * 0.73, width, height * 0.27, 8);
  }

  drawPulse(snapshot, accent, width, height, pulse) {
    const ctx = this.ctx;
    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const baseRadius = Math.min(width, height) * 0.11;
    const radius = baseRadius + pulse * 24;
    const targetRadius = baseRadius * 0.52;
    const incomingRadius =
      targetRadius + (baseRadius * 1.45 - targetRadius) * (1 - snapshot.beatProgress);

    ctx.save();
    ctx.translate(snapshot.shakeX, snapshot.shakeY);

    this.pixelCircle(centerX, centerY, radius * 1.4, `${accent}1b`, 6, "fill");
    this.pixelCircle(centerX, centerY, radius, `${accent}ee`, 6, "stroke");
    this.pixelCircle(centerX, centerY, targetRadius, "rgba(247, 242, 233, 0.5)", 6, "stroke");
    this.pixelCircle(centerX, centerY, targetRadius * 0.55, "rgba(247, 242, 233, 0.22)", 6, "fill");
    this.pixelCircle(centerX, centerY, incomingRadius, `${accent}d0`, 6, "stroke");
    this.pixelCircle(centerX, centerY, incomingRadius + 8, "rgba(116, 216, 255, 0.22)", 6, "stroke");

    ctx.fillStyle = `${accent}66`;
    this.pixelRect(centerX - 10, centerY - 10, 20, 20, 4);

    ctx.restore();
  }

  drawMilestoneFx(snapshot, accent, width, height) {
    if (!snapshot.milestoneFx) {
      return;
    }

    const ctx = this.ctx;
    const progress = snapshot.milestoneFx.progress;
    const alpha = 1 - progress;
    const intensity = snapshot.milestoneFx.intensity;
    const centerX = width * 0.5;
    const centerY = height * 0.46;
    const radius = Math.min(width, height) * (0.08 + intensity * 0.1 + progress * (0.1 + intensity * 0.18));

    ctx.save();
    for (const burst of snapshot.milestoneFx.bursts) {
      const burstX = width * burst.x;
      const burstY = height * burst.y;
      const burstRadius = radius * burst.scale;
      this.pixelCircle(
        burstX,
        burstY,
        burstRadius,
        `${accent}${Math.round(alpha * 220).toString(16).padStart(2, "0")}`,
        8,
        "stroke"
      );
      this.pixelCircle(
        burstX,
        burstY,
        burstRadius * 1.18,
        `rgba(247, 242, 233, ${alpha * 0.82})`,
        8,
        "stroke"
      );

      if (!snapshot.milestoneFx.minimal && burstIndexVisible(progress, burst.delay)) {
        ctx.fillStyle = `${accent}${Math.round(alpha * 80).toString(16).padStart(2, "0")}`;
        this.pixelRect(
          burstX - 10 - progress * 10,
          burstY - 10,
          20 + progress * 20,
          8,
          4
        );
        this.pixelRect(
          burstX - 4,
          burstY - 16 - progress * 10,
          8,
          24 + progress * 20,
          4
        );
      }
    }

    ctx.fillStyle = `rgba(247, 242, 233, ${alpha})`;
    ctx.textAlign = "center";
    ctx.font = `${Math.round(14 + intensity * 24)}px "Press Start 2P", monospace`;
    ctx.fillText(snapshot.milestoneFx.label, centerX, centerY - progress * 20);

    if (!snapshot.milestoneFx.minimal && intensity >= 0.45) {
      const bars = 3 + Math.floor(intensity * 4);
      for (let index = 0; index < bars; index += 1) {
        const offset = (index - (bars - 1) / 2) * 36;
        ctx.fillStyle = `rgba(82, 245, 255, ${alpha * 0.2})`;
        this.pixelRect(centerX - 70 + offset, centerY - 50 - progress * 30, 28, 8, 4);
        ctx.fillStyle = `rgba(255, 94, 91, ${alpha * 0.16})`;
        this.pixelRect(centerX + 42 - offset, centerY + 30 + progress * 16, 24, 8, 4);
      }
    }
    ctx.restore();
  }

  drawTimingGuide(snapshot, accent, width, height) {
    const ctx = this.ctx;
    if (!snapshot.guideMarkers || snapshot.guideMarkers.length === 0) {
      return;
    }

    const laneWidth = Math.min(width * 0.58, 560);
    const centerX = width * 0.5;
    const centerY = height * 0.8;
    const beatSpan = laneWidth / 5;
    const hitWindowWidth = Math.max(
      14,
      (CONFIG.hitWindow / CONFIG.beatDuration) * beatSpan
    );

    ctx.save();
    ctx.fillStyle = "rgba(247, 242, 233, 0.18)";
    this.pixelRect(centerX - laneWidth * 0.5, centerY - 2, laneWidth, 4, 4);

    ctx.fillStyle = `${accent}24`;
    this.pixelRect(centerX - hitWindowWidth, centerY - 16, hitWindowWidth * 2, 32, 4);

    ctx.fillStyle = `${accent}cc`;
    this.pixelRect(centerX - 2, centerY - 28, 4, 56, 4);

    snapshot.guideMarkers.forEach((marker) => {
      const x = centerX + marker.offset * beatSpan;
      if (x < centerX - laneWidth * 0.55 || x > centerX + laneWidth * 0.55) {
        return;
      }

      const alpha = Math.max(0.18, 1 - Math.abs(marker.offset) * 0.22);
      const size = marker.focus ? 16 : marker.major ? 12 : 8;
      ctx.fillStyle = marker.focus
        ? `${accent}ee`
        : marker.major
          ? `rgba(247, 242, 233, ${alpha})`
          : `rgba(247, 242, 233, ${alpha * 0.72})`;
      this.pixelRect(x - size / 2, centerY - size / 2, size, size, 4);
    });

    ctx.fillStyle = "rgba(247, 242, 233, 0.9)";
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText("HIT", centerX, centerY - 34);
    ctx.restore();
  }

  drawGuideLabel(snapshot, width, height) {
    const ctx = this.ctx;
    if (!snapshot.guideLabel) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(247, 242, 233, 0.88)";
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText(snapshot.guideLabel, width * 0.5, height * 0.16);
    ctx.restore();
  }

  drawScanlines(snapshot, width, height) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let y = 0; y < height; y += 8) {
      this.pixelRect(0, y, width, 2, 2);
    }
    ctx.restore();
  }

  drawGlitchStrips(snapshot, width, height) {
    if (snapshot.phase < 2) {
      return;
    }

    const ctx = this.ctx;
    const pulse = snapshot.pulse;
    const count = Math.min(2 + snapshot.phase, 7);
    ctx.save();
    for (let index = 0; index < count; index += 1) {
      const noise = Math.sin(snapshot.sceneTime * (5 + index * 1.7) + index * 2.3);
      if (noise < 0.55) {
        continue;
      }

      const y = this.snap((index * 97 + Math.floor(snapshot.sceneTime * 90)) % height, 4);
      const h = 4 + ((index + snapshot.phase) % 4) * 4;
      const xShift = this.snap((noise - 0.55) * 40 * (1 + pulse), 4);
      ctx.fillStyle = `rgba(82, 245, 255, ${0.05 + noise * 0.08})`;
      this.pixelRect(xShift, y, width * 0.92, h, 4);
      ctx.fillStyle = `rgba(255, 94, 91, ${0.04 + noise * 0.05})`;
      this.pixelRect(-xShift, y + 4, width * 0.9, Math.max(4, h - 4), 4);
    }
    ctx.restore();
  }

  drawAuxFx(snapshot, width, height) {
    if (!snapshot.auxFx || snapshot.auxFx.length === 0) {
      return;
    }

    const ctx = this.ctx;
    ctx.save();

    for (const effect of snapshot.auxFx) {
      const alpha = Math.max(0, 1 - effect.progress);
      const centerX = width * effect.x;
      const centerY = height * effect.y;
      const radius = 18 + effect.progress * 42;

      if (effect.variant === "firework") {
        const spokes = effect.spokes || 8;
        for (let index = 0; index < spokes; index += 1) {
          const angle = (Math.PI * 2 * index) / spokes;
          const burstX = centerX + Math.cos(angle) * radius * 0.9;
          const burstY = centerY + Math.sin(angle) * radius * 0.9;
          ctx.fillStyle = `#${effect.color}${Math.round(alpha * 170).toString(16).padStart(2, "0")}`;
          this.pixelRect(burstX - 4, burstY - 4, 8, 8, 4);
        }

        this.pixelCircle(centerX, centerY, radius * 0.7, `#${effect.color}${Math.round(alpha * 150).toString(16).padStart(2, "0")}`, 6, "stroke");
        ctx.fillStyle = `rgba(247, 242, 233, ${alpha * 0.9})`;
        this.pixelRect(centerX - 6, centerY - 6, 12, 12, 4);
        continue;
      }

      this.pixelCircle(centerX, centerY, radius, `#${effect.color}${Math.round(alpha * 180).toString(16).padStart(2, "0")}`, 6, "stroke");

      ctx.fillStyle = `rgba(247, 242, 233, ${alpha * 0.75})`;
      this.pixelRect(centerX - 4, centerY - radius * 0.6, 8, radius * 1.2, 4);
      this.pixelRect(centerX - radius * 0.6, centerY - 4, radius * 1.2, 8, 4);

      if (effect.variant !== "hat") {
        ctx.fillStyle = `#${effect.color}${Math.round(alpha * 110).toString(16).padStart(2, "0")}`;
        this.pixelRect(centerX - 16 - effect.progress * 16, centerY - 4, 32 + effect.progress * 32, 8, 4);
      }

      if (effect.variant === "clap") {
        ctx.fillStyle = `rgba(247, 242, 233, ${alpha * 0.42})`;
        this.pixelRect(centerX - 6, centerY - 22 - effect.progress * 12, 12, 12, 4);
        this.pixelRect(centerX - 6, centerY + 10 + effect.progress * 12, 12, 12, 4);
      }
    }

    ctx.restore();
  }
}

class Game {
  constructor() {
    this.dom = {
      canvas: document.getElementById("stage"),
      kickPad: document.getElementById("kickPad"),
      overlay: document.getElementById("stageOverlay"),
      overlayKicker: document.getElementById("overlayKicker"),
      overlayTitle: document.getElementById("overlayTitle"),
      overlayBody: document.getElementById("overlayBody"),
      crowdValue: document.getElementById("crowdValue"),
      rankValue: document.getElementById("rankValue"),
      streakValue: document.getElementById("streakValue"),
      judgementValue: document.getElementById("judgementValue"),
      bestValue: document.getElementById("bestValue"),
      percPads: [...document.querySelectorAll("[data-percussion]")],
    };

    this.audio = new AudioEngine();
    this.renderer = new Renderer(this.dom.canvas);
    this.state = "idle";
    this.currentCrowd = 0;
    this.displayedCrowd = 0;
    this.kickStreak = 0;
    this.phase = 0;
    this.lastJudgement = "Press Space or tap KICK";
    this.lastJudgementTone = "idle";
    this.bestCrowd = 0;
    this.bestKicks = 0;
    this.finalCrowd = 0;
    this.finalKicks = 0;
    this.scoreLockedUntil = 0;
    this.milestoneFx = null;
    this.auxFx = [];
    this.nextFireworkAt = 0;
    this.runStartTime = 0;
    this.guideStartTime = this.audio.now();
    this.scheduledBeatIndex = 0;
    this.transitionLocked = false;
    this.lastFrameTime = performance.now();
    this.loopSceneTime = 0;
    this.currentOverlay = {
      kicker: "",
      title: "dance, unleashed",
      body: "Drive the floor with your beat. Make the crowd dance, and unleash them into the night.",
    };

    this.bindEvents();
    this.handleResize();
    this.syncHUD(this.audio.now());
    window.addEventListener("resize", () => this.handleResize());
    requestAnimationFrame((time) => this.frame(time));
  }

  bindEvents() {
    window.addEventListener("keydown", (event) => this.onKeyDown(event));

    const kickTrigger = (event) => {
      event.preventDefault();
      this.flashPad(this.dom.kickPad);
      this.handleKick();
    };

    this.dom.kickPad.addEventListener("pointerdown", kickTrigger);
    this.dom.canvas.addEventListener("pointerdown", kickTrigger);

    this.dom.percPads.forEach((pad) => {
      pad.addEventListener("pointerdown", async (event) => {
        event.preventDefault();
        this.flashPad(pad);
        await this.ensureAudio();
        this.triggerAuxFx(pad.dataset.percussion);
        this.audio.triggerPercussion(pad.dataset.percussion);
      });
    });
  }

  onKeyDown(event) {
    if (event.repeat) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "a" || key === "s" || key === "d" || key === "j" || key === "k" || key === "l") {
      event.preventDefault();
      const percussion = { a: "snare", j: "snare", s: "hat", k: "hat", d: "clap", l: "clap" }[key];
      const pad = this.dom.percPads.find((item) => item.dataset.percussion === percussion);
      this.flashPad(pad);
      this.ensureAudio().then(() => {
        this.triggerAuxFx(percussion);
        this.audio.triggerPercussion(percussion);
      });
      return;
    }

    if (key === " " || key === "enter") {
      event.preventDefault();
      this.flashPad(this.dom.kickPad);
      this.handleKick();
    }
  }

  async ensureAudio() {
    await this.audio.init();
  }

  handleResize() {
    const bounds = this.dom.canvas.getBoundingClientRect();
    this.renderer.resize(bounds.width || 640, bounds.height || 360);
  }

  async handleKick() {
    if (this.state === "ended") {
      const now = this.audio.now();
      if (now < this.scoreLockedUntil) {
        return;
      }

      this.state = "idle";
      this.guideStartTime = now;
      this.lastJudgement = "Back to title";
      this.lastJudgementTone = "idle";
      return;
    }

    if (this.state === "idle") {
      await this.startRunAt();
      return;
    }

    if (this.state !== "playing") {
      return;
    }

    const now = this.audio.now();
    const targetTime = this.runStartTime + this.kickStreak * CONFIG.beatDuration;
    const delta = now - targetTime;

    if (Math.abs(delta) <= CONFIG.hitWindow) {
      this.registerKick(now, delta);
      return;
    }

    if (isWarmupStreak(this.kickStreak)) {
      this.restartWarmupFromKick(now);
      return;
    }

    this.failRun(delta < 0 ? "Early Miss" : "Late Miss");
  }

  async startRunAt() {
    if (this.transitionLocked) {
      return;
    }

    this.transitionLocked = true;
    try {
      await this.ensureAudio();
      const startTime = this.audio.now();
      this.audio.stopRunBus();
      this.state = "playing";
      this.runStartTime = startTime;
      this.kickStreak = 0;
      this.milestoneFx = null;
      this.currentCrowd = 0;
      this.displayedCrowd = 0;
      this.finalCrowd = 0;
      this.finalKicks = 0;
      this.scoreLockedUntil = 0;
      this.auxFx = [];
      this.nextFireworkAt = 0;
      this.phase = 0;
      this.scheduledBeatIndex = 1;
      this.audio.startRunBus();
      this.registerKick(startTime, 0);
      this.audio.scheduleBeat(0, startTime, this.phase);
    } finally {
      this.transitionLocked = false;
    }
  }

  restartWarmupFromKick(time) {
    this.audio.stopRunBus();
    this.audio.startRunBus();
    this.runStartTime = time;
    this.kickStreak = 0;
    this.phase = 0;
    this.currentCrowd = 0;
    this.displayedCrowd = 0;
    this.milestoneFx = null;
    this.nextFireworkAt = 0;
    this.scheduledBeatIndex = 1;
    this.lastJudgement = "Warmup";
    this.lastJudgementTone = "idle";
    this.registerKick(time, 0);
    this.audio.scheduleBeat(0, time, this.phase);
  }

  registerKick(time, delta) {
    const label =
      Math.abs(delta) <= 0.035 ? "On Beat" : delta < 0 ? "Early" : "Late";
    const accent = 1 + Math.min(this.phase, 4) * 0.08;
    const previousAudioPhase = getAudioPhaseForStreak(this.kickStreak);
    const previousCrowd = this.currentCrowd;
    this.kickStreak += 1;
    this.phase = getPhaseForStreak(this.kickStreak);
    const currentAudioPhase = getAudioPhaseForStreak(this.kickStreak);
    const nextCrowd = getCrowdForStreak(this.kickStreak);
    const milestone = getReachedMilestone(previousCrowd, nextCrowd);

    if (milestone) {
      const milestoneIntensity = getMilestoneIntensity(milestone);
      this.audio.playMilestoneKick(time, accent * 1.08);
      this.audio.playMilestoneStinger(time, milestoneIntensity);
      this.milestoneFx = createMilestoneFx({
        label: `${formatScoreLabel(milestone)} Unleashed`,
        intensity: milestoneIntensity,
        startTime: time,
      });
    } else {
      this.audio.playKick(time, accent);
    }

    this.currentCrowd = nextCrowd;
    this.lastJudgement = label;
    this.lastJudgementTone = label === "On Beat" ? "good" : "warn";

    if (currentAudioPhase > previousAudioPhase) {
      this.audio.playPhaseEntry(currentAudioPhase, this.kickStreak - 1, time);
    }
  }

  failRun(reason) {
    if (this.state !== "playing") {
      return;
    }

    this.state = "ended";
    this.finalCrowd = this.currentCrowd;
    this.finalKicks = this.kickStreak;
    this.guideStartTime = this.audio.now();
    this.scoreLockedUntil = this.guideStartTime + CONFIG.scoreLockDuration;
    this.audio.playMiss();
    this.audio.playRunEndJingle(getEndingTier(this.finalCrowd, this.finalKicks));
    this.audio.stopRunBus();
    this.milestoneFx = null;
    this.nextFireworkAt = 0;
    if (isNewBestScore(this.finalCrowd, this.finalKicks, this.bestCrowd, this.bestKicks)) {
      this.bestCrowd = this.finalCrowd;
      this.bestKicks = this.finalKicks;
    }
    this.lastJudgement = `${reason} • ${formatScoreLabel(this.finalCrowd)} Unleashed / ${this.finalKicks.toLocaleString()} KICKS`;
    this.lastJudgementTone = "bad";
  }

  updatePlaying(now) {
    while (this.scheduledBeatIndex < CONFIG.maxScheduledBeats) {
      const beatTime = this.runStartTime + this.scheduledBeatIndex * CONFIG.beatDuration;
      if (beatTime > now + CONFIG.scheduleLookahead) {
        break;
      }

      const audioPhase = getAudioPhaseForStreak(this.kickStreak);
      this.audio.scheduleBeat(this.scheduledBeatIndex, beatTime, audioPhase);
      this.scheduledBeatIndex += 1;
    }

    const targetTime = this.runStartTime + this.kickStreak * CONFIG.beatDuration;
    if (now > targetTime + CONFIG.hitWindow) {
      if (isWarmupStreak(this.kickStreak)) {
        this.lastJudgement = "Build the kick";
        this.lastJudgementTone = "idle";
        return;
      }

      this.failRun("Miss");
      return;
    }

    if (this.currentCrowd >= 1000000 && now >= this.nextFireworkAt) {
      this.triggerAuxFx("firework");
      if (Math.random() > 0.58) {
        this.triggerAuxFx("firework");
      }
      this.nextFireworkAt = now + 0.06 + Math.random() * 0.12;
    }
  }

  syncHUD(now) {
    this.dom.crowdValue.textContent = Math.round(this.displayedCrowd).toLocaleString();
    this.dom.rankValue.textContent = getRankLabel(this.currentCrowd, this.kickStreak);
    this.dom.streakValue.textContent = String(this.kickStreak);
    this.dom.judgementValue.textContent = this.lastJudgement;
    this.dom.bestValue.textContent = `Best ${formatScoreLabel(this.bestCrowd)} Unleashed / ${this.bestKicks.toLocaleString()} KICKS`;

    const overlay = getOverlayForState({
      state: this.state,
      scoreCrowd: this.finalCrowd || this.currentCrowd,
      scoreKicks: this.finalKicks || this.kickStreak,
      bestCrowd: this.bestCrowd,
      bestKicks: this.bestKicks,
      scoreLockedUntil: this.scoreLockedUntil,
      now,
    });

    this.dom.overlay.style.opacity =
      (this.state === "playing" && this.kickStreak > 0)
        ? "0"
        : "1";
    this.dom.overlay.dataset.mode = overlay.mode;
    this.dom.overlayKicker.textContent = overlay.kicker;
    this.dom.overlayTitle.textContent = overlay.title;
    this.dom.overlayBody.textContent = overlay.body;
  }

  frame(frameTime) {
    const deltaSeconds = Math.min((frameTime - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = frameTime;
    this.loopSceneTime += deltaSeconds;

    const now = this.audio.now();
    if (this.state === "playing") {
      this.updatePlaying(now);
    }

    this.displayedCrowd += (this.currentCrowd - this.displayedCrowd) * 0.1;
    if (this.milestoneFx && now > this.milestoneFx.until) {
      this.milestoneFx = null;
    }
    this.auxFx = this.auxFx.filter((effect) => now <= effect.until);
    this.syncHUD(now);

    const phase = this.state === "playing" ? this.phase : 0;
    const pulse = getPulseForTime({
      state: this.state,
      now,
      runStartTime: this.runStartTime,
      guideStartTime: this.guideStartTime,
    });
    const beatProgress = getBeatProgress({
      state: this.state,
      now,
      runStartTime: this.runStartTime,
      guideStartTime: this.guideStartTime,
    });

    const shakeStrength = this.state === "playing" ? pulse * phase * 0.5 : 0;
      this.renderer.draw({
      displayedCrowd: this.displayedCrowd,
      backlineCount: getUnlockedBacklineCount(this.displayedCrowd),
      phase,
      pulse,
      beatProgress,
      sceneTime: this.loopSceneTime,
      shakeX: Math.sin(this.loopSceneTime * 24) * shakeStrength,
      shakeY: Math.cos(this.loopSceneTime * 17) * shakeStrength,
      milestoneFx: this.milestoneFx
        ? {
            label: this.milestoneFx.label,
            intensity: this.milestoneFx.intensity,
            bursts: this.milestoneFx.bursts,
            progress: 1 - (this.milestoneFx.until - now) / this.milestoneFx.duration,
          }
        : null,
      auxFx: this.auxFx.map((effect) => ({
        ...effect,
        progress: 1 - (effect.until - now) / effect.duration,
      })),
      guideMarkers: getGuideMarkers({
        state: this.state,
        now,
        runStartTime: this.runStartTime,
        guideStartTime: this.guideStartTime,
        kickStreak: this.kickStreak,
      }),
      guideLabel:
        this.state === "playing"
          ? isWarmupStreak(this.kickStreak)
            ? "Keep the kick alive"
            : "Kick when the circles overlap"
          : this.state === "ended"
            ? now < this.scoreLockedUntil
              ? `Score locked ${Math.ceil(this.scoreLockedUntil - now)}`
              : "Press KICK to start a new run"
            : "First kick starts the groove",
    });

    requestAnimationFrame((time) => this.frame(time));
  }

  triggerAuxFx(type) {
    const now = this.audio.now();
    const palette = {
      snare: "ff8e47",
      hat: "63d5ff",
      clap: "9aff78",
      firework: ["ff8e47", "63d5ff", "9aff78", "fff176", "ff83d1"][Math.floor(Math.random() * 5)],
    };
    const isFirework = type === "firework";

    this.auxFx.push({
      variant: type,
      color: palette[type] || "ffffff",
      x: 0.1 + Math.random() * 0.8,
      y: isFirework ? 0.12 + Math.random() * 0.48 : 0.16 + Math.random() * 0.62,
      spokes: isFirework ? 6 + Math.floor(Math.random() * 5) : undefined,
      duration: isFirework ? 0.72 : 0.42,
      until: now + (isFirework ? 0.72 : 0.42),
    });

    if (this.auxFx.length > 48) {
      this.auxFx.splice(0, this.auxFx.length - 48);
    }
  }

  flashPad(element) {
    if (!element) {
      return;
    }

    element.classList.add("is-active");
    window.clearTimeout(element.flashTimer);
    element.flashTimer = window.setTimeout(() => {
      element.classList.remove("is-active");
    }, 90);
  }
}

function getPhaseForStreak(streak) {
  let phase = 0;
  for (let index = 0; index < CONFIG.phaseThresholds.length; index += 1) {
    if (streak >= CONFIG.phaseThresholds[index]) {
      phase = index;
    }
  }
  return phase;
}

function getAudioPhaseForStreak(streak) {
  if (streak < CONFIG.audioPhaseStartBeat) {
    return 0;
  }

  return Math.floor((streak - CONFIG.audioPhaseStartBeat) / CONFIG.audioPhaseIntervalBeats) + 1;
}

function isWarmupStreak(streak) {
  return streak < CONFIG.audioPhaseStartBeat;
}

function getCrowdForStreak(streak) {
  if (streak <= 0) {
    return 0;
  }

  const frames = getCrowdKeyframesUpTo(streak);

  for (let index = 0; index < frames.length - 1; index += 1) {
    const start = frames[index];
    const end = frames[index + 1];
    if (streak < start.streak || streak > end.streak) {
      continue;
    }

    const ratio =
      end.streak === start.streak
        ? 1
        : (streak - start.streak) / (end.streak - start.streak);

    return start.crowd + (end.crowd - start.crowd) * easeOutCubic(ratio);
  }

  return frames[frames.length - 1].crowd;
}

function getReachedMilestone(previousCrowd, nextCrowd) {
  let reached = null;
  for (const milestone of getCrowdMilestonesUpTo(nextCrowd)) {
    if (previousCrowd < milestone && nextCrowd >= milestone) {
      reached = milestone;
    }
  }
  return reached;
}

function getUnlockedBacklineCount(crowd) {
  if (crowd <= 0) {
    return 0;
  }

  const maxCount = CONFIG.crowdMilestones.length;
  const ratio = Math.min(Math.log10(crowd + 1) / 6, 1);
  return Math.max(1, Math.ceil(ratio * maxCount));
}

function formatScoreLabel(value) {
  return Math.round(value).toLocaleString();
}

function getMilestoneIntensity(milestone) {
  if (milestone <= 10) {
    return 0.18;
  }

  if (milestone <= 500) {
    return 0.32;
  }

  if (milestone <= 5000) {
    return 0.48;
  }

  if (milestone <= 50000) {
    return 0.66;
  }

  if (milestone <= 500000) {
    return 0.82;
  }

  return 1;
}

function getCrowdKeyframesUpTo(streak) {
  const frames = [...CONFIG.crowdKeyframes];

  while (frames[frames.length - 1].streak < streak) {
    const previous = frames[frames.length - 1];
    frames.push({
      streak: previous.streak + 16,
      crowd: getNextScoreMilestone(previous.crowd),
    });
  }

  return frames;
}

function getCrowdMilestonesUpTo(maxCrowd) {
  const milestones = [...CONFIG.crowdMilestones];

  while (milestones[milestones.length - 1] < maxCrowd) {
    milestones.push(getNextScoreMilestone(milestones[milestones.length - 1]));
  }

  return milestones;
}

function getNextScoreMilestone(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const leading = Math.round(value / magnitude);

  if (leading < 5) {
    return (leading + 1) * magnitude;
  }

  return 10 * magnitude;
}

function createMilestoneFx({ label, intensity, startTime }) {
  const minimal = intensity <= 0.32;
  const burstCount = minimal ? 0 : 2 + Math.round(intensity * 4);
  const bursts = [{ x: 0.5, y: 0.46, scale: 1, delay: 0 }];

  for (let index = 0; index < burstCount; index += 1) {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / burstCount;
    const radius = 0.12 + intensity * 0.1 + (index % 2) * 0.035;
    bursts.push({
      x: clamp(0.5 + Math.cos(angle) * radius, 0.18, 0.82),
      y: clamp(0.48 + Math.sin(angle) * radius * 0.8, 0.18, 0.78),
      scale: 0.45 + intensity * 0.42 + (index % 3) * 0.06,
      delay: 0.04 * (index + 1),
    });
  }

  const duration = CONFIG.milestoneFxDuration + intensity * 0.45;
  return {
    label,
    intensity,
    minimal,
    bursts,
    duration,
    until: startTime + duration,
  };
}

function burstIndexVisible(progress, delay) {
  return progress >= delay;
}

function getOverlayForState({ state, scoreCrowd, scoreKicks, bestCrowd, bestKicks, scoreLockedUntil = 0, now = 0 }) {
  if (state === "ended") {
    const tier = getEndingTier(scoreCrowd, scoreKicks);
    const lockRemaining = Math.max(0, Math.ceil(scoreLockedUntil - now));
    return {
      mode: "result",
      kicker: "",
      title: `${formatScoreLabel(scoreCrowd)} Unleashed`,
      body:
        lockRemaining > 0
          ? `${scoreKicks.toLocaleString()} KICKS. Next run unlocks in ${lockRemaining}s.`
          : `${scoreKicks.toLocaleString()} KICKS. Press KICK to return to title.`,
    };
  }

  return {
    mode: "title",
    kicker: "",
    title: "dance, unleashed",
    body: "Drive the floor with your beat. Make the crowd dance, and unleash them into the night.",
  };
}

function getPulseForTime({ state, now, runStartTime, guideStartTime }) {
  if (state === "playing") {
    const beatPhase = ((now - runStartTime) / CONFIG.beatDuration) % 1;
    return 1 - Math.min(Math.abs(beatPhase), 1);
  }

  if (state === "idle" || state === "ended") {
    const beatPhase = ((now - guideStartTime) / CONFIG.beatDuration) % 1;
    return 1 - Math.min(Math.abs(beatPhase), 1);
  }

  return 0.08;
}

function getBeatProgress({ state, now, runStartTime, guideStartTime }) {
  const reference =
    state === "playing"
      ? runStartTime
      : guideStartTime;

  return mod((now - reference) / CONFIG.beatDuration, 1);
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function getGuideMarkers({ state, now, runStartTime, guideStartTime, kickStreak }) {
  const markers = [];

  if (state === "playing") {
    const nextBeat = kickStreak;
    for (
      let beat = nextBeat - CONFIG.guideVisibleBeatsBehind;
      beat <= nextBeat + CONFIG.guideVisibleBeatsAhead;
      beat += 1
    ) {
      if (beat < 0) {
        continue;
      }

      const beatTime = runStartTime + beat * CONFIG.beatDuration;
      markers.push({
        offset: (beatTime - now) / CONFIG.beatDuration,
        major: beat % 4 === 0,
        focus: beat === nextBeat,
      });
    }
    return markers;
  }

  const previewPhase = mod((now - guideStartTime) / CONFIG.beatDuration, 1);
  const previewBeat = Math.floor((now - guideStartTime) / CONFIG.beatDuration);
  for (
    let step = -CONFIG.guideVisibleBeatsBehind;
    step <= CONFIG.guideVisibleBeatsAhead;
    step += 1
  ) {
    const beat = previewBeat + step;
    markers.push({
      offset: step - previewPhase,
      major: mod(beat, 4) === 0,
      focus: step === 0,
    });
  }
  return markers;
}

function getRankLabel(crowd, kicks) {
  const tier = getEndingTier(crowd, kicks);
  return ["STATIC", "PULSE", "RISE", "SURGE", "UNBOUND"][tier];
}

function getEndingTier(crowd, kicks) {
  if (crowd >= 1000000 || kicks >= 300) {
    return 4;
  }

  if (crowd >= 100000 || kicks >= 200) {
    return 3;
  }

  if (crowd >= 5000 || kicks >= 96) {
    return 2;
  }

  if (crowd >= 100 || kicks >= 32) {
    return 1;
  }

  return 0;
}

function getEndingTierLabel(tier) {
  return ["Signal Lost", "Crowd Rising", "Pressure Up", "Floor Ignited", "Full Unleash"][tier];
}

function isNewBestScore(crowd, kicks, bestCrowd, bestKicks) {
  return crowd > bestCrowd || (crowd === bestCrowd && kicks > bestKicks);
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

window.addEventListener("load", () => {
  new Game();
});
