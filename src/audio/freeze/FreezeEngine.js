const mod = (n, d) => ((n % d) + d) % d;
const smooth = x => x * x * (3 - 2 * x);

// Fixed page pool: capturing retains references, never copies a 48-second loop
// on the render thread. Recording only copies a single page on overwrite.
export class StereoHistory {
  constructor(sampleRate, seconds = 60, pageSize = 2048) {
    this.pageSize = pageSize; this.pageCount = Math.ceil(sampleRate * seconds / pageSize);
    this.capacity = this.pageSize * this.pageCount; this.firstFrame = null; this.endFrame = 0;
    const create = () => ({ left: new Float32Array(pageSize), right: new Float32Array(pageSize), refs: 0, live: false });
    this.pages = Array.from({ length: this.pageCount }, () => ({ ...create(), live: true }));
    this.pool = Array.from({ length: this.pageCount + 8 }, create);
  }
  write(frame, left, right) {
    if (this.firstFrame === null) this.firstFrame = frame;
    const index = mod(frame, this.capacity), pageIndex = Math.floor(index / this.pageSize), offset = index % this.pageSize;
    let page = this.pages[pageIndex];
    if (page.refs) {
      const replacement = this.pool.pop();
      if (!replacement) return false;
      // When capture occurs mid-page, preserve samples preceding the write.
      replacement.left.set(page.left); replacement.right.set(page.right);
      replacement.live = true; page.live = false; this.pages[pageIndex] = replacement; page = replacement;
    }
    page.left[offset] = left; page.right[offset] = right; this.endFrame = frame + 1;
    return true;
  }
  capture(endFrame, duration, preroll = 0) {
    if (this.firstFrame === null || endFrame - this.firstFrame < duration + preroll + 2 || duration + preroll + 2 > this.capacity) return null;
    const pages = this.pages.slice();
    for (const page of pages) page.refs++;
    return { pages, start: endFrame - duration, end: endFrame, duration, released: false };
  }
  read(snapshot, channel, frame) {
    const index = mod(frame, this.capacity), integer = Math.floor(index), fraction = index - integer;
    const first = snapshot.pages[Math.floor(integer / this.pageSize)];
    // The sample at end is not captured yet. Clamp the final interpolation
    // neighbour to the last recorded sample instead of reading future silence.
    const next = mod(Math.min(Math.floor(frame) + 1, snapshot.end - 1), this.capacity), second = snapshot.pages[Math.floor(next / this.pageSize)];
    const key = channel === 0 ? 'left' : 'right';
    return first[key][integer % this.pageSize] * (1 - fraction) + second[key][next % this.pageSize] * fraction;
  }
  release(snapshot) {
    if (!snapshot || snapshot.released) return;
    snapshot.released = true;
    for (const page of snapshot.pages) { page.refs--; if (!page.refs && !page.live) this.pool.push(page); }
  }
}

export class FreezeEngine {
  constructor(sampleRate, seconds = 60) {
    this.sampleRate = sampleRate; this.history = new StereoHistory(sampleRate, seconds);
    this.active = null; this.previous = null; this.transitionFrame = 0;
    this.fadeFrames = Math.max(1, Math.round(sampleRate * .02));
    this.mix = 0; this.targetMix = 0; this.captures = 0;
  }
  get frozen() { return this.targetMix === 1; }
  canCapture(frame, duration) {
    return this.history.firstFrame !== null && frame - this.history.firstFrame >= duration + this.seamFrames(duration) + 2;
  }
  seamFrames(duration) { return Math.max(1, Math.min(this.sampleRate * .005, duration / 8)); }
  capture(frame, duration) {
    const snapshot = this.history.capture(frame, duration, this.seamFrames(duration));
    if (!snapshot) return false;
    this.history.release(this.previous); this.previous = this.active;
    this.active = { ...snapshot, playFrame: frame }; this.transitionFrame = frame;
    this.targetMix = 1; this.captures++; return true;
  }
  release() { this.targetMix = 0; }
  positionAt(frame, snapshot = this.active) { return snapshot ? mod(frame - snapshot.playFrame, snapshot.duration) : 0; }
  sample(snapshot, channel, frame) {
    const position = this.positionAt(frame, snapshot), seam = this.seamFrames(snapshot.duration);
    const raw = this.history.read(snapshot, channel, snapshot.start + position);
    if (position < snapshot.duration - seam) return raw;
    // Crossfade into the audio just BEFORE the loop's start. This preserves the
    // downbeat and the full fractional loop period without overlapping it away.
    const blend = smooth((position - snapshot.duration + seam) / seam);
    const beforeStart = this.history.read(snapshot, channel, snapshot.start + position - snapshot.duration);
    return raw * (1 - blend) + beforeStart * blend;
  }
  processSample(frame, left, right, outputLeft, outputRight, index) {
    this.history.write(frame, left, right);
    this.mix += Math.max(-1 / this.fadeFrames, Math.min(1 / this.fadeFrames, this.targetMix - this.mix));
    let outL = left, outR = right;
    if (this.active && this.mix > 0) {
      let wetL = this.sample(this.active, 0, frame), wetR = this.sample(this.active, 1, frame);
      if (this.previous) {
        const blend = smooth(Math.min(1, (frame - this.transitionFrame) / this.fadeFrames));
        wetL = this.sample(this.previous, 0, frame) * (1 - blend) + wetL * blend;
        wetR = this.sample(this.previous, 1, frame) * (1 - blend) + wetR * blend;
        if (blend >= 1) { this.history.release(this.previous); this.previous = null; }
      }
      const mix = smooth(this.mix);
      outL = left * (1 - mix) + wetL * mix; outR = right * (1 - mix) + wetR * mix;
    } else if (this.active && this.targetMix === 0) {
      this.history.release(this.active); this.history.release(this.previous); this.active = null; this.previous = null;
    }
    outputLeft[index] = outL; outputRight[index] = outR;
  }
  dispose() { this.history.release(this.active); this.history.release(this.previous); this.active = null; this.previous = null; }
}
