import { RealtimeKernel } from '../RealtimeKernel.js';
import { AutoGainKernel } from '../AutoGainKernel.js';
const parameter = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });
export class RealtimeWorklet extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    parameter('enabled', 0, 0, 1), parameter('mode', 0, 0, 1),
    parameter('threshold', -45, -80, 0), parameter('range', 48, 0, 60),
    parameter('attack', 5, -100, 100), parameter('release', 120, 20, 1000), parameter('sustain', 0, -100, 100),
    parameter('bitEnabled', 1, 0, 1), parameter('rateEnabled', 1, 0, 1),
    parameter('bitDepth', 8, 2, 16), parameter('reduction', .35, 0, .95),
    parameter('amount', .25, 0, 1), parameter('ceiling', -1, -12, -.1)
  ]; }
  constructor(options) {
    super(); this.kernel = new RealtimeKernel(sampleRate, options.processorOptions.kind); this.alive = true;
    this.port.onmessage = ({ data }) => { if (data.type === 'dispose') { this.alive = false; this.port.close(); } };
  }
  process(inputs, outputs, parameters) {
    if (!this.alive) return false;
    this.kernel.process(inputs[0] || [], outputs[0], parameters);
    if (this.kernel.kind === 'clipper') {
      this.limiterReduction = Math.max(this.limiterReduction || 0, this.kernel.limiterReduction || 0);
      this.softClipActivity = Math.max(this.softClipActivity || 0, this.kernel.softClipActivity || 0);
      this.frames = (this.frames || 0) + outputs[0][0].length;
      if (this.frames >= sampleRate / 20) {
        this.port.postMessage({ type: 'clipper-metrics', limiterReduction: this.limiterReduction, softClipActivity: this.softClipActivity });
        this.frames = 0; this.limiterReduction = 0; this.softClipActivity = 0;
      }
    }
    return true;
  }
}
registerProcessor('syntakt-realtime', RealtimeWorklet);

export class AutoGainWorklet extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [parameter('enabled',0,0,1)]; }
  constructor() {
    super(); this.kernel = new AutoGainKernel(sampleRate); this.alive = true; this.frames = 0;
    this.port.onmessage = ({data}) => { if(data.type === 'dispose') { this.alive = false; this.port.close(); } };
  }
  process(inputs,outputs,parameters) {
    if (!this.alive) return false;
    this.kernel.process(inputs,outputs[0],parameters.enabled[0] >= .5);
    this.frames += outputs[0][0].length;
    if(this.frames >= sampleRate/10) { this.frames=0; this.port.postMessage({type:'correction',value:20*Math.log10(this.kernel.gain)}); }
    return true;
  }
}
registerProcessor('syntakt-auto-gain',AutoGainWorklet);
