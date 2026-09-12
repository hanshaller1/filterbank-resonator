export class RealtimeProcessor {
  static async prepare(context) {
    if (!context.syntaktRealtimeReady) context.syntaktRealtimeReady = context.audioWorklet.addModule(new URL('./worklets/RealtimeWorklet.js', import.meta.url)).catch(error => { context.syntaktRealtimeReady = null; throw error; });
    await context.syntaktRealtimeReady;
  }
  constructor(context, kind, defaults) {
    this.context = context; this.settings = defaults; this.enabled = false;
    this.input = new AudioWorkletNode(context, 'syntakt-realtime', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { kind } });
    this.output = this.input; this.update(defaults);
  }
  connect(destination) { this.output.connect(destination); }
  update(settings = {}) {
    Object.assign(this.settings, settings); this.enabled = Boolean(this.settings.enabled);
    for (const [id, value] of Object.entries(this.settings)) {
      const param = this.input.parameters.get(id);
      const numeric = id === 'mode' ? Number(value === 'expander' || value === 'limiter') : Number(value);
      if (param && Number.isFinite(numeric)) param.setTargetAtTime(numeric, this.context.currentTime, .02);
    }
  }
  dispose() { this.input.port.postMessage({ type: 'dispose' }); }
}
export class GateExpanderProcessor extends RealtimeProcessor {
  constructor(context) { super(context, 'gate', { enabled: false, mode: 'gate', threshold: -45, range: 48, attack: 5, release: 120 }); }
  updateAnalysis() {} // Detection runs in the worklet, never from UI refresh.
}
export class TransientProcessor extends RealtimeProcessor {
  constructor(context) { super(context, 'transient', { enabled: false, attack: 0, sustain: 0 }); }
}
export class BitcrusherProcessor extends RealtimeProcessor {
  constructor(context) { super(context, 'crusher', { enabled: false, bitEnabled: true, rateEnabled: true, bitDepth: 8, reduction: .35 }); }
}
export class ClipperLimiterProcessor extends RealtimeProcessor {
  constructor(context) {
    super(context, 'clipper', { enabled: false, mode: 'softclip', threshold: -3, amount: .25, ceiling: -1, release: 100 });
    this.metrics = { limiterReduction: 0, softClipActivity: 0 };
    this.input.port.onmessage = ({ data }) => {
      if (data.type === 'clipper-metrics') this.metrics = {
        limiterReduction: Number.isFinite(data.limiterReduction) ? Math.max(0, data.limiterReduction) : 0,
        softClipActivity: Number.isFinite(data.softClipActivity) ? Math.max(0, data.softClipActivity) : 0
      };
      // Accept an already loaded pre-fix worklet until the next audio restart.
      if (data.type === 'reduction' && Number.isFinite(data.value)) {
        const value = Math.max(0, data.value);
        this.metrics = this.settings.mode === 'limiter' ? { limiterReduction: value, softClipActivity: 0 } : { limiterReduction: 0, softClipActivity: value };
      }
    };
  }
  update(settings = {}) {
    const previousMode = this.settings?.mode;
    super.update(settings);
    if (this.metrics && (previousMode !== this.settings.mode || !this.enabled)) this.metrics = { limiterReduction: 0, softClipActivity: 0 };
  }
  getActivity() { return this.enabled ? this.settings.mode === 'limiter' ? this.metrics.limiterReduction : this.metrics.softClipActivity : 0; }
  getReduction() { return this.enabled && this.settings.mode === 'limiter' ? -this.metrics.limiterReduction : 0; }
  getMetrics() { return this.enabled ? { ...this.metrics } : { limiterReduction: 0, softClipActivity: 0 }; }
}
