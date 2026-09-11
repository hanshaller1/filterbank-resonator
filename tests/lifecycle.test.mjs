import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from './audio-mock.mjs';
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { DeviceManager } from '../src/audio/DeviceManager.js';
globalThis.AudioContext = Context;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const stream = () => { const track = { stopped: false, stop() { this.stopped = true; } }; return { track, getTracks: () => [track] }; };

test('A stopped or superseded input request cannot leak a stream or replace the newest device', async () => {
  const requests = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia() { const request = deferred(); requests.push(request); return request.promise; } } } });
  const devices = new DeviceManager();
  const first = devices.openInput('first');
  const second = devices.openInput('second');
  const newer = stream(), older = stream();
  requests[1].resolve(newer); assert.equal(await second, newer);
  requests[0].resolve(older); assert.equal(await first, null);
  assert.equal(older.track.stopped, true); assert.equal(devices.stream, newer);
  const third = devices.openInput('third');
  assert.equal(newer.track.stopped, true);
  devices.closeInput(); const late = stream(); requests[2].resolve(late);
  assert.equal(await third, null); assert.equal(late.track.stopped, true); assert.equal(devices.stream, null);
});

test('Stop during worklet initialization never opens an input afterwards', async () => {
  const pending = deferred(), devices = { opened: 0, async openInput() { this.opened++; return stream(); }, closeInput() {} };
  const engine = new AudioEngine(devices); engine.context = new Context();
  engine.context.audioWorklet.addModule = () => pending.promise;
  const started = engine.start('syntakt', 'minifuse'); engine.stop(); pending.resolve();
  assert.equal(await started, false); assert.equal(devices.opened, 0); assert.equal(engine.nodes, null);
  engine.dispose();
});

test('A stale failed start cannot stop a newer successful audio session', async () => {
  const first = deferred(), entered = deferred(); let opened = 0;
  const engine = new AudioEngine({ async openInput() { if (++opened === 1) { entered.resolve(); return first.promise; } return stream(); }, closeInput() {} });
  const oldStart = engine.start('old', ''); await entered.promise;
  assert.equal(await engine.start('new', ''), true);
  first.reject(Error('old device disappeared'));
  assert.equal(await oldStart, false); assert.equal(engine.active, true); assert.ok(engine.nodes);
  engine.dispose();
});
