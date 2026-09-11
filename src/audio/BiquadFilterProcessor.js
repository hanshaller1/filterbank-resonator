const MAX_FREQUENCY = 20000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class BiquadFilterProcessor {
  constructor(audioContext, type) {
    this.audioContext = audioContext;
    this.node = audioContext.createBiquadFilter();
    this.node.type = type;
    this.input = this.node;
    this.output = this.node;
  }

  update({ frequency, resonance, peakGain }) {
    const now = this.audioContext.currentTime;
    const safeFrequency = clamp(frequency, 20, Math.min(MAX_FREQUENCY, this.audioContext.sampleRate * 0.49));
    const q = clamp(resonance, 0.1, 12);
    this.node.frequency.setTargetAtTime(safeFrequency, now, 0.015);
    this.node.Q.setTargetAtTime(q, now, 0.015);
    if (this.node.type === 'peaking') this.node.gain.setTargetAtTime(clamp(peakGain, -12, 12), now, 0.015);
  }

  disconnect() {
    try { this.node.disconnect(); } catch {}
  }
}
