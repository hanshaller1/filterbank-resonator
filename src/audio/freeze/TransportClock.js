export const LOOP_BEATS = Object.freeze({ quarter: .25, half: .5, beat: 1, '2beats': 2, '1bar': 4, '2bars': 8, '4bars': 16, '8bars': 32 });
// Note values in 4/4: a quarter note is one beat.
export const GRID_BEATS = Object.freeze({ '1/32': .125, '1/16': .25, '1/8': .5, '1/4': 1, '1/2': 2, beat: 1, '2beats': 2, '1bar': 4, '2bars': 8, '4bars': 16 });
const mod = (n, d) => ((n % d) + d) % d;

export class TransportClock {
  constructor(sampleRate) {
    this.sampleRate = sampleRate; this.bpm = 120; this.valid = false;
    this.originFrame = 0; this.originBeat = 0; this.barOrigin = 0;
    this.slew = 0; this.slewFrames = 0; this.phaseReferenced = false; this.manualReference = false;
  }
  get framesPerBeat() { return this.sampleRate * 60 / this.bpm; }
  positionAt(frame) {
    const elapsed = frame - this.originFrame;
    return this.originBeat + elapsed / this.framesPerBeat + (this.slewFrames ? this.slew * Math.max(0, Math.min(1, elapsed / this.slewFrames)) : 0);
  }
  setBpm(bpm, frame) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return false;
    const position = this.valid ? this.positionAt(frame) : 0;
    this.originFrame = frame; this.originBeat = position; this.bpm = bpm;
    this.slew = 0; this.slewFrames = 0; this.valid = true;
    return true;
  }
  frameAtBeat(beat) {
    const difference = beat - this.originBeat;
    const rate = 1 / this.framesPerBeat;
    const slewEndBeat = this.slewFrames * rate + this.slew;
    if (this.slewFrames && difference >= 0 && difference <= slewEndBeat) return this.originFrame + difference / (rate + this.slew / this.slewFrames);
    return this.originFrame + (difference - (difference > 0 ? this.slew : 0)) / rate;
  }
  nextGridFrame(grid, frame, strictlyAfter = true) {
    const beats = typeof grid === 'number' ? grid : GRID_BEATS[grid] || 1;
    const origin = beats >= 4 ? this.barOrigin : 0;
    const position = this.positionAt(frame);
    const index = Math.ceil((position - origin) / beats + (strictlyAfter ? 1e-10 : -1e-10));
    return this.frameAtBeat(origin + index * beats);
  }
  alignBeat(referenceFrame, now, confidence = 1) {
    if (!this.valid || this.manualReference || !Number.isFinite(referenceFrame) || confidence < .65) return;
    if (!this.phaseReferenced) {
      const nearestBeat = Math.round(this.positionAt(referenceFrame));
      this.originBeat = nearestBeat; this.originFrame = referenceFrame; this.slew = 0; this.slewFrames = 0;
      this.phaseReferenced = true;
      return;
    }
    const referencePosition = this.positionAt(referenceFrame);
    const error = Math.round(referencePosition) - referencePosition;
    // Reject offbeats; slowly correct up to 1% of a beat across two beats.
    if (Math.abs(error) > .18) return;
    const position = this.positionAt(now);
    this.originFrame = now; this.originBeat = position;
    this.slew = Math.max(-.01, Math.min(.01, error * .3)); this.slewFrames = 2 * this.framesPerBeat;
  }
  setBeat1(frame) {
    if (!this.valid) return false;
    this.barOrigin = Math.ceil(this.positionAt(frame) - 1e-8);
    this.manualReference = true;
    return true;
  }
  info(frame) {
    const position = this.positionAt(frame), relative = position - this.barOrigin;
    return { bpm: this.bpm, valid: this.valid, beat: Math.floor(mod(relative, 4)) + 1,
      bar: Math.max(1, Math.floor(relative / 4) + 1), beatPhase: mod(position, 1),
      nextBeatMs: (this.nextGridFrame('beat', frame) - frame) * 1000 / this.sampleRate,
      nextBarMs: (this.nextGridFrame('1bar', frame) - frame) * 1000 / this.sampleRate,
      barReference: this.manualReference ? 'Manual' : 'Estimated' };
  }
}
