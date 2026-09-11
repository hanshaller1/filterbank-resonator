const clamp = (value, min = -1, max = 1) => Math.min(max, Math.max(min, value));
const dbToGain = db => Math.pow(10, db / 20);

// Keeps the first quarter deliberately fine while preserving a useful upper range.
export const driveIntensity = amount => clamp(Number(amount) || 0, 0, 1) ** 1.85;

const normalizedAtan = (x, k) => Math.atan(x * k) / Math.atan(k);
const normalizedTanh = (x, k) => Math.tanh(x * k) / Math.tanh(k);

export const CHARACTER_PROFILES = {
  clean: {
    label: 'Clean Boost', driveMaxDb: 8, compensationMaxDb: 7.1, biasScale: .08,
    transfer: (x, shape) => normalizedTanh(x, .18 + shape * .75)
  },
  saturation: {
    label: 'Saturation', driveMaxDb: 14, compensationMaxDb: 8.3, biasScale: .12,
    transfer: (x, shape) => normalizedAtan(x, .55 + shape * 1.8)
  },
  enhancement: {
    label: 'Enhancement', driveMaxDb: 12, compensationMaxDb: 8.1, biasScale: .15, baseBias: .025,
    preTone: { type: 'highshelf', frequency: 3200, gainDb: amount => amount * 1.6 },
    transfer: (x, shape) => normalizedTanh(x, .35 + shape * 1.25) + (.025 + shape * .035) * (x * x / (1 + x * x))
  },
  midDrive: {
    label: 'Mid Drive', driveMaxDb: 20, compensationMaxDb: 8.8, biasScale: .18, baseBias: .035,
    preTone: { type: 'peaking', frequency: 900, Q: .9, gainDb: amount => amount * 4.5 },
    postTone: { type: 'highshelf', frequency: 4200, gainDb: amount => -amount * 1.2 },
    transfer: (x, shape) => normalizedTanh(x, .7 + shape * 2.8) + .035 * shape * Math.sin(x * 2.4)
  },
  crunch: {
    label: 'Rough Crunch', driveMaxDb: 24, compensationMaxDb: 8.9, biasScale: .2, baseBias: -.025,
    transfer: (x, shape) => normalizedAtan(x, 1.1 + shape * 3.8) + shape * .055 * Math.tanh(x * 7)
  },
  classicDistortion: {
    label: 'Classic Distortion', driveMaxDb: 28, compensationMaxDb: 9, biasScale: .22,
    transfer: (x, shape) => normalizedTanh(x, 1.25 + shape * 5.5)
  },
  roundFuzz: {
    label: 'Round Fuzz', driveMaxDb: 30, compensationMaxDb: 8.9, biasScale: .28, baseBias: .06,
    preTone: { type: 'lowshelf', frequency: 220, gainDb: amount => amount * 2.2 },
    postTone: { type: 'highshelf', frequency: 3200, gainDb: amount => -amount * 2.2 },
    transfer: (x, shape) => Math.sign(x) * (1 - Math.exp(-Math.abs(x) * (1.5 + shape * 5.5))) / (1 - Math.exp(-(1.5 + shape * 5.5)))
  },
  highGain: {
    label: 'High Gain', driveMaxDb: 34, compensationMaxDb: 8.9, biasScale: .24, baseBias: -.035,
    transfer: (x, shape) => clamp(normalizedTanh(x + x * x * x * shape * .25, 1.7 + shape * 7) * (1 + shape * .06))
  }
};

const CURVE_SIZE = 2048;

function shapedSample(profile, x, bias, shape) {
  const offset = clamp((Number(bias) || 0) + (profile.baseBias || 0)) * profile.biasScale;
  // Removing the zero-input result avoids a static curve offset. A following
  // 18 Hz high-pass catches signal-dependent residual DC from asymmetry.
  return clamp(profile.transfer(x + offset, shape) - profile.transfer(offset, shape));
}

function makeCurve(profile, bias, shape) {
  const curve = new Float32Array(CURVE_SIZE);
  for (let i = 0; i < CURVE_SIZE; i += 1) {
    const x = (i / (CURVE_SIZE - 1)) * 2 - 1;
    curve[i] = shapedSample(profile, x, bias, shape);
  }
  return curve;
}

const compensationDb = (profile, intensity) => -profile.compensationMaxDb * intensity - 3.5 * Math.sin(Math.PI * intensity);

function createToneFilter(audioContext, definition) {
  if (!definition) return null;
  const filter = audioContext.createBiquadFilter();
  filter.type = definition.type;
  filter.frequency.value = definition.frequency;
  if (definition.Q !== undefined) filter.Q.value = definition.Q;
  return filter;
}

function updateToneFilter(filter, definition, amount, now, timeConstant) {
  if (!filter || !definition) return;
  filter.gain.setTargetAtTime(definition.gainDb?.(amount) || 0, now, timeConstant);
}

export class DriveProcessor {
  constructor(audioContext) {
    this.context = audioContext;
    this.input = audioContext.createGain(); this.output = audioContext.createGain();
    this.bypassGain = audioContext.createGain(); this.processedMix = audioContext.createGain();
    this.paths = new Map();
    this.settings = { amount: .32, character: 'saturation', tone: 0, bias: 0, shape: .35, bypass: false };

    Object.entries(CHARACTER_PROFILES).forEach(([key, profile]) => {
      const preGain = audioContext.createGain();
      const preTone = createToneFilter(audioContext, profile.preTone);
      const waveshaper = audioContext.createWaveShaper();
      const dcBlock = audioContext.createBiquadFilter();
      const postTone = createToneFilter(audioContext, profile.postTone);
      const cleanGain = audioContext.createGain(); const shapedGain = audioContext.createGain();
      const userTone = audioContext.createBiquadFilter(); const pathGain = audioContext.createGain();
      waveshaper.oversample = '4x';
      dcBlock.type = 'highpass'; dcBlock.frequency.value = 18; dcBlock.Q.value = .7;
      userTone.type = 'highshelf'; userTone.frequency.value = 2800; userTone.Q.value = .7;

      this.input.connect(cleanGain); cleanGain.connect(pathGain);
      this.input.connect(preGain);
      if (preTone) { preGain.connect(preTone); preTone.connect(waveshaper); } else preGain.connect(waveshaper);
      waveshaper.connect(dcBlock);
      if (postTone) { dcBlock.connect(postTone); postTone.connect(shapedGain); } else dcBlock.connect(shapedGain);
      shapedGain.connect(userTone); userTone.connect(pathGain); pathGain.connect(this.processedMix);
      this.paths.set(key, { profile, preGain, preTone, waveshaper, dcBlock, postTone, cleanGain, shapedGain, userTone, pathGain, curveKey: '' });
    });

    this.input.connect(this.bypassGain); this.bypassGain.connect(this.output); this.processedMix.connect(this.output);
    this.update();
  }

  connect(destination) { this.output.connect(destination); }
  disconnect() { try { this.output.disconnect(); } catch {} }

  updateTransfer(settings = {}) {
    if (settings.bias !== undefined) this.settings.bias = clamp(settings.bias, -1, 1);
    if (settings.shape !== undefined) this.settings.shape = clamp(settings.shape, 0, 1);
    const activeCharacter = this.settings.character in CHARACTER_PROFILES ? this.settings.character : 'saturation';
    const path = this.paths.get(activeCharacter), bias = this.settings.bias, shape = this.settings.shape;
    const curveKey = `${Math.round(bias * 128)}:${Math.round(shape * 128)}`;
    if (path.curveKey !== curveKey) { path.waveshaper.curve = makeCurve(path.profile, bias, shape); path.curveKey = curveKey; }
  }

  update(settings = {}) {
    Object.assign(this.settings, settings);
    const now = this.context.currentTime, timeConstant = .025;
    const amount = clamp(this.settings.amount, 0, 1), intensity = driveIntensity(amount);
    const tone = clamp(this.settings.tone, -1, 1), bias = clamp(this.settings.bias, -1, 1), shape = clamp(this.settings.shape, 0, 1);
    const activeCharacter = this.settings.character in CHARACTER_PROFILES ? this.settings.character : 'saturation';
    const cleanMix = Math.cos(intensity * Math.PI * .5), shapedMix = Math.sin(intensity * Math.PI * .5);

    this.paths.forEach((path, key) => {
      const { profile, preGain, preTone, waveshaper, postTone, cleanGain, shapedGain, userTone, pathGain } = path;
      if (key === activeCharacter) this.updateTransfer({ bias, shape });
      preGain.gain.setTargetAtTime(dbToGain(profile.driveMaxDb * intensity), now, timeConstant);
      cleanGain.gain.setTargetAtTime(cleanMix, now, timeConstant);
      shapedGain.gain.setTargetAtTime(shapedMix, now, timeConstant);
      updateToneFilter(preTone, profile.preTone, intensity, now, timeConstant);
      updateToneFilter(postTone, profile.postTone, intensity, now, timeConstant);
      userTone.gain.setTargetAtTime(tone * 6, now, timeConstant);
      const compensation = compensationDb(profile, intensity);
      pathGain.gain.setTargetAtTime(key === activeCharacter && !this.settings.bypass ? dbToGain(compensation) : 0, now, key === activeCharacter ? timeConstant : .06);
    });
    this.bypassGain.gain.setTargetAtTime(this.settings.bypass ? 1 : 0, now, timeConstant);
  }

  getTransferCurve(points = 256) {
    const amount = clamp(this.settings.amount, 0, 1), intensity = driveIntensity(amount);
    const bias = clamp(this.settings.bias, -1, 1), shape = clamp(this.settings.shape, 0, 1);
    const activeCharacter = this.settings.character in CHARACTER_PROFILES ? this.settings.character : 'saturation';
    const profile = CHARACTER_PROFILES[activeCharacter];
    const inputGain = dbToGain(profile.driveMaxDb * intensity);
    const outputGain = dbToGain(compensationDb(profile, intensity));
    const cleanMix = Math.cos(intensity * Math.PI * .5), shapedMix = Math.sin(intensity * Math.PI * .5);
    const key = `${activeCharacter}:${amount}:${this.settings.tone}:${bias}:${shape}:${points}`;
    if (this.transferCache?.key === key) return this.transferCache.value;
    const curve = new Float32Array(points * 2);
    for (let index = 0; index < points; index += 1) {
      const x = (index / (points - 1)) * 2 - 1;
      const y = (x * cleanMix + shapedSample(profile, x * inputGain, bias, shape) * shapedMix) * outputGain;
      curve[index * 2] = x; curve[index * 2 + 1] = clamp(y);
    }
    const value = { character: activeCharacter, amount, tone: this.settings.tone, bias, shape, curve };
    this.transferCache = { key, value }; return value;
  }
}
