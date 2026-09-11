import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeKernel } from '../src/audio/RealtimeKernel.js';
import { FreezeEngine } from '../src/audio/freeze/FreezeEngine.js';
import { FreezeSyncController } from '../src/audio/freeze/FreezeSyncController.js';
import { AppState } from '../src/state/AppState.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';
import { Context, deviceMock } from './audio-mock.mjs';
import { Metering } from '../src/audio/Metering.js';
import { AutoGainKernel } from '../src/audio/AutoGainKernel.js';
import { encodePreset, decodePreset } from '../src/state/schema.js';
import { ModulationPanelV2 } from '../src/ui/ModulationPanelV2.js';
import { SectionCollapseController } from '../src/ui/SectionCollapseController.js';
import { eqResponseAt } from '../src/ui/EQResponseVisualization.js';
import { filterResponseAt } from '../src/ui/FilterResponseVisualization.js';
import { normalizeModulation } from '../src/control/modulation.js';
import { WavefolderProcessor } from '../src/audio/AdditionalProcessors.js';
globalThis.AudioContext = Context;
const run = (kind, settings, value = .2, frames = 48000) => {
  const kernel = new RealtimeKernel(48000, kind);
  const parameters = Object.fromEntries(Object.entries({ enabled: 1, threshold: -30, range: 48, mode: 0, attack: 5, sustain: 0, release: 100, bitEnabled: 1, rateEnabled: 1, bitDepth: 8, reduction: .35, amount: .5, ceiling: -1, ...settings }).map(([id, v]) => [id, new Float32Array([v])]));
  const input = [new Float32Array(frames).fill(value), new Float32Array(frames).fill(-value)], output = [new Float32Array(frames), new Float32Array(frames)];
  kernel.process(input, output, parameters); return { kernel, input, output, parameters };
};
test('Realtime modules bypass transparently; neutral Transient and Crusher preserve stereo', () => {
  for (const kind of ['gate','transient','crusher','clipper']) {
    const { input, output } = run(kind, { enabled: 0 }); assert.deepEqual(output, input);
  }
  for (const [kind, settings] of [['transient', { attack: 0, sustain: 0 }], ['crusher', { bitEnabled: 0, rateEnabled: 0 }]]) {
    const { input, output } = run(kind, settings); assert.deepEqual(output, input);
  }
});
test('Gate range, release and open attack are sample-clocked and stereo-linked', () => {
  const { kernel, parameters, output } = run('gate', {}, .001);
  assert.ok(Math.abs(output[0].at(-1)) < .00001);
  const input = [new Float32Array(4800).fill(.5), new Float32Array(4800).fill(-.25)], out = [new Float32Array(4800), new Float32Array(4800)];
  kernel.process(input, out, parameters);
  assert.ok(out[0][0] < .01); assert.ok(out[0].at(-1) > .49);
  for (let i = 0; i < 4800; i++) assert.ok(Math.abs(out[0][i] + 2 * out[1][i]) < 1e-7);
});
test('Transient Attack responds to onset, not frequency EQ, and returns toward unity', () => {
  const r = run('transient', { attack: 100 }, 0);
  const input = [new Float32Array(48000).fill(.2), new Float32Array(48000).fill(-.2)], out = [new Float32Array(48000), new Float32Array(48000)];
  r.kernel.process(input, out, r.parameters);
  assert.ok(Math.max(...out[0].slice(0,4800)) > .24); assert.ok(Math.abs(out[0].at(-1) - .2) < .001);
});
test('Softclip threshold works, zero amount is neutral below ceiling, limiter bounds peaks', () => {
  const neutral = run('clipper', { amount: 0 }, .2); assert.deepEqual(neutral.output, neutral.input);
  const low = run('clipper', { threshold: -18, amount: 1 }, .8), high = run('clipper', { threshold: -1, amount: 1 }, .8);
  assert.ok(low.output[0].at(-1) < high.output[0].at(-1));
  const limited = run('clipper', { mode: 1, threshold: -6, ceiling: -3 }, 4);
  assert.ok(limited.output[0].slice(2000).every(v => v <= 10 ** (-3/20) + 1e-6));
  assert.ok(limited.kernel.reduction > 12);
});
test('Free freeze uses the same sample-clocked history and recaptures only on length or trigger changes', () => {
  const engine = new FreezeEngine(1000), controller = new FreezeSyncController(1000, engine), l = new Float32Array(1), r = new Float32Array(1);
  for (let f=0;f<1000;f++) engine.processSample(f,.25,-.5,l,r,0);
  controller.configure({ mode:'free', frozen:true, freeLength:.25 },1000); controller.tick(1000);
  assert.equal(engine.active.duration,250);
  for(let f=1000;f<1200;f++) { controller.tick(f); engine.processSample(f,.8,.8,l,r,0); }
  assert.equal(l[0],.25); assert.equal(r[0],-.5);
  controller.configure({ mode:'free', frozen:true, freeLength:.25 },1200); assert.equal(engine.captures,1);
  controller.configure({ freeLength:0 },1200); controller.tick(1200); assert.equal(engine.active.duration,5);
  controller.configure({ frozen:false },1201); assert.equal(engine.targetMix,0); engine.dispose();
});
test('Removing fallback assignments restores the base and rejects stale worklet values', async () => {
  const store = new AppState(), engine = new AudioEngine(deviceMock(),store); await engine.start('','');
  store.setModulation({ assignments:[{ id:'bias', source:'lfo1', target:'driveBias', amount:1 }] });
  const mod = engine.modulation, revision = mod.revision;
  mod.node.port.onmessage({ data:{ type:'visuals', revision, value:{ fallbackValues:{ driveBias:1 } } } });
  assert.equal(engine.nodes.registry.get('drive').processor.settings.bias,1);
  store.deleteAssignment('bias'); assert.equal(engine.nodes.registry.get('drive').processor.settings.bias,0);
  mod.node.port.onmessage({ data:{ type:'visuals', revision, value:{ fallbackValues:{ driveBias:1 } } } });
  assert.equal(engine.nodes.registry.get('drive').processor.settings.bias,0); engine.dispose();
});
test('Plain level metering performs no frequency-data reads', () => {
  const metering = new Metering(new Context()); let count=0;
  for(const tap of Object.values(metering.taps)) tap.analyser.getFloatFrequencyData=()=>count++;
  metering.readLevels(); assert.equal(count,0); metering.readAnalysis(['postEq']); assert.equal(count,1);
});
test('AutoGain matches RMS slowly, caps correction and never amplifies silence', () => {
  const k=new AutoGainKernel(1000), output=[new Float32Array(10000),new Float32Array(10000)];
  const stereo=v=>[new Float32Array(10000).fill(v),new Float32Array(10000).fill(-v)];
  k.process([stereo(.2),stereo(.2),stereo(.1)],output,true);
  assert.ok(Math.abs(k.correctionDb-6.02)<.02); assert.ok(output[0][0]<.201); assert.ok(output[0].at(-1)>.399);
  k.process([stereo(.2),stereo(.2),stereo(.000001)],output,true);
  assert.ok(k.correctionDb<.1); assert.ok(k.gain<1.02);
  k.process([stereo(.2),stereo(.2),stereo(.1)],output,false);
  assert.ok(Math.abs(output[0].at(-1)-.2)<1e-6);
});
test('Preset restore and reset preserve local layout while portable presets omit it', () => {
  const store=new AppState(); store.setPerformance(true);
  const document=encodePreset(store.state); assert.equal(document.state.ui,undefined);
  store.restoreState(decodePreset(document),{preserveUi:true}); assert.equal(store.state.ui.performance,true);
  store.reset(); assert.equal(store.state.ui.performance,true);
  assert.equal(encodePreset(store.state,'Session',true).state.ui.performance,true);
});
test('Modulation header controls independently update each source', () => {
  const store=new AppState();
  for(const id of ['lfo1','lfo2','envelope1','envelope2']) {
    ModulationPanelV2.prototype.handleInput.call({store},{target:{type:'checkbox',checked:true,value:'on',dataset:{field:'enabled'},closest:selector=>selector==='[data-source]'?{dataset:{source:id}}:null}});
    assert.equal(store.state.modulation.sources[id].enabled,true);
    store.setSource(id,{enabled:false});
    assert.ok(Object.values(store.state.modulation.sources).every(s=>!s.enabled));
  }
});
test('Collapse-All and Processing-only operations keep independent nested layout entries', () => {
  const controller=Object.create(SectionCollapseController.prototype), calls=[];
  controller.layout={}; controller.persist=()=>{}; controller.apply=item=>calls.push(item.key);
  const item=(key,processing=false)=>({key,element:{matches:()=>processing}});
  controller.items=new Map([['processing',item('processing')],['drive',item('drive',true)],['lfo2',item('lfo2')],['presets',item('presets')]]);
  controller.setAll(false); assert.ok(Object.values(controller.layout).every(v=>v===false));
  controller.setProcessing(true); assert.equal(controller.layout.drive,true); assert.equal(controller.layout.presets,false); assert.equal(controller.layout.lfo2,false);
  controller.setItem(controller.items.get('processing'),true); assert.equal(controller.layout.drive,true);
});
test('Response curves use correct Tilt direction and actual allpass degree scale', () => {
  const s={eqType:'tilt',eqTilt:6,cutoff:1000,resonance:.707};
  assert.ok(eqResponseAt(100,s)<0); assert.ok(eqResponseAt(10000,s)>0);
  assert.ok(Math.abs(filterResponseAt('allpass',1000,s).value+180)<1e-6);
});
test('Actual realtime Worklet runs all processors and closes on disposal', async () => {
  globalThis.sampleRate=48000;
  globalThis.AudioWorkletProcessor=class { constructor(){ this.port={postMessage(){},close(){}}; } };
  globalThis.registerProcessor=()=>{};
  const {RealtimeWorklet}=await import('../src/audio/worklets/RealtimeWorklet.js');
  for(const kind of ['gate','transient','crusher','clipper']) {
    const w=new RealtimeWorklet({processorOptions:{kind}});
    const p=Object.fromEntries(RealtimeWorklet.parameterDescriptors.map(d=>[d.name,new Float32Array([d.defaultValue])]));
    const input=[[new Float32Array(128).fill(.2),new Float32Array(128).fill(-.4)]], output=[[new Float32Array(128),new Float32Array(128)]];
    for(let block=0;block<100;block++) assert.equal(w.process(input,output,p),true);
    assert.deepEqual(output[0],input[0]);
    w.port.onmessage({data:{type:'dispose'}}); assert.equal(w.process(input,output,p),false);
  }
});
test('Malformed inherited source names cannot create non-finite modulation', () => {
  const m=normalizeModulation({assignments:[{source:'toString',target:'cutoff',amount:1}]});
  assert.equal(m.assignments.length,0);
});
test('Wavefolder generates zero at silence and reuses the curve on output-only edits', () => {
  const processor=new WavefolderProcessor(new Context()); processor.update({fold:80,bias:70});
  const curve=processor.shaper.curve; assert.equal(curve[(curve.length-1)/2],0);
  processor.update({output:-6}); assert.equal(processor.shaper.curve,curve);
});
