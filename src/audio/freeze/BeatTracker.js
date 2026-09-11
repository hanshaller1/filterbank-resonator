import { strongEvents } from './TempoDetector.js';

// Phase estimation is independent of the detector's tempo selection.
export class BeatTracker {
  analyze(events, bpm, now) {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) return null;
    const selected = strongEvents(events.filter(e => e.time > now - 8));
    if (selected.length < 4 || now - selected.at(-1).time > 2) return null;
    const period = 60 / bpm, reference = selected.at(-1).time;
    let x = 0, y = 0, weight = 0;
    for (const event of selected) {
      const angle = 2 * Math.PI * (event.time - reference) / period;
      x += event.weight * Math.cos(angle); y += event.weight * Math.sin(angle); weight += event.weight;
    }
    return { referenceTime: reference + Math.atan2(y, x) * period / (2 * Math.PI), confidence: Math.hypot(x, y) / (weight || 1) };
  }
}
