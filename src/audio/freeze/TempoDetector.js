const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const wrap = value => value - Math.round(value);

export function strongEvents(events) {
  if (!events.length) return [];
  const sorted = events.map(e => e.weight).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * .85)] * .3;
  return events.filter(e => e.weight >= threshold);
}

function fit(events, bpm) {
  const period = 60 / bpm, reference = events.reduce((a, b) => a.weight > b.weight ? a : b).time;
  let x = 0, y = 0, weight = 0;
  for (const e of events) { const angle = 2 * Math.PI * (e.time - reference) / period; x += Math.cos(angle) * e.weight; y += Math.sin(angle) * e.weight; weight += e.weight; }
  const phase = Math.atan2(y, x) / (2 * Math.PI);
  const origin = reference + phase * period;
  const occupied = new Set(); let coverage = 0;
  for (const e of events) {
    const beat = (e.time - origin) / period, error = wrap(beat);
    coverage += Math.exp(-.5 * (error / .07) ** 2) * e.weight;
    if (Math.abs(error) < .12) occupied.add(Math.round(beat));
  }
  const expected = Math.max(1, Math.round((events.at(-1).time - events[0].time) / period) + 1);
  const occupancy = Math.min(1, occupied.size / expected);
  coverage /= weight || 1;
  return { origin, coverage, occupancy, coherence: Math.hypot(x, y) / (weight || 1),
    score: coverage * .75 + occupancy * .25 - .08 * Math.log2(bpm / 80) };
}

function refine(events, bpm, origin) {
  const period = 60 / bpm;
  let selected = events.map(e => ({ x: Math.round((e.time - origin) / period), y: e.time - origin, w: e.weight }))
    .filter(e => Math.abs(e.y / period - e.x) < .12);
  let slope = period, intercept = 0, residual = 1;
  for (let iteration = 0; iteration < 2 && selected.length >= 5; iteration++) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const e of selected) { sw += e.w; sx += e.w * e.x; sy += e.w * e.y; sxx += e.w * e.x * e.x; sxy += e.w * e.x * e.y; }
    const denominator = sw * sxx - sx * sx;
    if (Math.abs(denominator) < 1e-12) break;
    slope = (sw * sxy - sx * sy) / denominator; intercept = (sy - slope * sx) / sw;
    residual = Math.sqrt(selected.reduce((sum, e) => sum + e.w * (e.y - intercept - slope * e.x) ** 2, 0) / sw) / period;
    selected = selected.filter(e => Math.abs(e.y - intercept - slope * e.x) < Math.max(.008, 3 * residual * period));
  }
  const result = 60 / slope;
  return { bpm: Number.isFinite(result) && Math.abs(result - bpm) < 2 ? result : bpm, residual, count: selected.length };
}

export class TempoDetector {
  constructor() { this.reset(); }
  reset() {
    this.events = []; this.lastEnergy = 0; this.lastLow = 0; this.fluxMean = 0;
    this.previous = null; this.before = 0; this.lastOnset = -Infinity;
    this.history = []; this.detectedBpm = null; this.stableBpm = null; this.confidence = 0; this.status = 'Detecting';
  }
  ingest(batch) {
    for (let i = 0; i < batch.length; i += 3) {
      const time = batch[i], energy = batch[i + 1], low = batch[i + 2];
      const flux = .25 * Math.max(0, energy - this.lastEnergy) + .75 * Math.max(0, low - this.lastLow);
      this.fluxMean += (flux - this.fluxMean) * .012;
      const previous = this.previous;
      if (previous && previous.flux > this.before && previous.flux >= flux && previous.flux > Math.max(.00015, previous.threshold) && previous.energy > .0004 && previous.time - this.lastOnset >= .065) {
        const denominator = this.before - 2 * previous.flux + flux;
        const offset = denominator ? clamp(.5 * (this.before - flux) / denominator, -.5, .5) * (time - previous.time) : 0;
        this.events.push({ time: previous.time + offset, weight: previous.flux }); this.lastOnset = previous.time;
      }
      this.before = previous?.flux || 0;
      this.previous = { time, flux, energy, threshold: this.fluxMean * 1.8 };
      this.lastEnergy = energy; this.lastLow = low;
    }
    const now = batch.at(-3) || 0;
    this.events = this.events.filter(e => e.time > now - 24).slice(-384);
  }
  candidates(events) {
    const histogram = new Map();
    for (let i = 1; i < events.length; i++) for (let j = Math.max(0, i - 12); j < i; j++) {
      const difference = events[i].time - events[j].time;
      if (difference < .2 || difference > 4) continue;
      for (let beats = 1; beats <= 8; beats++) {
        const bpm = 60 * beats / difference;
        if (bpm < 40 || bpm > 240) continue;
        const key = Math.round(bpm * 5) / 5;
        histogram.set(key, (histogram.get(key) || 0) + Math.sqrt(events[i].weight * events[j].weight) / Math.sqrt(beats));
      }
    }
    const top = [...histogram].sort((a, b) => b[1] - a[1]).slice(0, 24).map(e => e[0]);
    if (this.stableBpm) top.push(this.stableBpm);
    return [...new Set(top.flatMap(bpm => [bpm / 2, bpm, bpm * 2]).filter(bpm => bpm >= 40 && bpm <= 240))];
  }
  estimate(events) {
    const strong = strongEvents(events);
    if (strong.length < 6 || strong.at(-1).time - strong[0].time < 3) return null;
    const ranked = this.candidates(strong).map(bpm => ({ bpm, ...fit(strong, bpm) })).sort((a, b) => b.score - a.score);
    if (!ranked.length) return null;
    const best = ranked[0], refined = refine(strong, best.bpm, best.origin);
    const confidence = clamp(best.coverage * .55 + best.occupancy * .25 + Math.max(0, 1 - refined.residual / .05) * .2, 0, 1);
    return { ...refined, confidence, candidates: ranked.slice(0, 3).map(c => c.bpm) };
  }
  analyze(now) {
    const recent = this.events.filter(e => e.time > now - 8), longer = this.events.filter(e => e.time > now - 16);
    const a = this.estimate(recent), b = this.estimate(longer);
    if (!a || !b || now - this.lastOnset > 2 || Math.abs(a.bpm - b.bpm) > .65) {
      this.confidence = 0; this.status = 'Detecting'; this.history = []; return this.info();
    }
    const bpm = a.bpm * .35 + b.bpm * .65;
    this.detectedBpm = bpm; this.confidence = Math.min(a.confidence, b.confidence);
    if (this.confidence < .72) { this.history = []; this.status = 'Detecting'; return this.info(); }
    if (this.history.length && Math.abs(bpm - median(this.history)) > .5) this.history = [];
    this.history.push(bpm); this.history = this.history.slice(-6);
    if (this.history.length >= 4) {
      const value = median(this.history);
      if (this.stableBpm === null || Math.abs(value - this.stableBpm) > .65) {
        if (this.stableBpm === null || this.history.length >= 6) this.stableBpm = value;
      } else this.stableBpm += (value - this.stableBpm) * .3;
      this.status = Math.abs(value - this.stableBpm) <= .65 ? 'Stable' : 'Detecting';
    } else this.status = 'Detecting';
    return this.info();
  }
  info() { return { detectedBpm: this.detectedBpm, stableBpm: this.stableBpm, confidence: this.confidence, status: this.status }; }
}
