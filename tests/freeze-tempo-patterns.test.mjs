import test from 'node:test';
import assert from 'node:assert/strict';
import { TempoDetector } from '../src/audio/freeze/TempoDetector.js';
import { OnsetEnvelope } from '../src/audio/freeze/OnsetEnvelope.js';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

test('Recorded 142 BPM Syntakt kick never locks to 213 BPM', () => {
  // Actual 5 ms stereo-energy front-end output from the user recording, not
  // idealized beat events. Kept compressed to avoid embedding the full audio.
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/freeze-kick-142-envelope.json', import.meta.url)));
  const batches = JSON.parse(inflateSync(Buffer.from(fixture.data, 'base64')));
  for (const gain of [1, .1, .03]) {
    const detector = new TempoDetector();
    let lastAnalysis = 0, firstStable = null;
    for (const original of batches) {
      const batch = original.map((value, i) => i % 3 ? value * gain : value);
      detector.ingest(batch);
      const now = batch.at(-3);
      if (now - lastAnalysis < 1) continue;
      lastAnalysis = now;
      const info = detector.analyze(now);
      if (info.stableBpm !== null) {
        firstStable ??= now;
        assert.ok(Math.abs(info.stableBpm - 142) < .2, JSON.stringify({ gain, now, info }));
      }
    }
    assert.ok(firstStable !== null && firstStable < 12, `gain ${gain}: first stable ${firstStable}`);
    assert.equal(detector.status, 'Stable', JSON.stringify(detector.diagnostics));
  }
});

test('Kick attacks outrank their two weaker tail peaks instead of locking at 3:2 tempo', () => {
  for (const bpm of [128, 142, 148]) {
    const detector = new TempoDetector();
    for (let second = 1; second <= 30; second++) {
      detector.events = [];
      for (let step = 0; step * 60 / bpm / 3 < second; step++) {
        const time = step * 60 / bpm / 3 + Math.sin(step * 1.7) * .001;
        if (time > second - 24) detector.events.push({ time, weight: [1, .7, .5][step % 3] });
      }
      detector.lastOnset = detector.events.at(-1).time;
      detector.analyze(second);
    }
    assert.equal(detector.status, 'Stable', JSON.stringify(detector.diagnostics));
    assert.ok(Math.abs(detector.stableBpm - bpm) < .2, JSON.stringify(detector.info()));
  }
});

test('Accented sixteenth notes agree across windows instead of selecting 40–47 BPM', () => {
  for (const bpm of [128, 140, 148]) {
    const detector = new TempoDetector();
    let result;
    for (let second = 1; second <= 40; second++) {
      // A repeating kick/bass/hat pattern, including small timing variation.
      detector.events = [];
      for (let step = 0; step * 60 / bpm / 4 < second; step++) {
        const time = step * 60 / bpm / 4 + Math.sin(step * 1.7) * .001;
        if (time > second - 24) detector.events.push({ time, weight: [1, .45, .8, .45][step % 4] });
      }
      detector.lastOnset = detector.events.at(-1).time;
      result = detector.analyze(second);
    }
    assert.equal(result.status, 'Stable', `${bpm}: ${JSON.stringify(detector.diagnostics)}`);
    assert.ok(Math.abs(result.stableBpm - bpm) < .2, JSON.stringify(result));
    assert.ok(result.confidence >= .72);
  }
});

test('Irregular onsets do not acquire a stable tempo from subdivision support alone', () => {
  for (const seed of [7, 29, 101]) {
    const detector = new TempoDetector();
    let random = seed, time = 0;
    const next = () => { random = (random * 1664525 + 1013904223) >>> 0; return random / 4294967296; };
    for (let second = 1; second <= 40; second++) {
      while (time < second) { time += .065 + next() * .2; detector.events.push({ time, weight: .3 + next() }); }
      detector.events = detector.events.filter(event => event.time > second - 24);
      detector.lastOnset = time;
      detector.analyze(second);
    }
    assert.equal(detector.stableBpm, null, JSON.stringify(detector.info()));
  }
});

test('Auto detection follows a sustained audio tempo change without a mode toggle', () => {
  const sampleRate = 12000, detector = new TempoDetector();
  let phase = 0, lastAnalysis = -Infinity, switchedAt = null;
  const envelope = new OnsetEnvelope(sampleRate, batch => {
    detector.ingest(batch);
    const now = batch.at(-3);
    if (now - lastAnalysis < .9) return;
    lastAnalysis = now; detector.analyze(now);
    if (detector.stableBpm && Math.abs(detector.stableBpm - 110) < .2) switchedAt ??= now;
  });
  for (let frame = 0; frame < 35 * sampleRate; frame++) {
    const bpm = frame < 15 * sampleRate ? 142 : 110;
    phase += bpm / 60 / sampleRate;
    const age = (phase % 1) * 60 / bpm;
    const kick = Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 35) * .65;
    envelope.process(kick, -kick, frame);
  }
  assert.ok(switchedAt !== null && switchedAt < 23, `switched at ${switchedAt}`);
  assert.equal(detector.status, 'Stable');
});
