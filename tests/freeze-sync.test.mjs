import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportClock, GRID_BEATS, LOOP_BEATS } from '../src/audio/freeze/TransportClock.js';
import { FreezeEngine } from '../src/audio/freeze/FreezeEngine.js';
import { FreezeSyncController } from '../src/audio/freeze/FreezeSyncController.js';
import { OnsetEnvelope } from '../src/audio/freeze/OnsetEnvelope.js';
import { TempoDetector } from '../src/audio/freeze/TempoDetector.js';
import { BeatTracker } from '../src/audio/freeze/BeatTracker.js';
import { AppState } from '../src/state/AppState.js';
import { PARAMETERS } from '../src/state/parameters.js';
import { encodePreset, decodePreset } from '../src/state/schema.js';
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);

test('Transport handles every grid, phase-preserving tempo edits, gentle corrections and Set Beat 1', () => {
  const clock = new TransportClock(48000); clock.setBpm(120, 1000);
  for (const [grid, beats] of Object.entries(GRID_BEATS)) near(clock.nextGridFrame(grid, 1001), 1000 + beats * 24000);
  const now = 71321, before = clock.positionAt(now); clock.setBpm(128.25, now); near(clock.positionAt(now), before);
  clock.alignBeat(clock.frameAtBeat(4), now, 1);
  const correctionAt = 96000, original = clock.positionAt(correctionAt);
  clock.alignBeat(clock.frameAtBeat(4) + 100, correctionAt, .9);
  near(clock.positionAt(correctionAt), original);
  let previous = original;
  for (let frame = correctionAt + 1; frame < correctionAt + 50000; frame += 113) { const p = clock.positionAt(frame); assert.ok(p > previous); previous = p; }
  const downbeat = clock.nextGridFrame('beat', 160000);
  clock.setBeat1(160000); assert.equal(clock.info(Math.ceil(downbeat)).beat, 1);
  assert.equal(clock.info(Math.ceil(downbeat + clock.framesPerBeat)).beat, 2);
  assert.equal(clock.info(Math.ceil(downbeat + clock.framesPerBeat * 4)).beat, 1);
});

test('All required loop lengths stay within one sample of the clock after 10,000 cycles at 44.1/48 kHz', () => {
  for (const sampleRate of [44100, 48000]) for (const bpm of [80, 100, 120, 128, 140]) {
    const clock = new TransportClock(sampleRate); clock.setBpm(bpm, 12345);
    for (const [length, beats] of Object.entries(LOOP_BEATS)) {
      const period = sampleRate * 60 / bpm * beats;
      const start = Math.ceil(clock.nextGridFrame('1bar', 500000));
      for (const cycle of [1, 7, 1000, 10000]) {
        const ideal = start + cycle * period, rendered = Math.ceil(ideal - 1e-7);
        const phase = FreezeEngine.prototype.positionAt.call({ active: { playFrame: start, duration: period } }, rendered);
        assert.ok(Math.min(phase, period - phase) <= 1.000001, `${sampleRate} Hz ${bpm} BPM ${length}: ${phase}`);
        assert.ok(Math.abs(rendered - ideal) <= 1.000001);
      }
    }
  }
});

test('Captured stereo pages survive continuous ring overwrites and repeated captures without pool growth', () => {
  const engine = new FreezeEngine(1000, 2), left = new Float32Array(1), right = new Float32Array(1);
  for (let n = 0; n < 1000; n++) engine.processSample(n, .25, -.5, left, right, 0);
  assert.ok(engine.capture(1000, 123.25));
  for (let n = 1000; n < 15000; n++) {
    engine.processSample(n, .8, .6, left, right, 0);
    if (n > 1025) { near(left[0], .25); near(right[0], -.5); }
  }
  for (let n = 15000; n < 20000; n++) {
    if (n % 43 === 0) assert.ok(engine.capture(n, 125.5));
    engine.processSample(n, .2, -.3, left, right, 0);
    assert.ok(Number.isFinite(left[0]) && Number.isFinite(right[0]));
  }
  engine.release();
  for (let n = 20000; n < 20100; n++) engine.processSample(n, .7, -.2, left, right, 0);
  near(left[0], .7); near(right[0], -.2);
  assert.equal(engine.history.pool.length, engine.history.pageCount + 8);
  assert.ok(engine.history.pages.every(p => p.refs === 0));
});

test('Start/release are scheduled, pending commands cancel, and stable Auto tempo updates recapture a loop', () => {
  const engine = new FreezeEngine(1000, 10), sync = new FreezeSyncController(1000, engine);
  const left = new Float32Array(1), right = new Float32Array(1); let frame = 0;
  const advance = end => { for (; frame < end; frame++) { sync.tick(frame); engine.processSample(frame, .25, -.5, left, right, 0); } };
  sync.configure({ mode: 'sync', bpmMode: 'manual', manualBpm: 120, syncLength: 'beat', startQuantize: 'beat' }, frame);
  sync.onAnalysis({ tempo: { detectedBpm: 120, stableBpm: 120, confidence: .99, status: 'Stable' } }, frame);
  sync.configure({ bpmMode: 'auto' }, frame);
  advance(3123); sync.configure({ frozen: true }, frame);
  near(sync.pending.atFrame, 3500); advance(3500); assert.equal(engine.frozen, false);
  advance(3501); assert.equal(engine.frozen, true); assert.equal(engine.active.playFrame, 3500);
  const captures = engine.captures;
  sync.onAnalysis({ tempo: { detectedBpm: 121.8, stableBpm: 121.7, confidence: .9, status: 'Stable' }, beat: { referenceTime: 3.6, confidence: 1 } }, frame);
  assert.equal(engine.captures, captures); assert.equal(sync.clock.bpm, 121.7); assert.ok(sync.pending);
  sync.configure({ tempoLocked: true, lockedBpm: 120 }, frame);
  assert.ok(sync.pending); assert.equal(engine.captures, captures);
  sync.configure({ tempoLocked: false }, frame);
  assert.ok(sync.pending); assert.equal(sync.clock.bpm, 121.7);
  const releaseAt = Math.ceil(sync.clock.nextGridFrame('1bar', frame));
  sync.configure({ frozen: false, releaseQuantize: 'bar' }, frame);
  near(sync.pending.atFrame, sync.clock.nextGridFrame('1bar', frame)); advance(releaseAt); assert.equal(engine.frozen, true);
  advance(releaseAt + 1); assert.equal(engine.frozen, false);
  sync.configure({ frozen: true }, frame); assert.ok(sync.pending);
  sync.configure({ frozen: false }, frame); assert.equal(sync.pending, null);
  advance(4600); assert.equal(engine.frozen, false);
  sync.configure({ bpmMode: 'auto', tempoLocked: true, lockedBpm: 128 }, frame);
  assert.equal(sync.clock.bpm, 128);
  sync.onAnalysis({ tempo: { detectedBpm: 140, stableBpm: 140, confidence: .99, status: 'Stable' } }, frame);
  assert.equal(sync.clock.bpm, 128); assert.equal(sync.info(frame).status, 'Locked');
  sync.configure({ tempoLocked: false }, frame); assert.equal(sync.clock.bpm, 140);
  engine.dispose();
});

test('No tempo and insufficient history leave live audio intact; manual BPM unblocks arming', () => {
  const engine = new FreezeEngine(1000, 10), sync = new FreezeSyncController(1000, engine);
  sync.configure({ mode: 'sync', frozen: true, syncLength: '1bar' }, 0);
  assert.equal(sync.status, 'Waiting for tempo'); assert.equal(sync.clock.valid, false);
  const left = new Float32Array(1), right = new Float32Array(1);
  for (let n = 0; n < 200; n++) { sync.tick(n); engine.processSample(n, .6, -.25, left, right, 0); }
  near(left[0], .6); near(right[0], -.25);
  sync.configure({ bpmMode: 'manual', manualBpm: 100 }, 200);
  assert.equal(sync.clock.bpm, 100); assert.equal(sync.status, 'Waiting for Beat 1'); assert.equal(sync.pending, null);
  sync.setBeat1(200);
  assert.equal(sync.status, 'Buffering'); assert.ok(sync.pending.atFrame > 2400);
  sync.configure({ mode: 'free' }, 201); assert.equal(sync.pending, null); assert.equal(engine.frozen, false);
});

test('Bar-quantized Freeze waits for Set Beat 1 and Auto tempo changes schedule a new capture', () => {
  const engine = new FreezeEngine(1000, 20), sync = new FreezeSyncController(1000, engine);
  const left = new Float32Array(1), right = new Float32Array(1);
  for (let frame = 0; frame < 6000; frame++) engine.processSample(frame, .2, -.2, left, right, 0);
  sync.configure({ mode: 'sync', bpmMode: 'auto', frozen: true, syncLength: '1bar', startQuantize: '1bar' }, 6000);
  sync.onAnalysis({ tempo: { detectedBpm: 142, stableBpm: 142, confidence: .95, status: 'Stable' } }, 6000);
  assert.equal(sync.status, 'Waiting for Beat 1'); assert.equal(sync.pending, null); assert.equal(engine.frozen, false);
  sync.setBeat1(6000);
  assert.ok(sync.pending); assert.equal(sync.status, 'Armed');
  sync.tick(Math.ceil(sync.pending.atFrame)); assert.equal(engine.frozen, true);
  const captures = engine.captures;
  sync.onAnalysis({ tempo: { detectedBpm: 128, stableBpm: 128, confidence: .95, status: 'Stable' } }, 10000);
  assert.equal(sync.clock.bpm, 128); assert.ok(sync.pending); assert.equal(engine.captures, captures);
  sync.tick(Math.ceil(sync.pending.atFrame)); assert.equal(engine.captures, captures + 1);
  assert.ok(Math.abs(sync.loopBpm - 128) < .001);
  engine.dispose();
});

test('Auto tempo initializes directly and remains the effective source after Manual → Auto', () => {
  const engine = new FreezeEngine(1000, 10), sync = new FreezeSyncController(1000, engine);
  sync.configure({ mode: 'sync', bpmMode: 'auto' }, 0);
  sync.onAnalysis({ tempo: { detectedBpm: 127.8, stableBpm: 128, confidence: .9, status: 'Stable' } }, 0);
  assert.equal(sync.effectiveBpm, 128);
  assert.equal(sync.clock.bpm, 128);

  sync.configure({ frozen: true }, 10);
  sync.configure({ bpmMode: 'manual', manualBpm: 92 }, 20);
  assert.equal(sync.effectiveBpm, 92);
  assert.equal(sync.clock.bpm, 92);
  sync.configure({ bpmMode: 'auto' }, 30);
  assert.equal(sync.effectiveBpm, 128);
  assert.equal(sync.clock.bpm, 128);
  assert.equal(sync.settings.manualBpm, 92);
  engine.dispose();
});

test('Freeze select controls commit through change events', () => {
  for (const id of ['freezeMode', 'freezeSyncLength', 'freezeBpmMode', 'freezeStartQuantize', 'freezeReleaseQuantize']) {
    assert.equal(PARAMETERS[id].controlEvent, 'change', id);
  }
});

function analyzeAudio(bpm, sampleRate, irregular = false) {
  const detector = new TempoDetector(); const results = []; let lastAnalysis = -1;
  const envelope = new OnsetEnvelope(sampleRate, batch => {
    detector.ingest(batch); const now = batch.at(-3);
    if (now - lastAnalysis >= .9) { lastAnalysis = now; results.push(detector.analyze(now)); }
  });
  let seed = 7;
  for (let n = 0; n < 24 * sampleRate; n++) {
    const time = n / sampleRate, beat = time * bpm / 60, age = (beat % 1) * 60 / bpm;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed / 4294967296) * 2 - 1) * (irregular ? .009 : 0);
    const dropped = irregular && Math.floor(beat) % 11 === 7;
    const kick = dropped ? 0 : Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 35) * .65;
    const hatAge = (beat * 2 % 1) * 30 / bpm;
    const hat = Math.sin(2 * Math.PI * 3800 * time) * Math.exp(-hatAge * 140) * .08;
    envelope.process(kick + hat + noise, -kick + hat + noise, n);
  }
  return { detector, results };
}

test('Tempo converges to <0.2 BPM error across required tempos, fractional BPM and sample rates using stereo audio', () => {
  for (const sr of [44100, 48000]) for (const bpm of [80, 100, 120, 128, 140, 119.96]) {
    const { detector, results } = analyzeAudio(bpm, sr, true);
    assert.equal(detector.status, 'Stable', `${sr} / ${bpm}: ${JSON.stringify(detector.info())}`);
    near(detector.stableBpm, bpm, .2); assert.ok(detector.confidence > .72);
    assert.ok(results.slice(0, 3).every(r => r.status === 'Detecting'));
    const phase = new BeatTracker().analyze(detector.events, detector.stableBpm, 24);
    assert.ok(phase.confidence > .7);
    const saved = detector.stableBpm;
    detector.analyze(30); assert.equal(detector.status, 'Detecting'); near(detector.stableBpm, saved);
  }
});

test('Silence and steady noise never become a stable clock', () => {
  const detector = new TempoDetector(), envelope = new OnsetEnvelope(12000, batch => { detector.ingest(batch); detector.analyze(batch.at(-3)); });
  let seed = 42;
  for (let frame = 0; frame < 12000 * 18; frame++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = frame < 12000 * 6 ? 0 : (seed / 4294967296 - .5) * .04;
    envelope.process(value, -value, frame);
  }
  assert.equal(detector.stableBpm, null); assert.equal(detector.status, 'Detecting');
});

test('Freeze configuration survives presets and A/B; old presets get safe Sync defaults', () => {
  const store = new AppState({ freezeMode: 'sync', freezeBpmMode: 'manual', freezeManualBpm: 119.96, freezeStartQuantize: '1/16', freezeReleaseQuantize: 'bar' });
  store.storeSnapshot('a'); store.setParameters({ freezeManualBpm: 128, freezeStartQuantize: '1bar' }); store.storeSnapshot('b');
  store.setMorph(.49); near(store.state.parameters.freezeManualBpm, 119.96);
  store.setMorph(.5); near(store.state.parameters.freezeManualBpm, 128);
  assert.deepEqual(decodePreset(encodePreset(store.state)).parameters, store.state.parameters);
  const old = decodePreset({ schemaVersion: 1, settings: { freezeMode: 'sync' } });
  assert.equal(old.parameters.freezeTempoLocked, false); assert.equal(old.parameters.freezeStartQuantize, 'auto');
});

test('The real analysis Worker accepts audio batches and returns tempo/phase over the direct port', async () => {
  globalThis.self = {};
  await import('../src/audio/freeze/TempoWorker.js');
  const port = { messages: [], start() {}, postMessage(message) { this.messages.push(message); } };
  self.onmessage({ data: { type: 'connect', port } });
  const sampleRate = 12000;
  const envelope = new OnsetEnvelope(sampleRate, batch => port.onmessage({ data: { type: 'envelope', batch, referenceBpm: null, epoch: 5 } }));
  for (let n = 0; n < 15 * sampleRate; n++) {
    const age = (n / sampleRate) % .5, kick = Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 35) * .65;
    envelope.process(kick, -kick, n);
  }
  const result = port.messages.at(-1);
  assert.equal(result.type, 'analysis'); assert.equal(result.epoch, 5);
  assert.equal(result.tempo.status, 'Stable'); near(result.tempo.stableBpm, 120, .1);
  assert.ok(result.beat.confidence > .8);
  port.onmessage({ data: { type: 'reset' } });
  port.onmessage({ data: { type: 'envelope', batch: [20, 0, 0], referenceBpm: null, epoch: 6 } });
  assert.equal(port.messages.at(-1).tempo.stableBpm, null);
});

test('Actual Sync AudioWorklet detects Auto BPM from its running input and reaches lock without Manual BPM', async () => {
  let Processor;
  globalThis.sampleRate = 48000; globalThis.currentFrame = 0;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { messages: [], postMessage(message) { this.messages.push(message); } }; } };
  globalThis.registerProcessor = (_, constructor) => { Processor = constructor; };
  await import('../src/audio/worklets/FreezeSyncWorklet.js');
  const autoWorklet = new Processor(), detector = new TempoDetector();
  let lastAnalysis = -Infinity, batches = 0;
  const analysisPort = {
    start() {}, close() {},
    postMessage(message) {
      if (message.type === 'reset') { detector.reset(); lastAnalysis = -Infinity; return; }
      if (message.type !== 'envelope') return;
      batches++; detector.ingest(message.batch);
      const now = message.batch.at(-3);
      if (now - lastAnalysis < .9) return;
      lastAnalysis = now;
      const tempo = detector.analyze(now);
      this.onmessage({ data: { type: 'analysis', epoch: message.epoch, tempo, beat: new BeatTracker().analyze(detector.events, tempo.stableBpm, now) } });
    }
  };
  autoWorklet.port.onmessage({ data: { type: 'connect-analysis', port: analysisPort } });
  autoWorklet.port.onmessage({ data: { type: 'config', settings: { mode: 'sync', bpmMode: 'auto', frozen: true, syncLength: 'beat', startQuantize: 'beat' } } });
  const autoInput = [[new Float32Array(128), new Float32Array(128)], []];
  const autoOutput = [[new Float32Array(128), new Float32Array(128)]];
  for (let block = 0; block < 48000 * 15 / 128; block++) {
    for (let i = 0; i < 128; i++) {
      const time = (globalThis.currentFrame + i) / 48000, age = time % .5;
      const kick = Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 35) * .65;
      autoInput[0][0][i] = kick; autoInput[0][1][i] = -kick;
    }
    autoWorklet.process(autoInput, autoOutput); globalThis.currentFrame += 128;
  }
  assert.ok(batches > 0);
  assert.ok(Number.isFinite(autoWorklet.sync.detection.detectedBpm));
  near(autoWorklet.sync.detection.stableBpm, 120, .1);
  assert.equal(autoWorklet.sync.clock.valid, true);
  assert.notEqual(autoWorklet.sync.status, 'Waiting for tempo');
  autoWorklet.port.onmessage({ data: { type: 'config', settings: { ...autoWorklet.sync.settings, tempoLocked: true, lockedBpm: autoWorklet.sync.detection.stableBpm } } });
  assert.equal(autoWorklet.sync.info(globalThis.currentFrame).status, 'Locked');
  autoWorklet.port.onmessage({ data: { type: 'dispose' } });
});

test('Actual Sync AudioWorklet starts on its scheduled sample and preserves stereo independently of UI timers', async () => {
  let Processor;
  globalThis.sampleRate = 48000; globalThis.currentFrame = 0;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { messages: [], postMessage(message) { this.messages.push(message); } }; } };
  globalThis.registerProcessor = (_, constructor) => { Processor = constructor; };
  await import('../src/audio/worklets/FreezeSyncWorklet.js?capture-test');
  const worklet = new Processor();
  worklet.port.onmessage({ data: { type: 'config', settings: { mode: 'sync', bpmMode: 'manual', manualBpm: 140, frozen: false, syncLength: 'beat', startQuantize: 'beat' } } });
  const input = [[new Float32Array(128).fill(.25), new Float32Array(128).fill(-.5)], [new Float32Array(128), new Float32Array(128)]];
  const output = [[new Float32Array(128), new Float32Array(128)]];
  const run = blocks => { for (let i = 0; i < blocks; i++) { worklet.process(input, output); globalThis.currentFrame += 128; } };
  run(230);
  worklet.port.onmessage({ data: { type: 'config', settings: { ...worklet.sync.settings, frozen: true } } });
  const expected = worklet.sync.pending.atFrame;
  while (globalThis.currentFrame <= expected) run(1);
  assert.equal(worklet.engine.active.playFrame, Math.ceil(expected - 1e-7));
  input[0][0].fill(.8); input[0][1].fill(.9); run(1500);
  assert.ok(output[0][0].every(v => Math.abs(v - .25) < 1e-6));
  assert.ok(output[0][1].every(v => Math.abs(v + .5) < 1e-6));
  assert.ok(worklet.port.messages.some(m => m.triggerStatus === 'Frozen'));
  assert.equal(worklet.engine.captures, 1);
  worklet.port.onmessage({ data: { type: 'dispose' } }); assert.equal(worklet.process(input, output), false);
});
