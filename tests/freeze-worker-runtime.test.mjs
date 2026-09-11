import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker, MessageChannel } from 'node:worker_threads';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { FreezeSyncController } from '../src/audio/freeze/FreezeSyncController.js';

// Browser Worker globals only; the detector and message protocol are production code.
const workerHost = `
  const { parentPort, workerData } = require('node:worker_threads');
  globalThis.self = {};
  import(workerData).then(() => {
    parentPort.on('message', data => {
      self.onmessage({ data });
      if (data.type === 'connect') data.port.on('message', message => {
        if (message.type === 'test-barrier') data.port.postMessage(message);
      });
    });
    parentPort.postMessage('ready');
  });
`;

test('Recorded kick reaches the Auto clock and BPM lock through the real Worker', async t => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/freeze-kick-142-envelope.json', import.meta.url)));
  const batches = JSON.parse(inflateSync(Buffer.from(fixture.data, 'base64')));
  const worker = new Worker(workerHost, { eval: true, workerData: new URL('../src/audio/freeze/TempoWorker.js', import.meta.url).href });
  const { port1, port2 } = new MessageChannel();
  t.after(async () => { port1.close(); port2.close(); await worker.terminate(); });
  await once(worker, 'message');
  worker.postMessage({ type: 'connect', port: port1 }, [port1]);
  const sync = new FreezeSyncController(fixture.sampleRate, { frozen: false });
  sync.configure({ mode: 'sync', bpmMode: 'auto' }, 0);
  let frame = 0, replies = 0;
  port2.on('message', message => {
    if (message.type !== 'analysis') return;
    replies++;
    sync.onAnalysis(message, frame);
    if (message.tempo.stableBpm !== null) assert.ok(Math.abs(message.tempo.stableBpm - 142) < .2);
  });
  for (const batch of batches) {
    frame = Math.round(batch.at(-3) * fixture.sampleRate);
    await new Promise(resolve => {
      const listener = message => {
        if (message.type !== 'test-barrier') return;
        port2.off('message', listener); resolve();
      };
      port2.on('message', listener);
      port2.postMessage({ type: 'envelope', batch, referenceBpm: null });
      port2.postMessage({ type: 'test-barrier' });
    });
  }
  assert.ok(replies >= 20);
  assert.equal(sync.info(frame).status, 'Stable');
  assert.equal(sync.clock.valid, true);
  assert.ok(Math.abs(sync.effectiveBpm - 142) < .2);
  assert.ok(Math.abs(sync.clock.bpm - 142) < .2);
  sync.configure({ tempoLocked: true, lockedBpm: sync.detection.stableBpm }, frame);
  assert.equal(sync.info(frame).status, 'Locked');
  assert.ok(Math.abs(sync.effectiveBpm - 142) < .2);
});

test('Cold Auto startup exchanges real Worker messages and reports why tempo is accepted', { timeout: 15000 }, async t => {
  let Processor;
  globalThis.sampleRate = 48000; globalThis.currentFrame = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() { this.port = { postMessage: message => { this.status = message; } }; }
  };
  globalThis.registerProcessor = (_, constructor) => { Processor = constructor; };
  await import('../src/audio/worklets/FreezeSyncWorklet.js');
  for (const bpm of [100, 128, 142, 148]) {
    const worker = new Worker(workerHost, { eval: true, workerData: new URL('../src/audio/freeze/TempoWorker.js', import.meta.url).href });
    const { port1, port2 } = new MessageChannel();
    const processor = new Processor();
    t.after(async () => { port1.close(); port2.close(); await worker.terminate(); });
    await once(worker, 'message');
    worker.postMessage({ type: 'connect', port: port1 }, [port1]);
    processor.port.onmessage({ data: { type: 'connect-analysis', port: port2 } });
    processor.port.onmessage({ data: { type: 'config', settings: { mode: 'sync', bpmMode: 'auto', frozen: true, syncLength: 'beat', startQuantize: 'beat' } } });
    const input = [[new Float32Array(128), new Float32Array(128)], [new Float32Array(128), new Float32Array(128)]];
    const output = [[new Float32Array(128), new Float32Array(128)]];
    let hadCandidate = false;
    for (let chunk = 0; chunk < 20; chunk++) {
      for (let block = 0; block < 375; block++) {
        for (let i = 0; i < 128; i++) {
          const time = (currentFrame + i) / sampleRate;
          const subdivision = bpm === 148 ? 4 : bpm === 142 ? 3 : 1;
          const age = time % (60 / bpm / subdivision);
          const accent = bpm === 148 ? [1, .45, .8, .45][Math.floor(time * bpm / 60 * 4) % 4]
            : bpm === 142 ? [1, .7, .5][Math.floor(time * bpm / 60 * 3) % 3] : 1;
          const kick = Math.sin(2 * Math.PI * 65 * age) * Math.exp(-age * 70) * .2 * accent;
          // Live source only on the dedicated tap, right channel; processed input stays silent.
          input[1][1][i] = kick;
        }
        processor.process(input, output); globalThis.currentFrame += 128;
      }
      await new Promise(resolve => {
        const listener = message => {
          if (message.type !== 'test-barrier') return;
          port2.off('message', listener); resolve();
        };
        port2.on('message', listener); port2.postMessage({ type: 'test-barrier' });
      });
      hadCandidate ||= Number.isFinite(processor.sync.detection.detectedBpm);
      const stable = processor.sync.detection.stableBpm;
      if (stable !== null && stable !== undefined) {
        assert.ok(Math.abs(stable - bpm) < .2, `At second ${chunk + 1}: expected ${bpm}, stable ${stable}`);
      }
    }
    processor.lastStatusFrame = -Infinity;
    processor.process(input, output);
    const info = processor.sync.info(currentFrame);
    assert.ok(hadCandidate);
    assert.ok(Math.abs(info.stableBpm - bpm) < .2, JSON.stringify({ expected: bpm, info, diagnostics: processor.analysisDiagnostics }));
    assert.equal(info.valid, true);
    assert.ok(Math.abs(info.bpm - bpm) < .2);
    assert.ok(Math.abs(info.loopBpm - bpm) < .2);
    assert.equal(info.status, 'Stable');
    assert.notEqual(info.triggerStatus, 'Waiting for tempo');
    assert.ok(processor.status.analysis.seconds >= 20);
    assert.ok(processor.status.analysis.rms > 0);
    assert.ok(processor.status.analysis.batches > 90);
    assert.ok(processor.status.analysis.replies >= 15);
    assert.ok(processor.status.analysis.onsetCount > 20);
    assert.equal(processor.status.analysis.reason, 'Stable');
    processor.port.onmessage({ data: { type: 'dispose' } });
    await worker.terminate();
  }
});
