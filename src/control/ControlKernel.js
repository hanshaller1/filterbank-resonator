import { PARAMETERS, toNormalized, clamp } from '../state/parameters.js';
import { normalizeModulation } from './modulation.js';

// Pure control DSP: this class runs in AudioWorklet, never from an animation timer.
// New source evaluators can be added here without coupling sources to audio modules.
const WAVEFORMS = {
  sine: (p, k) => Math.sin(p * Math.PI * 2), triangle: p => 1 - 4 * Math.abs(p - .5),
  saw: p => p * 2 - 1, square: p => p < .5 ? 1 : -1, random: (p, k) => k.randomValue[k.activeLfo]
};
export const SOURCE_EVALUATORS = {
  lfo(kernel, id) {
    const s = kernel.modulation.sources[id];
    const p = (kernel.lfoPhase[id] + s.phase / 360) % 1;
    kernel.activeLfo = id;
    const wave = WAVEFORMS[s.waveform](p, kernel);
    return s.enabled ? wave * s.depth : 0;
  },
  envelope(kernel, id) {
    const s = kernel.modulation.sources[id];
    const amplitude = Math.sqrt(kernel.envelopePower[id]) * kernel.envelopeSensitivity[id];
    const threshold = kernel.envelopeThreshold[id];
    return s.enabled ? clamp((amplitude - threshold) / (1 - threshold), 0, 1) : 0;
  }
};
export class ControlKernel {
  constructor(sampleRate) {
    this.sampleRate = sampleRate; this.seed = { lfo1: 123456789, lfo2: 362436069 }; this.randomValue = { lfo1: 0, lfo2: 0 };
    this.inputPower = 0; this.inputCoefficient = Math.exp(-1 / (.005 * sampleRate));
    this.tempo = 120; this.values = {}; this.sources = { lfo1: 0, lfo2: 0, envelope1: 0, envelope2: 0 };
    this.lfoPhase = { lfo1: 0, lfo2: 0 }; this.envelopePower = { envelope1: 0, envelope2: 0 }; this.phase = 0; this.power = 0; this.configure({}, normalizeModulation());
  }
  configure(parameters, modulation) {
    this.parameters = parameters; this.modulation = normalizeModulation(modulation);
    this.envelopeAttack = {}; this.envelopeRelease = {}; this.envelopeSensitivity = {}; this.envelopeThreshold = {};
    for (const id of ['envelope1', 'envelope2']) {
      const e = this.modulation.sources[id];
      this.envelopeAttack[id] = Math.exp(-1 / (e.attack * .001 * this.sampleRate));
      this.envelopeRelease[id] = Math.exp(-1 / (e.release * .001 * this.sampleRate));
      this.envelopeSensitivity[id] = 10 ** (e.sensitivity / 20); this.envelopeThreshold[id] = Math.min(.999, 10 ** (e.threshold / 20));
    }
    this.base = Object.fromEntries(Object.entries(parameters).filter(([id]) => PARAMETERS[id]?.modulatable).map(([id, value]) => [id, toNormalized(PARAMETERS[id], value)]));
  }
  sample(left, right = left) {
    const energy = (left * left + right * right) * .5;
    this.inputPower = this.inputCoefficient * this.inputPower + (1 - this.inputCoefficient) * energy;
    for (const id of ['envelope1', 'envelope2']) {
      const coefficient = energy > this.envelopePower[id] ? this.envelopeAttack[id] : this.envelopeRelease[id];
      this.envelopePower[id] = coefficient * this.envelopePower[id] + (1 - coefficient) * energy;
    }
    for (const id of ['lfo1', 'lfo2']) {
      const l = this.modulation.sources[id]; const rate = l.sync === 'tempo' ? this.tempo / 60 / l.beats : l.rate;
      this.lfoPhase[id] += rate / this.sampleRate;
      if (this.lfoPhase[id] >= 1) { this.lfoPhase[id] %= 1; this.seed[id] ^= this.seed[id] << 13; this.seed[id] ^= this.seed[id] >>> 17; this.seed[id] ^= this.seed[id] << 5; this.randomValue[id] = (this.seed[id] >>> 0) / 2147483648 - 1; }
    }
    this.phase = this.lfoPhase.lfo1; this.power = this.envelopePower.envelope1;
  }
  evaluate() {
    if (this.power !== this.envelopePower.envelope1) this.envelopePower.envelope1 = this.power;
    this.sources.lfo1 = SOURCE_EVALUATORS.lfo(this, 'lfo1'); this.sources.lfo2 = SOURCE_EVALUATORS.lfo(this, 'lfo2');
    this.sources.envelope1 = SOURCE_EVALUATORS.envelope(this, 'envelope1'); this.sources.envelope2 = SOURCE_EVALUATORS.envelope(this, 'envelope2');
    for (const id in this.base) this.values[id] = this.base[id];
    for (const a of this.modulation.assignments) this.values[a.target] += this.sources[a.source] * a.amount * a.polarity;
    for (const id in this.values) this.values[id] = clamp(this.values[id], 0, 1);
    return this.values;
  }
  visualState() { return { sources: { ...this.sources }, values: { ...this.values }, lfoPhase: { ...this.lfoPhase }, randomValue: { ...this.randomValue }, input: Math.sqrt(Math.max(0, this.inputPower)), envelope: { envelope1: Math.sqrt(Math.max(0, this.envelopePower.envelope1)), envelope2: Math.sqrt(Math.max(0, this.envelopePower.envelope2)) } }; }
}
export function lookup(table, position) {
  const n = clamp(position, 0, 1) * (table.length - 1), i = Math.floor(n);
  return table[i] + (table[Math.min(i + 1, table.length - 1)] - table[i]) * (n - i);
}
// Absolute target -> a delta around a held intrinsic AudioParam value.
// This avoids a zero-value gap while a newly connected worklet receives its configuration.
export function bindingValue(binding, normalized, parameters) {
  if (binding.kind === 'dryMix') return parameters.bypass ? 1 : 1 - normalized.dryWet;
  if (binding.kind === 'wetMix') return parameters.bypass ? 0 : normalized.dryWet * 10 ** ((-24 + normalized.wetGain * 36) / 20);
  if (binding.character && (!parameters.driveEnabled || parameters.driveCharacter !== binding.character)) return 0;
  return lookup(binding.table, normalized[binding.target]);
}
