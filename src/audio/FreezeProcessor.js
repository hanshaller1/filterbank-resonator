// Free and Sync share one sample-clocked capture engine and stereo page pool.
export class FreezeProcessor {
  static async prepare(context) {
    if (!context.syntaktFreezeReady) context.syntaktFreezeReady = context.audioWorklet.addModule(new URL('./worklets/FreezeSyncWorklet.js', import.meta.url)).catch(error => { context.syntaktFreezeReady = null; throw error; });
    await context.syntaktFreezeReady;
  }
  constructor(context) {
    this.context = context; this.mode = 'free'; this.info = null;
    this.sync = new AudioWorkletNode(context, 'syntakt-freeze-sync', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    this.input = this.sync; this.output = this.sync;
    this.sync.port.onmessage = ({ data }) => { if (data.type === 'status') this.info = data; };
    try {
      this.worker = new Worker(new URL('./freeze/TempoWorker.js', import.meta.url), { type: 'module' });
      this.channel = new MessageChannel();
      this.worker.postMessage({ type: 'connect', port: this.channel.port1 }, [this.channel.port1]);
      this.sync.port.postMessage({ type: 'connect-analysis', port: this.channel.port2 }, [this.channel.port2]);
      this.worker.onerror = () => this.sync.port.postMessage({ type: 'analysis-error' });
    } catch { this.sync.port.postMessage({ type: 'analysis-error' }); }
  }
  connect(destination) { this.output.connect(destination); }
  connectTempoSource(source) { this.tempoSource = source; source.connect(this.sync, 0, 1); }
  update(settings) {
    this.mode = settings.mode === 'sync' ? 'sync' : 'free';
    this.sync.port.postMessage({ type: 'config', settings: { ...settings, mode: this.mode } });
  }
  setBeat1() { this.sync.port.postMessage({ type: 'beat-one' }); }
  updateTempoAnalysis() {
    if (this.mode === 'free') return { ...this.info, locked: false, valid: false, status: 'Free mode' };
    return this.info || { bpm: null, locked: false, valid: false, confidence: 0, status: 'Detecting', triggerStatus: 'Live' };
  }
  dispose() {
    try { this.tempoSource?.disconnect(this.sync); } catch {}
    this.worker?.terminate(); this.channel?.port1.close(); this.channel?.port2.close();
    this.sync.port.postMessage({ type: 'dispose' }); this.sync.port.onmessage = null;
  }
}
