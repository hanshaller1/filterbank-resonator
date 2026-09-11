import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, deviceMock } from './audio-mock.mjs';
import { ControlKernel, bindingValue } from '../src/control/ControlKernel.js';
import { normalizeModulation } from '../src/control/modulation.js';
import { AppState } from '../src/state/AppState.js';
import { defaults, PARAMETERS, toNormalized } from '../src/state/parameters.js';
import { decodePreset, encodePreset } from '../src/state/schema.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';
globalThis.AudioContext = Context;
const near = (a, b, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);

test('LFO waveforms, free/tempo rates, depth and phase run against sample time', () => {
  for (const waveform of ['sine', 'triangle', 'saw', 'square', 'random']) {
    const k = new ControlKernel(1000), m = normalizeModulation();
    m.sources.lfo1 = { ...m.sources.lfo1, enabled: true, waveform, rate: 2, depth: .7 };
    k.configure(defaults(), m);
    const values = [];
    for (let i = 0; i < 2000; i++) { k.sample(0); values.push(k.evaluate() && k.sources.lfo1); }
    assert.ok(values.every(v => Math.abs(v) <= .700001));
    assert.ok(Math.max(...values) - Math.min(...values) > .5, waveform + ' changes');
  }
  const k = new ControlKernel(1000), m = normalizeModulation();
  m.sources.lfo1 = { ...m.sources.lfo1, enabled: true, phase: 90, sync: 'tempo', beats: 2 };
  k.configure(defaults(), m); k.evaluate(); near(k.sources.lfo1, 1);
  for (let i = 0; i < 250; i++) k.sample(0);
  near(k.phase, .25); k.evaluate(); near(k.sources.lfo1, 0);
});

test('Two LFOs and two envelope followers stay independent and migrate legacy source names', () => {
  const legacy = normalizeModulation({ sources: { lfo: { enabled: true, waveform: 'square', rate: 3 }, envelope: { enabled: true, attack: 30 } }, assignments: [{ id: 'legacy-lfo', source: 'lfo', target: 'cutoff', amount: .2, polarity: 1 }, { id: 'legacy-envelope', source: 'envelope', target: 'eqHigh', amount: .3, polarity: -1 }] });
  assert.equal(legacy.sources.lfo1.enabled, true); assert.equal(legacy.sources.lfo2.enabled, false);
  assert.equal(legacy.sources.envelope1.enabled, true); assert.equal(legacy.sources.envelope2.enabled, false);
  assert.deepEqual(legacy.assignments.map(a => a.source), ['lfo1', 'envelope1']);
  const kernel = new ControlKernel(1000), modulation = normalizeModulation();
  modulation.sources.lfo1 = { ...modulation.sources.lfo1, enabled: true, waveform: 'sine', phase: 0 };
  modulation.sources.lfo2 = { ...modulation.sources.lfo2, enabled: true, waveform: 'sine', phase: 90 };
  modulation.sources.envelope1 = { ...modulation.sources.envelope1, enabled: true, attack: 5 };
  modulation.sources.envelope2 = { ...modulation.sources.envelope2, enabled: true, attack: 500 };
  kernel.configure(defaults(), modulation); kernel.sample(.8); kernel.evaluate();
  assert.notEqual(kernel.sources.lfo1, kernel.sources.lfo2);
  assert.ok(kernel.sources.envelope1 > kernel.sources.envelope2);
});

test('Envelope uses stereo RMS, attack/release and gate without cancelling opposite stereo phases', () => {
  const k = new ControlKernel(1000), m = normalizeModulation(); m.sources.envelope1.enabled = true;
  k.configure(defaults(), m);
  k.sample(0, 0); k.evaluate(); assert.equal(k.sources.envelope1, 0);
  k.sample(.5, -.5); k.evaluate(); const first = k.sources.envelope1;
  for (let i = 0; i < 100; i++) k.sample(.5, -.5);
  k.evaluate(); assert.ok(k.sources.envelope1 > .48 && k.sources.envelope1 < .51);
  assert.ok(first < k.sources.envelope1);
  k.sample(0); k.evaluate(); assert.ok(k.sources.envelope1 > .45, 'release is gradual');
  for (let i = 0; i < 3000; i++) k.sample(0);
  k.evaluate(); assert.equal(k.sources.envelope1, 0);
});

test('Assignments add in normalized domains, invert and clamp without overwriting base values', () => {
  const k = new ControlKernel(48000), m = normalizeModulation(), p = defaults(); p.cutoff = 2000;
  m.sources.lfo1 = { ...m.sources.lfo1, enabled: true, phase: 90 };
  m.sources.envelope1.enabled = true;
  m.assignments = [ { id: '1', source: 'lfo1', target: 'cutoff', amount: .1, polarity: 1 },
    { id: '2', source: 'envelope1', target: 'cutoff', amount: .1, polarity: -1 },
    { id: '3', source: 'lfo1', target: 'driveAmount', amount: 1, polarity: 1 } ];
  k.configure(p, m); k.power = 1;
  near(k.evaluate().cutoff, toNormalized(PARAMETERS.cutoff, 2000));
  assert.equal(k.values.driveAmount, 1); assert.equal(p.driveAmount, .32); assert.equal(p.cutoff, 2000);
  m.sources.envelope1.enabled = false; k.configure(p, m); near(k.evaluate().cutoff, toNormalized(PARAMETERS.cutoff, 2000) + .1);
  const state = new AppState(); state.setModulation(m);
  assert.deepEqual(decodePreset(encodePreset(state.state)).modulation, state.state.modulation);
});

test('Modulation adapters reproduce existing mappings and add no nodes or routing changes on assignment updates', async () => {
  const store = new AppState(), engine = new AudioEngine(deviceMock(), store); await engine.start('', '');
  const controller = engine.modulation, count = engine.context.nodes.length, normalized = {};
  for (const p of Object.values(PARAMETERS)) if (p.modulatable) normalized[p.id] = toNormalized(p, store.state.parameters[p.id]);
  for (const binding of controller.targets) near(bindingValue(binding, normalized, store.state.parameters), binding.param.value, .0002);
  const original = JSON.stringify(store.state.parameters), edges = engine.nodes.registry.edges;
  store.addAssignment(); store.setSource('lfo1', { enabled: true });
  assert.ok(controller.bound.size > 0);
  for (let i = 0; i < 25; i++) { store.setAssignment(store.state.modulation.assignments[0].id, { amount: i / 25 }); store.setParameter('cutoff', 200 + i * 100); }
  assert.equal(engine.context.nodes.length, count); assert.equal(engine.nodes.registry.edges, edges);
  store.setParameter('cutoff', 20000); assert.equal(JSON.stringify(store.state.parameters), original);
  store.deleteAssignment(store.state.modulation.assignments[0].id);
  assert.equal(controller.node.port.messages.at(-1).modulation.assignments.length, 0);
  engine.dispose(); assert.ok(engine.context.nodes.every(n => n.connections.length === 0)); assert.ok(controller.node.port.closed);
});

test('Expanded modulation targets are registry-derived and fallback processors receive bounded final values', async () => {
  const expected = ['gateThreshold', 'gateRange', 'transientAttack', 'wavefolderFold', 'wavefolderBias', 'bitDepth', 'rateReduction', 'compressorThreshold', 'compressorRatio', 'clipperAmount', 'clipperRelease'];
  for (const id of expected) assert.equal(PARAMETERS[id].modulatable, true, id + ' is modulatable');
  const store = new AppState(), engine = new AudioEngine(deviceMock(), store); await engine.start('', '');
  const registry = engine.nodes.registry;
  registry.applyModulation({ wavefolderFold: 1, wavefolderBias: 0, bitDepth: 1, gateThreshold: 0 });
  assert.equal(registry.get('wavefolder').processor.settings.fold, 100);
  assert.equal(registry.get('wavefolder').processor.settings.bias, -100);
  assert.ok(engine.modulation.targets.some(b => b.target === 'bitDepth' && b.param === registry.get('crusher').processor.input.parameters.get('bitDepth')));
  assert.ok(engine.modulation.targets.some(b => b.target === 'gateThreshold'));
  registry.applyModulation({ wavefolderFold: toNormalized(PARAMETERS.wavefolderFold, 25), gateThreshold: toNormalized(PARAMETERS.gateThreshold, -45) });
  near(registry.get('wavefolder').processor.settings.fold, 25, .01);
  near(registry.get('gate').processor.settings.threshold, -45, .01);
  const drive = registry.get('drive').processor, path = drive.paths.get('saturation');
  path.preGain.gain.value = 2.75;
  registry.applyModulation({ driveBias: 1, driveShape: 1 });
  assert.equal(path.preGain.gain.value, 2.75, 'curve modulation does not overwrite amount AudioParams');
  assert.equal(drive.settings.bias, 1); assert.equal(drive.settings.shape, 1);
  engine.dispose();
});

test('Actual worklet processor emits finite smoothed controls, returns to base and disposes', async () => {
  let Processor;
  globalThis.sampleRate = 48000;
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = { close() {} }; } };
  globalThis.registerProcessor = (name, type) => { Processor = type; };
  await import('../src/audio/worklets/ControlWorklet.js');
  const w = new Processor(), m = normalizeModulation(), p = defaults(); p.eqHigh = 0;
  m.sources.lfo1 = { ...m.sources.lfo1, enabled: true, waveform: 'square' };
  m.assignments = [{ id: 'test', source: 'lfo1', target: 'eqHigh', amount: .5, polarity: 1 }];
  const b = { slot: 0, target: 'eqHigh', anchor: 0, table: new Float32Array([-12, 12]) };
  w.port.onmessage({ data: { type: 'config', parameters: p, modulation: m, bindings: [b] } });
  const input = [[new Float32Array(128), new Float32Array(128)]], output = [[new Float32Array(128)]];
  let previous = 0, largestStep = 0;
  for (let block = 0; block < 100; block++) {
    w.process(input, output);
    for (const v of output[0][0]) { assert.ok(Number.isFinite(v)); largestStep = Math.max(largestStep, Math.abs(v - previous)); previous = v; }
  }
  assert.ok(previous > 11.9); assert.ok(largestStep < .011, 'square edges smoothed');
  m.assignments = []; w.port.onmessage({ data: { type: 'config', parameters: p, modulation: m } });
  for (let block = 0; block < 100; block++) w.process(input, output);
  near(output[0][0][127], 0, .001);
  w.port.onmessage({ data: { type: 'dispose' } }); assert.equal(w.process(input, output), false);
});
