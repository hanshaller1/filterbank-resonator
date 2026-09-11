import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, deviceMock } from './audio-mock.mjs';
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { AppState } from '../src/state/AppState.js';
import { DEFAULT_ORDER } from '../src/state/parameters.js';
globalThis.AudioContext = Context;
test('Routing swaps only graph edges after fading; rapid changes coalesce; semantic taps survive', async () => {
  const store = new AppState(), device = deviceMock(), engine = new AudioEngine(device, store);
  await engine.start('s', 'm');
  const count = engine.context.nodes.length, registry = engine.nodes.registry;
  const reverse = [...DEFAULT_ORDER].reverse(), latest = [...DEFAULT_ORDER.slice(1), 'freeze'];
  const freeze = registry.get('freeze').processor;
  store.setOrder(reverse); store.setOrder(latest);
  assert.deepEqual(registry.order, DEFAULT_ORDER, 'keep old routing during fade down');
  for (let i = 0; i < 8; i++) { engine.context.currentTime += .01; await new Promise(resolve => setTimeout(resolve, 6)); }
  await engine.routing.task;
  assert.deepEqual(registry.order, latest);
  assert.equal(freeze, registry.get('freeze').processor);
  assert.equal(engine.context.nodes.length, count); assert.equal(device.opened, 1);
  for (let i = 0; i < latest.length - 1; i++) {
    const connections = registry.get(latest[i]).output.connections.filter(([dest]) => [...registry.modules.values()].some(m => m.input === dest));
    assert.equal(connections.length, 1); assert.equal(connections[0][0], registry.get(latest[i + 1]).input);
  }
  assert.ok(registry.get('drive').output.connections.some(([dest]) => dest === engine.nodes.metering.taps.postDrive.analyser));
  engine.context.state = 'suspended';
  for (let i = 0; i < 12; i++) { store.setOrder(i % 2 ? latest : reverse); await engine.routing.task; }
  assert.equal(engine.context.nodes.length, count);
  engine.dispose();
  assert.ok(engine.context.nodes.every(n => n.connections.length === 0));
});
test('Routing normalization ignores duplicates and unknown nodes, keeping fixed stages outside the list', () => {
  const state = new AppState(); state.setOrder(['filter', 'filter', 'input', 'output']);
  assert.equal(state.state.order[0], 'filter'); assert.equal(state.state.order.length, 11);
  assert.equal(new Set(state.state.order).size, 11);
});
