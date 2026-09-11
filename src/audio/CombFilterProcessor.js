const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class CombFilterProcessor {
  constructor(audioContext, mode) {
    this.audioContext = audioContext;
    this.mode = mode;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.delay = audioContext.createDelay(0.06);
    this.sum = audioContext.createGain();
    this.outputTrim = audioContext.createGain();

    this.input.connect(this.sum);
    this.sum.connect(this.outputTrim);
    this.outputTrim.connect(this.output);

    if (mode === 'feedforwardComb') {
      this.delayedGain = audioContext.createGain();
      this.input.connect(this.delay);
      this.delay.connect(this.delayedGain);
      this.delayedGain.connect(this.sum);
    } else {
      this.feedbackGain = audioContext.createGain();
      this.sum.connect(this.delay);
      this.delay.connect(this.feedbackGain);
      this.feedbackGain.connect(this.sum);
    }

    this.update({ frequency: 1000, resonance: 0.7 });
  }

  update({ frequency, resonance }) {
    const now = this.audioContext.currentTime;
    const delayTime = clamp(1 / Math.max(20, frequency), 0.00015, 0.05);
    const normalized = clamp(resonance / 12, 0, 1);
    this.delay.delayTime.setTargetAtTime(delayTime, now, 0.02);

    if (this.mode === 'feedforwardComb') {
      this.sum.gain.setTargetAtTime(1, now, 0.02);
      this.outputTrim.gain.setTargetAtTime(0.78, now, 0.02);
      this.delayedGain.gain.setTargetAtTime(0.12 + normalized * 0.62, now, 0.02);
    } else {
      this.outputTrim.gain.setTargetAtTime(0.78, now, 0.02);
      this.feedbackGain.gain.setTargetAtTime(0.12 + normalized * 0.72, now, 0.02);
    }
  }

  disconnect() {
    for (const node of [this.input, this.output, this.delay, this.sum, this.outputTrim, this.delayedGain, this.feedbackGain]) {
      if (node) { try { node.disconnect(); } catch {} }
    }
  }
}
