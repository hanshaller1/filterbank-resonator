// Small, bounded audio-thread front end; estimation runs in a separate Worker.
export class OnsetEnvelope {
  constructor(sampleRate, emit) {
    this.sampleRate = sampleRate; this.hop = Math.round(sampleRate * .005); this.emit = emit;
    this.alpha = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
    this.lowL = 0; this.lowR = 0; this.energy = 0; this.lowEnergy = 0; this.count = 0;
    this.batch = []; this.enabled = false;
  }
  reset() { this.energy = 0; this.lowEnergy = 0; this.count = 0; this.batch = []; this.lowL = 0; this.lowR = 0; }
  process(left, right, frame) {
    this.lowL += this.alpha * (left - this.lowL); this.lowR += this.alpha * (right - this.lowR);
    this.energy += (left * left + right * right) * .5;
    this.lowEnergy += (this.lowL * this.lowL + this.lowR * this.lowR) * .5;
    if (++this.count < this.hop) return;
    this.batch.push((frame - this.hop * .5) / this.sampleRate, Math.sqrt(this.energy / this.hop), Math.sqrt(this.lowEnergy / this.hop));
    this.count = 0; this.energy = 0; this.lowEnergy = 0;
    if (this.batch.length >= 120) { this.emit(this.batch); this.batch = []; }
  }
}
