import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, deviceMock } from './audio-mock.mjs';
import { AppState } from '../src/state/AppState.js';
import { resolveMacroParameters } from '../src/control/macros.js';
import { ControlKernel } from '../src/control/ControlKernel.js';
import { PARAMETERS, toNormalized } from '../src/state/parameters.js';
import { encodePreset, decodePreset } from '../src/state/schema.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';
globalThis.AudioContext = Context;
const near = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} ≈ ${b}`);

test('Eight stable macros support several targets, logarithmic frequency, dB and inverted ranges', () => {
  const s = new AppState();
  assert.deepEqual(s.state.macros.map(m => m.id), Array.from({ length: 8 }, (_, i) => 'macro-' + (i + 1)));
  s.setMacro('macro-1', { name: 'Aggression', value: .5, assignments: [
    { id: 'a', target: 'driveAmount', min: .2, max: .8, polarity: 1 },
    { id: 'b', target: 'cutoff', min: 200, max: 20000, polarity: -1 },
    { id: 'c', target: 'wetGain', min: 0, max: -6, polarity: 1 }
  ] });
  const base = { ...s.state.parameters }, resolve = () => resolveMacroParameters(s.state.parameters, s.state.macros);
  near(resolve().driveAmount, .5); near(resolve().cutoff, 2000); near(resolve().wetGain, -3);
  s.setMacro('macro-1', { value: 1 }); near(resolve().cutoff, 200); near(resolve().driveAmount, .8);
  s.setMacro('macro-1', { value: 0 }); near(resolve().cutoff, 20000); near(resolve().driveAmount, .2);
  assert.deepEqual(s.state.parameters, base);
  assert.deepEqual(decodePreset(encodePreset(s.state)).macros, s.state.macros);
});

test('Macro offsets combine deterministically then modulation applies, all within target limits', () => {
  const s = new AppState({ driveAmount: .5 });
  for (const id of ['macro-1', 'macro-2']) s.setMacro(id, { value: 1, assignments: [{ id, target: 'driveAmount', min: .5, max: .7, polarity: 1 }] });
  let p = resolveMacroParameters(s.state.parameters, s.state.macros); near(p.driveAmount, .9);
  s.setSource('lfo1', { enabled: true, phase: 90 });
  s.setModulation({ ...s.state.modulation, assignments: [{ id: 'l', source: 'lfo1', target: 'driveAmount', amount: .2, polarity: 1 }] });
  const k = new ControlKernel(48000); k.configure(p, s.state.modulation); near(k.evaluate().driveAmount, 1);
  assert.equal(s.state.parameters.driveAmount, .5);
  s.setSource('lfo1', { enabled: false }); k.configure(p, s.state.modulation); near(k.evaluate().driveAmount, .9);
  s.setMacro('macro-1', { assignments: [] }); p = resolveMacroParameters(s.state.parameters, s.state.macros); near(p.driveAmount, .7);
});

test('Performance mode is UI-only, macros affect existing processors and are supplied as modulation base', async () => {
  const s = new AppState(), engine = new AudioEngine(deviceMock(), s); await engine.start('', '');
  const count = engine.context.nodes.length, edges = engine.nodes.registry.edges;
  s.setMacro('macro-1', { value: .5, assignments: [{ id: '1', target: 'cutoff', min: 200, max: 20000, polarity: 1 }] });
  near(engine.nodes.registry.get('filter').processor.settings.frequency, 2000);
  near(engine.modulation.node.port.messages.at(-1).parameters.cutoff, 2000);
  const settings = JSON.stringify(engine.nodes.registry.get('filter').processor.settings);
  for (let i = 0; i < 20; i++) s.setPerformance(i % 2 === 0);
  assert.equal(JSON.stringify(engine.nodes.registry.get('filter').processor.settings), settings);
  assert.equal(engine.context.nodes.length, count); assert.equal(engine.nodes.registry.edges, edges);
  assert.equal(s.state.parameters.cutoff, 20000);
  s.storeSnapshot('a'); s.setParameter('cutoff', 400); s.storeSnapshot('b'); s.setMorph(.5);
  assert.ok(Number.isFinite(engine.nodes.registry.get('filter').processor.settings.frequency));
  s.setParameter('freezeEnabled', true); assert.equal(engine.nodes.registry.get('freeze').enabled, true);
  s.setParameter('bypass', true); assert.equal(engine.nodes.dryGain.gain.value, 1); assert.equal(engine.nodes.wetGain.gain.value, 0);
  engine.dispose(); assert.ok(engine.context.nodes.every(n => !n.connections.length));
});

test('Malformed macro targets are rejected and finite range/default migration preserves eight slots', () => {
  const state = decodePreset({ schemaVersion: 1, settings: { cutoff: 1000 }, macros: [{ id: 'macro-1', name: '<script>oops</script>', value: Infinity, assignments: [
    { target: 'unknown', min: -1, max: 2 }, { id: 'valid', target: 'cutoff', min: -12, max: Infinity, polarity: -1 }, { target: 'filterType' }
  ] }] });
  assert.equal(state.macros.length, 8); assert.equal(state.macros[0].value, 0); assert.equal(state.macros[0].assignments.length, 1);
  assert.equal(state.macros[0].assignments[0].min, 20); assert.equal(state.macros[0].assignments[0].max, PARAMETERS.cutoff.default);
  near(toNormalized(PARAMETERS.cutoff, state.parameters.cutoff), Math.log(50) / Math.log(1000));
});
