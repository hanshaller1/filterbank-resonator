// Stereo-linked dynamics. No DOM, timers or per-sample allocations.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const softClip = (value, threshold, room, amount) => {
  const magnitude = Math.abs(value);
  const rounded = magnitude <= threshold ? magnitude : threshold + room * Math.tanh((magnitude - threshold) / room);
  return value + (Math.sign(value) * rounded - value) * amount;
};
export function clipperTransfer(value, settings = {}) {
  const threshold = 10 ** (Number(settings.threshold ?? -3) / 20), ceiling = 10 ** (Number(settings.ceiling ?? -1) / 20);
  if (settings.mode === 'limiter' || settings.mode === 1) return clamp(value * Math.min(1, threshold / Math.max(Math.abs(value), 1e-9)), -ceiling, ceiling);
  return clamp(softClip(value, threshold, Math.max(.001, 1 - threshold), clamp(Number(settings.amount ?? .25), 0, 1)), -ceiling, ceiling);
}
export class RealtimeKernel {
  constructor(sampleRate, kind) {
    this.sampleRate = sampleRate; this.kind = kind; this.gain = 1;
    this.fast = 0; this.slow = 0; this.mix = 0; this.counter = 0; this.hold = [0, 0];
    this.fastUp = Math.exp(-1 / (.001 * sampleRate));
    this.fastDown = Math.exp(-1 / (.015 * sampleRate));
    this.slowUp = Math.exp(-1 / (.025 * sampleRate));
    this.slowDown = Math.exp(-1 / (.15 * sampleRate));
    this.smooth = 1 - Math.exp(-1 / (.003 * sampleRate));
  }
  process(input, output, p) {
    this.reduction = 0;
    const left = input[0], right = input[1] || left;
    const outL = output[0], outR = output[1] || outL;
    const at = (id, i) => p[id]?.[p[id].length === 1 ? 0 : i] ?? 0;
    for (let i = 0; i < outL.length; i++) {
      const l = Number.isFinite(left?.[i]) ? left[i] : 0;
      const r = Number.isFinite(right?.[i]) ? right[i] : l;
      const level = Math.max(Math.abs(l), Math.abs(r));
      let wl = l, wr = r;
      this.mix += clamp(at('enabled', i) - this.mix, -1 / (this.sampleRate * .02), 1 / (this.sampleRate * .02));
      if (this.kind === 'gate') {
        const db = 20 * Math.log10(Math.max(level, 1e-9));
        const under = Math.min(0, db - at('threshold', i));
        const attenuation = at('mode', i) >= .5 ? Math.max(-at('range', i), under * .65) : under < 0 ? -at('range', i) : 0;
        const target = 10 ** (attenuation / 20);
        const ms = target > this.gain ? at('attack', i) : at('release', i);
        this.gain += (target - this.gain) * (1 - Math.exp(-1 / (Math.max(1, ms) * .001 * this.sampleRate)));
        wl *= this.gain; wr *= this.gain;
      } else if (this.kind === 'transient') {
        this.fast = level + (this.fast - level) * (level > this.fast ? this.fastUp : this.fastDown);
        this.slow = level + (this.slow - level) * (level > this.slow ? this.slowUp : this.slowDown);
        const onset = clamp((this.fast - this.slow) / Math.max(this.fast, .0001), 0, 1);
        const tail = this.slow > .0001 ? clamp(1 - onset, 0, 1) : 0;
        const db = 6 * (at('attack', i) * onset + at('sustain', i) * tail) / 100;
        this.gain += (10 ** (db / 20) - this.gain) * this.smooth;
        wl *= this.gain; wr *= this.gain;
      } else if (this.kind === 'clipper') {
        const threshold = 10 ** (at('threshold', i) / 20), ceiling = 10 ** (at('ceiling', i) / 20);
        const desired = Math.min(1, threshold / Math.max(level, 1e-9));
        this.gain = desired < this.gain ? desired : desired + (this.gain - desired) * Math.exp(-1 / (Math.max(20, at('release', i)) * .001 * this.sampleRate));
        const mode = clamp(at('mode', i), 0, 1), amount = clamp(at('amount', i), 0, 1);
        const room = Math.max(.001, 1 - threshold);
        wl = clamp(softClip(l, threshold, room, amount) * (1 - mode) + l * this.gain * mode, -ceiling, ceiling);
        wr = clamp(softClip(r, threshold, room, amount) * (1 - mode) + r * this.gain * mode, -ceiling, ceiling);
        const outLevel = Math.max(Math.abs(wl), Math.abs(wr));
        if (level > 1e-8) this.reduction = Math.max(this.reduction, 20 * Math.log10(level / Math.max(outLevel, 1e-9)) * this.mix);
      } else {
        const step = at('rateEnabled', i) >= .5 ? 1 + Math.round(at('reduction', i) * 31) : 1;
        if (this.counter <= 0 || this.counter >= step) { this.hold[0] = l; this.hold[1] = r; this.counter = step; }
        this.counter--;
        wl = this.hold[0]; wr = this.hold[1];
        if (at('bitEnabled', i) >= .5) {
          // Keep the quantizer continuous between mapped UI positions. The
          // UI still presents understandable bit values, while fractional
          // depths avoid an unnecessary whole-bit jump in the DSP.
          const levels = 2 ** (Math.max(2, at('bitDepth', i)) - 1);
          wl = Math.round(wl * levels) / levels; wr = Math.round(wr * levels) / levels;
        }
      }
      outL[i] = l + (wl - l) * this.mix;
      outR[i] = r + (wr - r) * this.mix;
    }
  }
}
