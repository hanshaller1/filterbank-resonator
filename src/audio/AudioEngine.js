import { resolveMacroParameters } from '../control/macros.js';
import { ModulationEngine } from './ModulationEngine.js';
import { Metering } from './Metering.js';
import { AutoGainProcessor } from './AutoGainProcessor.js';
import { ProcessingRegistry, disposeGraph } from './ProcessingRegistry.js';
import { AppState } from '../state/AppState.js';
import { RoutingController } from './RoutingController.js';
import { FreezeProcessor } from './FreezeProcessor.js';
import { RealtimeProcessor } from './RealtimeProcessors.js';

const dbToGain = db => 10 ** (db / 20);
const MODULE_TAPS = { freeze: 'postFreeze', gate: 'postGate', transient: 'postTransient', drive: 'postDrive', wavefolder: 'postWavefolder', crusher: 'postCrusher', filter: 'postFilter', eq: 'postEq', compressor: 'postCompressor', width: 'postWidth', clipper: 'postClipper' };
export class AudioEngine {
  constructor(deviceManager, store = new AppState()) {
    this.deviceManager = deviceManager; this.store = store;
    this.context = null; this.nodes = null; this.active = false; this.generation = 0;
    this.unsubscribe = store.subscribe((state, reason) => { if (reason !== 'ui' && reason !== 'snapshot') this.applyState(); });
    this.onRoutingChange = () => {}; this.onInputEnded = () => {};
    this.onModulationVisuals = () => {};
  }
  async start(inputDeviceId, outputDeviceId) {
    const generation = ++this.generation;
    try {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    if (generation !== this.generation) return false;
    await Promise.all([ModulationEngine.prepare(this.context), FreezeProcessor.prepare(this.context), RealtimeProcessor.prepare(this.context)]);
    if (generation !== this.generation) return false;
    await this.setOutputDevice(outputDeviceId);
    if (generation !== this.generation) return false;
    const stream = await this.deviceManager.openInput(inputDeviceId);
    if (!stream) return false;
    if (generation !== this.generation) { stream.getTracks?.().forEach(t => t.stop()); return false; }
    this.disconnectNodes();
    this.streamEvents = new AbortController();
    for (const track of stream.getTracks?.() || []) track.addEventListener?.('ended', () => { if (generation === this.generation) { this.stop(); this.onInputEnded(); } }, { signal: this.streamEvents.signal });
    const context = this.context;
    this.nodes = {};
    const source = this.nodes.source = context.createMediaStreamSource(stream);
    const inputGain = this.nodes.inputGain = context.createGain();
    const dryGain = this.nodes.dryGain = context.createGain();
    const wetGain = this.nodes.wetGain = context.createGain();
    const processingOutput = this.nodes.processingOutput = context.createGain();
    const autoGain = this.nodes.autoGain = new AutoGainProcessor(context);
    const registry = this.nodes.registry = new ProcessingRegistry(context, this.store);
    const routing = this.nodes.routing = new RoutingController(context, registry, processingOutput);
    routing.onChange = () => this.onRoutingChange();
    const mix = this.nodes.mix = context.createGain();
    const outputGain = this.nodes.outputGain = context.createGain();
    const limiter = this.nodes.limiter = context.createDynamicsCompressor();
    const metering = this.nodes.metering = new Metering(context);
    limiter.threshold.value = -3; limiter.knee.value = 12; limiter.ratio.value = 12;
    limiter.attack.value = .003; limiter.release.value = .1;
    source.connect(inputGain);
    // Keep the tempo tap on the raw stream source; routing rebuilds may disconnect inputGain edges.
    registry.get('freeze').processor.connectTempoSource(source);
    metering.connectTap('input', inputGain);
    inputGain.connect(dryGain);
    registry.connect(inputGain, processingOutput);
    const tapModules = Object.fromEntries(Object.entries(MODULE_TAPS).map(([module, tap]) => [tap, module]));
    for (const [name, id] of Object.entries(tapModules)) metering.connectTap(name, registry.get(id).output);
    processingOutput.connect(wetGain);
    autoGain.setAnalysisSources(inputGain, processingOutput);
    wetGain.connect(autoGain.input);
    dryGain.connect(mix); autoGain.connect(mix);
    mix.connect(outputGain); outputGain.connect(limiter);
    mix.connect(metering.taps.postMix.analyser);
    limiter.connect(metering.outputAnalyser); metering.outputAnalyser.connect(context.destination);
    this.nodes = { source, inputGain, dryGain, wetGain, processingOutput, autoGain, registry, mix, outputGain, limiter, metering };
    this.modulation = new ModulationEngine(
      context,
      this.nodes,
      value => this.onModulationVisuals(value),
      values => this.nodes?.registry.applyModulation(values)
    );
    this.routing = routing;
    this.appliedMaster = {};
    this.applyState();
    this.active = true;
    return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop(); throw error;
    }
  }
  async setOutputDevice(deviceId) {
    if (!this.context || !('setSinkId' in this.context)) return false;
    await this.context.setSinkId(deviceId || ''); return true;
  }
  applyState() {
    if (!this.nodes) return;
    const p = resolveMacroParameters(this.store.state.parameters, this.store.state.macros);
    this.nodes.registry.apply(p);
    this.routing.request(this.store.state.order);
    this.applyMaster(p);
    this.modulation.apply(p, this.store.state.modulation);
  }
  applyMaster(p) {
    const n = this.nodes, now = this.context.currentTime;
    const values = { inputGain: dbToGain(p.inputGain), outputGain: dbToGain(p.outputGain), dryGain: p.bypass ? 1 : 1 - p.dryWet,
      wetGain: p.bypass ? 0 : p.dryWet * dbToGain(p.wetGain) };
    for (const [id, value] of Object.entries(values)) if (this.appliedMaster[id] !== value) {
      n[id].gain.setTargetAtTime(value, now, .02); this.appliedMaster[id] = value;
    }
    if (this.appliedMaster.autoGain !== p.autoGain) { n.autoGain.update({ enabled: p.autoGain }); this.appliedMaster.autoGain = p.autoGain; }
  }
  update(parameters) { this.store.setParameters(parameters); }
  getLevels() { return this.nodes?.metering.readLevels() || { input: 0, output: 0 }; }
  getAnalyzerSources() { return this.nodes?.metering.sourceNames() || ['input', 'output']; }
  getAnalysis(sources = ['output']) { return this.nodes?.metering.readAnalysis(sources) || null; }
  getTransferCurve() { return this.nodes?.registry.get('drive').processor.getTransferCurve() || null; }
  updateAutoGain() { return this.nodes?.autoGain.updateAnalysis() || 0; }
  updateDetectors() { this.nodes?.registry.get('gate').processor.updateAnalysis(); const info = this.nodes?.registry.get('freeze').processor.updateTempoAnalysis() || { bpm: 120, locked: false, status: 'Detecting…' }; this.modulation?.setTempo(info); return info; }
  getClipperActivity() { return this.nodes?.registry.get('clipper').processor.getActivity() || 0; }
  getGainReduction() {
    const registry = this.nodes?.registry;
    if (!registry) return { compressor: 0, limiter: 0 };
    return {
      compressor: Math.max(0, -(registry.get('compressor').processor.getReduction() || 0)),
      limiter: Math.max(0, -(registry.get('clipper').processor.getReduction() || 0))
    };
  }
  getModuleVisuals() {
    const registry = this.nodes?.registry, metering = this.nodes?.metering;
    if (!registry || !metering) return null;
    const inputTap = id => { const index = registry.order.indexOf(id); return index > 0 ? MODULE_TAPS[registry.order[index - 1]] : 'input'; };
    const taps = ['postTransient', 'postCompressor', 'postClipper', inputTap('transient'), inputTap('compressor'), inputTap('clipper')];
    const peaks = metering.readPeaks(taps), dynamics = this.getGainReduction();
    return {
      wavefolder: registry.get('wavefolder').processor.getTransferCurve(),
      transient: { input: peaks[inputTap('transient')] || 0, output: peaks.postTransient || 0 },
      compressor: { input: peaks[inputTap('compressor')] || 0, output: peaks.postCompressor || 0, reduction: dynamics.compressor },
      clipper: { input: peaks[inputTap('clipper')] || 0, output: peaks.postClipper || 0, ...registry.get('clipper').processor.getMetrics() }
    };
  }
  stop() { ++this.generation; this.deviceManager.closeInput(); this.disconnectNodes(); this.active = false; }
  disconnectNodes() {
    this.streamEvents?.abort();
    if (!this.nodes) return;
    this.modulation?.dispose(); this.modulation = null;
    this.routing?.dispose(); this.routing = null;
    this.nodes.registry?.dispose();
    this.nodes.autoGain?.dispose();
    this.nodes.metering?.disconnect();
    disposeGraph(this.nodes, this.context);
    this.nodes = null;
  }
  dispose() { this.stop(); this.unsubscribe(); this.context?.close(); }
}
