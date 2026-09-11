import { FreezeEngine } from '../freeze/FreezeEngine.js';
import { FreezeSyncController } from '../freeze/FreezeSyncController.js';
import { OnsetEnvelope } from '../freeze/OnsetEnvelope.js';

class FreezeSyncWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new FreezeEngine(sampleRate);
    this.sync = new FreezeSyncController(sampleRate, this.engine);
    this.analysisPort = null; this.lastStatusFrame = -Infinity; this.epoch = 0; this.disposed = false;
    this.envelope = new OnsetEnvelope(sampleRate, batch => this.analysisPort?.postMessage({ type: 'envelope', batch, epoch: this.epoch, referenceBpm: this.sync.clock.valid ? this.sync.clock.bpm : null }));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'connect-analysis') {
        this.analysisPort = data.port;
        this.analysisPort.onmessage = ({ data: result }) => { if (result.type === 'analysis' && result.epoch === this.epoch) this.sync.onAnalysis(result, currentFrame); };
        this.analysisPort.start();
      } else if (data.type === 'config') {
        if (data.settings.mode !== this.sync.settings.mode) { this.envelope.reset(); this.epoch++; this.analysisPort?.postMessage({ type: 'reset' }); }
        this.sync.configure(data.settings, currentFrame);
      } else if (data.type === 'beat-one') this.sync.setBeat1(currentFrame);
      else if (data.type === 'analysis-error') this.sync.error = 'Tempoanalyse nicht verfügbar. Bitte Manual BPM verwenden.';
      else if (data.type === 'dispose') { this.disposed = true; this.engine.dispose(); this.analysisPort?.close(); }
    };
  }
  process(inputs, outputs) {
    if (this.disposed) return false;
    const output = outputs[0]; if (!output?.length) return true;
    const input = inputs[0] || [], detector = inputs[1] || [];
    const left = input[0], right = input[1] || left;
    const detectorL = detector[0], detectorR = detector[1] || detectorL;
    const outL = output[0], outR = output[1] || outL;
    const syncMode = this.sync.settings.mode === 'sync';
    for (let i = 0; i < outL.length; i++) {
      const frame = currentFrame + i;
      this.sync.tick(frame);
      this.engine.processSample(frame, left?.[i] || 0, right?.[i] || 0, outL, outR, i);
      if (syncMode) this.envelope.process(detectorL?.[i] || 0, detectorR?.[i] || 0, frame);
    }
    if (currentFrame - this.lastStatusFrame >= sampleRate * .1) {
      this.lastStatusFrame = currentFrame;
      this.port.postMessage({ type: 'status', ...this.sync.info(currentFrame + outL.length) });
    }
    return true;
  }
}
registerProcessor('syntakt-freeze-sync', FreezeSyncWorklet);
