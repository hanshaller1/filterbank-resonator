export class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); }
  setTargetAtTime(v, t, tau) { if (!Number.isFinite(v)) throw Error('Non-finite AudioParam'); this.value = v; this.events.push(['target', v, t, tau]); }
  linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['ramp', v, t]); }
  cancelScheduledValues() {}
  cancelAndHoldAtTime() {}
  setValueCurveAtTime(v) { this.value = v[v.length - 1]; }
}
export class AudioNodeMock {
  constructor(context, kind) {
    this.context = context; this.kind = kind; this.numberOfInputs = 1; this.connections = [];
    for (const name of ['gain', 'frequency', 'Q', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release', 'offset']) this[name] = new Param(name === 'gain' ? 1 : 0);
    this.reduction = 0; this.fftSize = 1024; this.level = 0;
    context.nodes.push(this);
  }
  connect(target, output = 0, input = 0) { if (!this.connections.some(e => e[0] === target && e[1] === output && e[2] === input)) this.connections.push([target, output, input]); return target; }
  disconnect(target) { this.connections = target ? this.connections.filter(e => e[0] !== target) : []; }
  getFloatTimeDomainData(data) { data.fill(this.level); }
  getFloatFrequencyData(data) { data.fill(-60); }
  get frequencyBinCount() { return this.fftSize / 2; }
}
export class Context {
  constructor() { this.nodes = []; this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new AudioNodeMock(this, 'destination'); this.audioWorklet = { addModule: async () => {} }; }
  createGain() { return new AudioNodeMock(this, 'gain'); }
  createBiquadFilter() { return new AudioNodeMock(this, 'biquad'); }
  createWaveShaper() { return new AudioNodeMock(this, 'waveshaper'); }
  createDelay() { return new AudioNodeMock(this, 'delay'); }
  createAnalyser() { return new AudioNodeMock(this, 'analyser'); }
  createScriptProcessor() { return new AudioNodeMock(this, 'script'); }
  createChannelSplitter() { return new AudioNodeMock(this, 'splitter'); }
  createChannelMerger() { return new AudioNodeMock(this, 'merger'); }
  createDynamicsCompressor() { return new AudioNodeMock(this, 'compressor'); }
  createMediaStreamSource() { return new AudioNodeMock(this, 'source'); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  async setSinkId(id) { this.sinkId = id; }
}
export const deviceMock = () => ({ opened: 0, closed: 0, async openInput() { this.opened++; return {}; }, closeInput() { this.closed++; } });
export const audioBuffer = (length, value = 0) => { const channels = [new Float32Array(length).fill(value), new Float32Array(length).fill(value)]; return { length, numberOfChannels: 2, getChannelData: c => channels[c] }; };


export class WorkletMock extends AudioNodeMock {
  constructor(context, name, options) {
    super(context, 'worklet'); this.options = options; this.parameters = new Map(['enabled', 'mode', 'threshold', 'range', 'attack', 'release', 'sustain', 'bitEnabled', 'rateEnabled', 'bitDepth', 'reduction', 'amount', 'ceiling'].map(id => [id, new Param()])); this.port = { messages: [], postMessage(message) { this.messages.push(message); }, close() { this.closed = true; } };
  }
}
globalThis.AudioWorkletNode = WorkletMock;
globalThis.Worker = class {
  constructor() { this.messages = []; this.terminated = false; }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
};
