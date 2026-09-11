const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const VOWELS = [
  { name: 'A', bands: [[800, 1.00], [1150, 0.72], [2900, 0.46], [3900, 0.30], [4950, 0.18]] },
  { name: 'E', bands: [[400, 1.00], [1700, 0.76], [2300, 0.50], [3200, 0.32], [4500, 0.18]] },
  { name: 'I', bands: [[350, 1.00], [2000, 0.78], [2800, 0.54], [3800, 0.34], [4950, 0.20]] },
  { name: 'O', bands: [[450, 1.00], [800, 0.72], [2830, 0.48], [3800, 0.31], [4950, 0.18]] },
  { name: 'U', bands: [[325, 1.00], [700, 0.74], [2530, 0.48], [3500, 0.30], [4950, 0.17]] }
];

export class FormantFilterProcessor {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.sum = audioContext.createGain();
    this.outputTrim = audioContext.createGain();
    this.bands = VOWELS[0].bands.map(() => {
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      filter.type = 'bandpass';
      this.input.connect(filter);
      filter.connect(gain);
      gain.connect(this.sum);
      return { filter, gain };
    });
    this.sum.connect(this.outputTrim);
    this.outputTrim.connect(this.output);
    this.outputTrim.gain.value = 0.9;
    this.update({ position: 0, resonance: 0.7 });
  }

  update({ position, resonance }) {
    const now = this.audioContext.currentTime;
    const safePosition = clamp(position, 0, 1);
    const location = safePosition * (VOWELS.length - 1);
    const leftIndex = Math.min(VOWELS.length - 2, Math.floor(location));
    const blend = location - leftIndex;
    const left = VOWELS[leftIndex];
    const right = VOWELS[leftIndex + 1];
    const q = 1.2 + clamp(resonance / 12, 0, 1) * 10;

    this.bands.forEach(({ filter, gain }, index) => {
      const frequency = left.bands[index][0] + (right.bands[index][0] - left.bands[index][0]) * blend;
      const amplitude = left.bands[index][1] + (right.bands[index][1] - left.bands[index][1]) * blend;
      filter.frequency.setTargetAtTime(frequency, now, 0.025);
      filter.Q.setTargetAtTime(q, now, 0.025);
      gain.gain.setTargetAtTime(amplitude * 0.27, now, 0.025);
    });
  }

  disconnect() {
    for (const node of [this.input, this.output, this.sum, this.outputTrim]) {
      try { node.disconnect(); } catch {}
    }
    for (const { filter, gain } of this.bands) {
      try { filter.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    }
  }
}

export { VOWELS };
