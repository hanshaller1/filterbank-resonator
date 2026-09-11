import { MODULES, PARAMETERS, fromNormalized, sanitizeOrder } from '../state/parameters.js';
import { FALLBACK_TARGETS } from './ParameterTargets.js';
import { DriveProcessor } from './DriveProcessor.js';
import { FilterProcessor } from './FilterProcessor.js';
import { EQProcessor } from './EQProcessor.js';
import { WavefolderProcessor, CompressorProcessor, StereoWidthProcessor } from './AdditionalProcessors.js';
import { GateExpanderProcessor, TransientProcessor, BitcrusherProcessor, ClipperLimiterProcessor } from './RealtimeProcessors.js';
import { FreezeProcessor } from './FreezeProcessor.js';

// All integration-specific names live here; the original DSP implementations are reused.
export const ADAPTERS = {
  freeze: { create: c => new FreezeProcessor(c), settings: p => ({ enabled: p.freezeEnabled, frozen: p.freezeEnabled, mode: p.freezeMode, freeLength: p.freezeFreeLength, syncLength: p.freezeSyncLength, bpmMode: p.freezeBpmMode, manualBpm: p.freezeManualBpm, tempoLocked: p.freezeTempoLocked, lockedBpm: p.freezeLockedBpm, startQuantize: p.freezeStartQuantize, releaseQuantize: p.freezeReleaseQuantize }) },
  gate: { create: c => new GateExpanderProcessor(c), settings: p => ({ enabled: p.gateEnabled, mode: p.gateMode, threshold: p.gateThreshold, range: p.gateRange, attack: p.gateAttack, release: p.gateRelease }) },
  transient: { create: c => new TransientProcessor(c), settings: p => ({ enabled: p.transientEnabled, attack: p.transientAttack, sustain: p.transientSustain }) },
  drive: { create: c => new DriveProcessor(c), settings: p => ({ amount: p.driveAmount, character: p.driveCharacter, tone: p.driveTone, bias: p.driveBias, shape: p.driveShape, bypass: !p.driveEnabled }) },
  wavefolder: { create: c => new WavefolderProcessor(c), settings: p => ({ enabled: p.wavefolderEnabled, fold: p.wavefolderFold, bias: p.wavefolderBias, output: p.wavefolderOutput }) },
  crusher: { create: c => new BitcrusherProcessor(c), settings: p => ({ enabled: p.crusherEnabled, bitEnabled: p.bitEnabled, rateEnabled: p.rateEnabled, bitDepth: p.bitDepth, reduction: p.rateReduction }) },
  filter: { create: c => new FilterProcessor(c), settings: p => ({ type: p.filterType, frequency: p.cutoff, resonance: p.resonance, peakGain: p.filterPeakGain, bypass: !p.filterEnabled }) },
  eq: { create: c => new EQProcessor(c), settings: p => ({ type: p.eqType, low: p.eqLow, mid: p.eqMid, high: p.eqHigh, tilt: p.eqTilt, graphic: [0, 1, 2, 3, 4].map(i => p['eqGraphic' + i]), bypass: !p.eqEnabled }) },
  compressor: { create: c => new CompressorProcessor(c), settings: p => ({ enabled: p.compressorEnabled, threshold: p.compressorThreshold, ratio: p.compressorRatio, attack: p.compressorAttack, release: p.compressorRelease, makeup: p.compressorMakeup }) },
  width: { create: c => new StereoWidthProcessor(c), settings: p => ({ enabled: p.widthEnabled, width: p.width }) },
  clipper: { create: c => new ClipperLimiterProcessor(c), settings: p => ({ enabled: p.clipperEnabled, mode: p.clipperMode, threshold: p.clipperThreshold, amount: p.clipperAmount, ceiling: p.clipperCeiling, release: p.clipperRelease }) }
};

// Teardown includes nested character/filter paths and ScriptProcessor callbacks.
export function disposeGraph(root, context) {
  const visited = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object' || value === context || visited.has(value) || ArrayBuffer.isView(value)) return;
    visited.add(value);
    if (typeof value.connect === 'function' && typeof value.numberOfInputs === 'number') {
      if ('onaudioprocess' in value) value.onaudioprocess = null;
      if (value.port) { value.port.onmessage = null; value.port.close(); }
      try { value.disconnect(); } catch {}
      return;
    }
    if (value instanceof Map) { for (const v of value.values()) visit(v); }
    else for (const [key, v] of Object.entries(value)) if (key !== 'context' && key !== 'audioContext') visit(v);
  }
  visit(root);
}
export class ProcessingModule {
  constructor(definition, context, store) {
    this.id = definition.id; this.type = definition.type; this.displayName = definition.displayName;
    this.enabledParameter = definition.enabledParameter;
    this.store = store;
    this.context = context;
    this.processor = ADAPTERS[this.id].create(context);
    this.input = this.processor.input;
    this.output = this.processor.output;
    this.applied = null;
  }
  get enabled() { return this.store.state.parameters[this.enabledParameter]; }
  get parameters() { return Object.fromEntries(MODULES.find(m => m.id === this.id).parameters.map(id => [id, { ...PARAMETERS[id], currentValue: this.getParameter(id) }])); }
  connect(destination) { this.output.connect(destination); }
  disconnect(destination) { if (destination) this.output.disconnect(destination); else this.output.disconnect(); }
  setEnabled(enabled) { this.store.setParameter(this.enabledParameter, enabled); }
  setParameter(id, value) { if (id in this.parameters) this.store.setParameter(id, value); }
  getParameter(id) { return this.store.state.parameters[id]; }
  getState() { return { id: this.id, type: this.type, enabled: this.enabled, parameters: Object.fromEntries(Object.keys(this.parameters).map(id => [id, this.getParameter(id)])) }; }
  restoreState(state) { this.store.setParameters(Object.fromEntries(Object.keys(this.parameters).filter(id => state?.parameters?.[id] !== undefined).map(id => [id, state.parameters[id]]))); if (typeof state?.enabled === 'boolean') this.setEnabled(state.enabled); }
  reset() { this.store.setParameters(Object.fromEntries(Object.keys(this.parameters).map(id => [id, PARAMETERS[id].default]))); }
  apply(parameters) {
    const settings = ADAPTERS[this.id].settings(parameters);
    const serialized = JSON.stringify(settings);
    if (serialized === this.applied) return;
    this.processor.update(settings); this.applied = serialized;
  }
  dispose() { if (!this.processor) return; this.processor.dispose?.(); disposeGraph(this.processor, this.context); this.processor = null; this.applied = null; }
}
export class ProcessingRegistry {
  constructor(context, store) {
    this.context = context; this.store = store; this.order = [...store.state.order];
    this.modules = new Map();
    try { for (const d of MODULES) this.modules.set(d.id, new ProcessingModule(d, context, store)); }
    catch (error) { for (const module of this.modules.values()) module.dispose(); throw error; }
    this.edges = [];
  }
  get(id) { return this.modules.get(id); }
  apply(parameters) { for (const module of this.modules.values()) module.apply(parameters); }
  applyModulation(normalizedValues = {}) {
    const patches = new Map();
    for (const [target, normalized] of Object.entries(normalizedValues)) {
      const descriptor = FALLBACK_TARGETS[target];
      const parameter = PARAMETERS[target];
      if (!descriptor || !parameter || !Number.isFinite(normalized)) continue;
      const key = `${descriptor.module}:${descriptor.method || 'update'}`;
      if (!patches.has(key)) patches.set(key, { descriptor, values: {} });
      patches.get(key).values[descriptor.setting] = fromNormalized(parameter, normalized);
    }
    for (const { descriptor, values } of patches.values()) this.get(descriptor.module)?.processor?.[descriptor.method || 'update']?.(values);
  }
  connect(input, output) {
    this.input = input; this.output = output;
    let previous = input;
    for (const id of this.order) { const module = this.get(id); previous.connect(module.input); this.edges.push([previous, module.input]); previous = module.output; }
    previous.connect(output); this.edges.push([previous, output]);
  }
  rewire(order) {
    const next = sanitizeOrder(order);
    if (next.join() === this.order.join()) return;
    this.disconnect();
    this.order = next;
    this.connect(this.input, this.output);
  }
  disconnect() {
    for (const [source, destination] of this.edges) { try { source.disconnect(destination); } catch {} }
    this.edges = [];
  }
  dispose() { this.disconnect(); for (const module of this.modules.values()) module.dispose(); this.modules.clear(); }
}
