import { PARAMETERS, toNormalized } from '../state/parameters.js';
import { FALLBACK_TARGETS, parameterTargets } from './ParameterTargets.js';
export class ModulationEngine {
  static async prepare(context) {
    if (!context.audioWorklet) throw Error('AudioWorklet fehlt. Bitte aktuelles Chrome über HTTPS oder localhost verwenden.');
    if (!context.syntaktControlReady) context.syntaktControlReady = context.audioWorklet.addModule(new URL('./worklets/ControlWorklet.js', import.meta.url)).catch(error => { context.syntaktControlReady = null; throw error; });
    await context.syntaktControlReady;
  }
  constructor(context, nodes, onVisuals = () => {}, onFallbackValues = () => {}) {
    this.context = context; this.nodes = nodes; this.targets = parameterTargets(nodes, context.sampleRate); this.bound = new Map(); this.fallbackTargets = []; this.revision = 0; this.key = ''; this.onVisuals = onVisuals; this.onFallbackValues = onFallbackValues;
    const buses = Math.ceil(this.targets.length / 32);
    this.node = new AudioWorkletNode(context, 'syntakt-control', { numberOfInputs: 1, numberOfOutputs: buses, outputChannelCount: Array(buses).fill(32), channelCount: 2, channelCountMode: 'explicit' });
    this.splitters = Array.from({ length: buses }, (_, i) => { const n = context.createChannelSplitter(32); this.node.connect(n, i); return n; });
    // A silent sink pulls the detector/control branch, never a second audio signal.
    this.silent = context.createGain(); this.silent.gain.value = 0; this.node.connect(this.silent); this.silent.connect(context.destination);
    nodes.inputGain.connect(this.node);
    this.node.port.onmessage = ({ data }) => { if (data?.type === 'visuals' && data.revision === this.revision) { this.onVisuals(data.value); this.onFallbackValues(data.value?.fallbackValues || {}); } };
  }
  apply(parameters, modulation) {
    const key = JSON.stringify([parameters, modulation]);
    const added = [];
    const ids = new Set(modulation.assignments.map(a => a.target));
    this.targets.forEach((binding, slot) => {
      if (this.bound.has(slot) || !(binding.targets || [binding.target]).some(id => ids.has(id))) return;
      const anchor = binding.param.value, held = { ...binding, slot, anchor };
      this.bound.set(slot, held);
      this.splitters[Math.floor(slot / 32)].connect(binding.param, slot % 32);
      const { param, ...descriptor } = held; added.push(descriptor);
    });
    // Existing processors may schedule new base values. Once claimed, an AudioParam
    // holds its anchor and the worklet supplies the complete, bounded effective value.
    for (const b of this.bound.values()) { b.param.cancelScheduledValues(this.context.currentTime); b.param.setValueAtTime(b.anchor, this.context.currentTime); }
    if (key !== this.key || added.length) {
      const fallbackTargets = [...new Set(modulation.assignments.map(assignment => assignment.target).filter(target => FALLBACK_TARGETS[target]))];
      const removed = this.fallbackTargets.filter(target => !fallbackTargets.includes(target));
      if (removed.length) this.onFallbackValues(Object.fromEntries(removed.map(target => [target, toNormalized(PARAMETERS[target], parameters[target])])));
      this.fallbackTargets = fallbackTargets;
      this.node.port.postMessage({ type: 'config', revision: ++this.revision, parameters, modulation, bindings: added, fallbackTargets }); this.key = key;
    }
  }
  setTempo(info) {
    if (info.locked && Math.abs(info.bpm - (this.tempo || 120)) > .001) { this.tempo = info.bpm; this.node.port.postMessage({ type: 'tempo', bpm: info.bpm }); }
  }
  dispose() {
    this.nodes.inputGain.disconnect(this.node); this.node.port.onmessage = null; this.node.port.postMessage({ type: 'dispose' }); this.node.port.close(); this.node.disconnect();
    this.splitters.forEach(n => n.disconnect()); this.silent.disconnect(); this.bound.clear();
  }
}
