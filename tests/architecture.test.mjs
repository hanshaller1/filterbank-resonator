import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Context, deviceMock, audioBuffer } from './audio-mock.mjs';
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { AppState } from '../src/state/AppState.js';
import { DEFAULT_ORDER, PARAMETERS } from '../src/state/parameters.js';
globalThis.AudioContext = Context;

test('Unmodified filter and EQ DSP retain their implementations', () => {
  const hashes = {
    FilterProcessor: 'dd4a4271480713bdb936a711158495d6f13a4d951ccf260a141706876aeafea3',
    BiquadFilterProcessor: '5c9cdfac88817edcda7c45a9e8d2a153c03f93df2e439e3907a3de3925d3908a',
    CombFilterProcessor: 'ab2b337e83322c3bb98172c9de82062c92fe928662504d0febb461b8630e6137',
    FormantFilterProcessor: '63c79f37e12b8e9e0938ac9787c6466bff6c0a5bac0c0f6d36b3c95f9e5ba417',
    EQProcessor: '468c737536bdf82c5797bb96d960891f67994492b8afa34bf640c7cec5dd9c48',
  };
  for (const [name, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync('src/audio/' + name + '.js', 'utf8').replace('\nexport { VOWELS };\n', '')).digest('hex'), hash, name);
});

test('Registry preserves routing, controls, semantic taps, bypass and clean start/stop', async () => {
  const device = deviceMock(), state = new AppState(), engine = new AudioEngine(device, state);
  await engine.start('syntakt', 'minifuse');
  const { registry, metering } = engine.nodes;
  assert.deepEqual(registry.order, DEFAULT_ORDER);
  assert.equal(engine.context.sinkId, 'minifuse');
  for (let i = 0; i < DEFAULT_ORDER.length - 1; i++) assert.ok(registry.get(DEFAULT_ORDER[i]).output.connections.some(([dest]) => dest === registry.get(DEFAULT_ORDER[i + 1]).input));
  for (const [id, tap] of [['drive', 'postDrive'], ['filter', 'postFilter'], ['eq', 'postEq']]) assert.ok(registry.get(id).output.connections.some(([dest]) => dest === metering.taps[tap].analyser));
  const count = engine.context.nodes.length, edges = registry.edges;
  state.setParameters({ driveAmount: .7, eqHigh: 7, cutoff: 1500, gateEnabled: true, clipperEnabled: true });
  assert.equal(PARAMETERS.outputMute, undefined);
  assert.equal(engine.nodes.outputMuteGain, undefined);
  assert.equal(registry.get('drive').processor.settings.amount, .7);
  assert.equal(registry.get('eq').processor.settings.high, 7);
  assert.equal(registry.get('gate').enabled, true);
  assert.equal(engine.context.nodes.length, count);
  assert.equal(registry.edges, edges);
  state.setParameters({ dryWet: 0, wetGain: 12 });
  assert.equal(engine.nodes.wetGain.gain.value, 0); assert.equal(engine.nodes.dryGain.gain.value, 1);
  state.setParameters({ dryWet: 1, bypass: true });
  assert.equal(engine.nodes.wetGain.gain.value, 0); assert.equal(engine.nodes.dryGain.gain.value, 1);
  const module = registry.get('filter'), saved = module.getState();
  module.reset(); module.restoreState(saved);
  assert.equal(module.getParameter('cutoff'), 1500);
  engine.stop();
  assert.equal(engine.active, false);
  assert.ok(engine.context.nodes.every(n => n.connections.length === 0), 'all internal paths and detectors disconnected');
  assert.ok(engine.context.nodes.filter(n => n.kind === 'script').every(n => n.onaudioprocess === null));
  await engine.start('syntakt', 'minifuse'); assert.equal(device.opened, 2);
  engine.dispose(); assert.equal(state.listeners.size, 0);
});


test('Parameter sanitization excludes unknown, non-finite and invalid enum values', () => {
  const store = new AppState({ cutoff: -1, resonance: Infinity, filterType: 'bad', injected: 8 });
  assert.equal(store.state.parameters.cutoff, 20);
  assert.equal(store.state.parameters.resonance, .7);
  assert.equal(store.state.parameters.filterType, 'lowpass');
  assert.equal(store.state.parameters.injected, undefined);
  assert.equal(Object.keys(store.state.parameters).length, Object.keys(PARAMETERS).length);
});
