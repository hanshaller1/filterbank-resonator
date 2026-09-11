// Slow RMS matching with a silence gate; manual Wet Gain is not in the detector path.
export class AutoGainKernel {
  constructor(sampleRate) {
    this.dryPower = 0; this.wetPower = 0; this.correctionDb = 0; this.gain = 1;
    this.powerAlpha = 1 - Math.exp(-1 / (.4 * sampleRate));
    this.correctionAlpha = 1 - Math.exp(-1 / (1.1 * sampleRate));
    this.gainAlpha = 1 - Math.exp(-1 / (.18 * sampleRate));
  }
  process(inputs, output, enabled) {
    const signal = inputs[0] || [], dry = inputs[1] || [], wet = inputs[2] || [];
    const energy = (channels, i) => { const l = channels[0]?.[i] || 0, r = channels[1]?.[i] ?? l; return (l*l+r*r)*.5; };
    for (let i = 0; i < output[0].length; i++) {
      this.dryPower += (energy(dry,i) - this.dryPower) * this.powerAlpha;
      this.wetPower += (energy(wet,i) - this.wetPower) * this.powerAlpha;
      const target = enabled && this.dryPower > 1e-6 && this.wetPower > 1e-6 ? Math.max(-12,Math.min(12,10*Math.log10(this.dryPower/this.wetPower))) : 0;
      this.correctionDb += (target - this.correctionDb) * this.correctionAlpha;
      this.gain += ((enabled ? 10 ** (this.correctionDb / 20) : 1) - this.gain) * this.gainAlpha;
      for (let c=0;c<output.length;c++) output[c][i] = (signal[c]?.[i] ?? signal[0]?.[i] ?? 0) * this.gain;
    }
  }
}
