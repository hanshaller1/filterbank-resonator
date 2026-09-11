import { FreezeEngine } from '../freeze/FreezeEngine.js';
import { FreezeSyncController } from '../freeze/FreezeSyncController.js';
import { OnsetEnvelope } from '../freeze/OnsetEnvelope.js';

class FreezeSyncWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new FreezeEngine(sampleRate);
    this.sync = new FreezeSyncController(sampleRate, this.engine);
    this.analysisPort = null; this.lastStatusFrame = -Infinity; this.epoch = 0; this.disposed = false;
    this.analysisFrames = 0; this.analysisBatches = 0; this.analysisReplies = 0;
    this.analysisRms = 0; this.analysisDiagnostics = null; this.lastReplyFrame = null;
    this.envelope = new OnsetEnvelope(sampleRate, batch => {
      this.analysisRms = Math.sqrt(batch.reduce((sum, value, i) => i % 3 === 1 ? sum + value * value : sum, 0) / (batch.length / 3));
      if (!this.analysisPort) return;
      this.analysisBatches++;
      this.analysisPort.postMessage({ type: 'envelope', batch, epoch: this.epoch, referenceBpm: this.sync.clock.valid ? this.sync.clock.bpm : null });
    });
    this.port.onmessage = ({ data }) => {
      if (data.type === 'connect-analysis') {
        this.analysisPort = data.port;
        this.analysisPort.onmessage = ({ data: result }) => {
          if (result.type !== 'analysis' || result.epoch !== this.epoch) return;
          this.analysisReplies++; this.lastReplyFrame = currentFrame; this.analysisDiagnostics = result.diagnostics;
          this.sync.onAnalysis(result, currentFrame);
        };
        this.analysisPort.start();
      } else if (data.type === 'config') {
        if (data.settings.mode !== this.sync.settings.mode) {
          this.envelope.reset(); this.epoch++; this.analysisPort?.postMessage({ type: 'reset' });
          this.analysisFrames = 0; this.analysisBatches = 0; this.analysisReplies = 0;
          this.analysisRms = 0; this.analysisDiagnostics = null; this.lastReplyFrame = null;
        }
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
    if (syncMode) this.analysisFrames += outL.length;
    for (let i = 0; i < outL.length; i++) {
      const frame = currentFrame + i;
      this.sync.tick(frame);
      this.engine.processSample(frame, left?.[i] || 0, right?.[i] || 0, outL, outR, i);
      if (syncMode) {
        let analysisLeft = detectorL?.[i] || 0, analysisRight = detectorR?.[i] || 0;
        // Some graphs expose the dedicated analysis input as empty/silent; input 0 still carries the live signal.
        if (analysisLeft === 0 && analysisRight === 0) {
          analysisLeft = left?.[i] || 0; analysisRight = right?.[i] || 0;
        }
        this.envelope.process(analysisLeft, analysisRight, frame);
      }
    }
    if (currentFrame - this.lastStatusFrame >= sampleRate * .1) {
      this.lastStatusFrame = currentFrame;
      this.port.postMessage({ type: 'status', ...this.sync.info(currentFrame + outL.length),
        analysis: { seconds: this.analysisFrames / sampleRate, rms: this.analysisRms,
          connected: Boolean(this.analysisPort), batches: this.analysisBatches, replies: this.analysisReplies,
          replyAge: this.lastReplyFrame === null ? null : (currentFrame - this.lastReplyFrame) / sampleRate,
          ...this.analysisDiagnostics } });
    }
    return true;
  }
}
registerProcessor('syntakt-freeze-sync', FreezeSyncWorklet);
