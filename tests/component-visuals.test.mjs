import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Context, deviceMock } from './audio-mock.mjs';
import { StereoWidthProcessor, wavefolderTransferCurve } from '../src/audio/AdditionalProcessors.js';
import { RealtimeKernel, clipperTransfer } from '../src/audio/RealtimeKernel.js';
import { ClipperLimiterProcessor } from '../src/audio/RealtimeProcessors.js';
import { ClipperVisualization } from '../src/ui/ModuleVisualizations.js';
import { PARAMETERS, fromControl, toControl } from '../src/state/parameters.js';
import { AppState } from '../src/state/AppState.js';
import { AudioEngine } from '../src/audio/AudioEngine.js';
globalThis.AudioContext = Context;

test('Wavefolder visualization curve follows the DSP fold, bias and output domains', () => {
  const neutral = wavefolderTransferCurve({ fold: 0, bias: 0, output: 0 }, 33);
  const folded = wavefolderTransferCurve({ fold: 80, bias: 0, output: 0 }, 33);
  const biased = wavefolderTransferCurve({ fold: 80, bias: 60, output: -6 }, 33);
  assert.ok(neutral.every(([input, output]) => Math.abs(input - output) < 1e-12));
  assert.notDeepEqual(folded, neutral);
  assert.notDeepEqual(biased, folded);
});

test('Clipper transfer helper follows soft-clip amount, threshold and limiter ceiling', () => {
  const input = .9;
  assert.notEqual(
    clipperTransfer(input, { mode: 'softclip', threshold: -18, amount: 1, ceiling: -.1 }),
    clipperTransfer(input, { mode: 'softclip', threshold: -1, amount: 1, ceiling: -.1 })
  );
  const limited = clipperTransfer(2, { mode: 'limiter', threshold: -3, ceiling: -6 });
  assert.ok(Math.abs(limited - 10 ** (-6 / 20)) < 1e-12);
});

test('Mono Bass filters only the Side path and restores the original path when disabled', () => {
  const processor = new StereoWidthProcessor(new Context());
  processor.update({ enabled: true, width: 150, monoBass: true, monoBassFrequency: 180 });
  assert.equal(processor.sideDirect.gain.value, 0);
  assert.equal(processor.sideFiltered.gain.value, 1);
  assert.equal(processor.sideHighpass.type, 'highpass');
  assert.equal(processor.sideHighpass.frequency.value, 180);
  assert.equal(processor.sideOutL.gain.value, 1.5);
  assert.equal(processor.sideOutR.gain.value, -1.5);
  processor.update({ monoBass: false });
  assert.equal(processor.sideDirect.gain.value, 1);
  assert.equal(processor.sideFiltered.gain.value, 0);
  assert.equal(PARAMETERS.widthMonoBassFrequency.min, 40);
  assert.equal(PARAMETERS.widthMonoBassFrequency.max, 300);
  assert.equal(PARAMETERS.widthMonoBassFrequency.default, 120);
});

test('Module visuals reuse semantic taps and actual DSP gain reduction without new nodes', async () => {
  const state = new AppState();
  state.setParameters({ compressorEnabled: true, clipperEnabled: true, clipperMode: 'limiter' });
  const engine = new AudioEngine(deviceMock(), state);
  await engine.start('', '');
  const { registry, metering } = engine.nodes, nodeCount = engine.context.nodes.length;
  metering.taps.postGate.analyser.level = .4;
  metering.taps.postTransient.analyser.level = .5;
  metering.taps.postEq.analyser.level = .6;
  metering.taps.postCompressor.analyser.level = .3;
  metering.taps.postWidth.analyser.level = .8;
  metering.taps.postClipper.analyser.level = .45;
  registry.get('compressor').processor.compressor.reduction = -7;
  registry.get('clipper').processor.metrics = { limiterReduction: 4, softClipActivity: 0 };
  const visuals = engine.getModuleVisuals();
  assert.deepEqual(visuals.transient, { input: .4000000059604645, output: .5 });
  assert.equal(visuals.compressor.reduction, 7);
  assert.equal(visuals.clipper.limiterReduction, 4);
  assert.equal(visuals.clipper.softClipActivity, 0);
  assert.equal(engine.context.nodes.length, nodeCount);
  engine.dispose();
});

test('Limiter telemetry follows real DSP gain reduction while Soft Clip stays separate', () => {
  const process = ({ mode, threshold, ceiling = -1, amount = 1, input = .5 }) => {
    const kernel = new RealtimeKernel(48000, 'clipper');
    const source = [new Float32Array(4096).fill(input), new Float32Array(4096).fill(-input)];
    const output = [new Float32Array(4096), new Float32Array(4096)];
    const values = { enabled: 1, mode, threshold, ceiling, amount, release: 100 };
    const parameters = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, new Float32Array([value])]));
    kernel.process(source, output, parameters);
    return { kernel, output };
  };
  const high = process({ mode: 1, threshold: -3 });
  const low = process({ mode: 1, threshold: -18 });
  assert.ok(low.kernel.limiterReduction > high.kernel.limiterReduction + 8);
  assert.ok(Math.abs(low.output[0].at(-1)) < Math.abs(high.output[0].at(-1)));
  assert.equal(low.kernel.softClipActivity, 0);
  const soft = process({ mode: 0, threshold: -18 });
  assert.equal(soft.kernel.limiterReduction, 0);
  assert.ok(soft.kernel.softClipActivity > 0);
  assert.ok(soft.kernel.softClipActivity > process({ mode: 0, threshold: -6 }).kernel.softClipActivity);
  assert.ok(soft.kernel.softClipActivity > process({ mode: 0, threshold: -18, amount: .2 }).kernel.softClipActivity);
  assert.ok(process({ mode: 0, threshold: -18, input: .8 }).kernel.softClipActivity > process({ mode: 0, threshold: -18, input: .2 }).kernel.softClipActivity);

  const processor = new ClipperLimiterProcessor(new Context());
  processor.update({ enabled: true, mode: 'limiter' });
  processor.input.port.onmessage({ data: { type: 'clipper-metrics', limiterReduction: 9, softClipActivity: 3 } });
  assert.equal(processor.getActivity(), 9);
  assert.equal(processor.getReduction(), -9);
  processor.update({ mode: 'softclip' });
  processor.input.port.onmessage({ data: { type: 'clipper-metrics', limiterReduction: 0, softClipActivity: 3 } });
  assert.equal(processor.getActivity(), 3);
  assert.equal(processor.getReduction(), 0);
  processor.dispose();
});

test('Soft Clip visualization keeps a real DSP activity history separate from Limiter GR', () => {
  const visual = Object.create(ClipperVisualization.prototype);
  Object.assign(visual, { settings: { clipperMode: 'softclip' }, reduction: [], activity: [], mode: null, output: { value: '' }, begin: () => null });
  visual.render({ input: .5, output: .4, limiterReduction: 11, softClipActivity: 2.5 }, true);
  visual.render({ input: .5, output: .3, limiterReduction: 9, softClipActivity: 4 }, true);
  assert.deepEqual(visual.activity, [2.5, 4]);
  assert.deepEqual(visual.reduction, []);
  assert.match(visual.output.value, /Clip 4\.0 dB/);
});

test('Removed local controls are absent while parent Modulation collapse remains', () => {
  const html = readFileSync('index.html', 'utf8');
  const modulation = readFileSync('src/ui/ModulationPanelV2.js', 'utf8');
  assert.doesNotMatch(html, /id="mute"/);
  assert.doesNotMatch(html, />Set Beat 1<\/button>/);
  assert.match(html, /id="freezeSetBeat1"[^>]*>Set Beat<\/button>/);
  assert.doesNotMatch(modulation, /data-collapse-section="\$\{id\}"/);
  assert.match(html, /data-collapse-section="modulation"/);
});

test('Stereo Width controls use the requested desktop order and dedicated three-column layout', () => {
  const html = readFileSync('index.html', 'utf8');
  const widthSection = html.slice(html.indexOf('data-collapsible="width"'), html.indexOf('data-collapsible="clipper"'));
  assert.ok(widthSection.indexOf('>Width <') < widthSection.indexOf('>Crossover <'));
  assert.ok(widthSection.indexOf('>Crossover <') < widthSection.indexOf('>Mono Bass</span>'));
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.width-controls\s*\{[^}]*grid-template-columns:repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:700px\)\s*\{\s*\.width-controls\s*\{\s*grid-template-columns:1fr/);
});

test('Bit-depth control allocates more positions to the musical lo-fi range', () => {
  const parameter = PARAMETERS.bitDepth;
  const values = Array.from({ length: 13 }, (_, position) => fromControl(parameter, { type: 'range', value: position }));
  assert.deepEqual(values, [2, 3, 4, 5, 5.8, 6.5, 7.25, 8, 8.75, 9.5, 10.25, 11.5, 16]);
  assert.equal(toControl(parameter, 8), 7);
  assert.equal(toControl(parameter, 13), 11.333333333333334);
  assert.equal(toControl(parameter, 16), 12);
  assert.ok(toControl(parameter, 9) - toControl(parameter, 5) > toControl(parameter, 16) - toControl(parameter, 9));
});

test('Bitcrusher uses continuous bit-depth quantization and keeps sample-rate reduction independent', () => {
  const render = ({ bitDepth = 8, bitEnabled = 1, rateEnabled = 0, reduction = .35 } = {}) => {
    const kernel = new RealtimeKernel(48000, 'crusher');
    const input = [new Float32Array(48000).fill(.371), new Float32Array(48000).fill(-.371)];
    const output = [new Float32Array(48000), new Float32Array(48000)];
    const parameters = Object.fromEntries(Object.entries({ enabled: 1, bitEnabled, rateEnabled, bitDepth, reduction }).map(([id, value]) => [id, new Float32Array([value])]));
    kernel.process(input, output, parameters);
    return output;
  };
  const low = render({ bitDepth: 8 }).map(channel => channel.at(-1));
  const fractional = render({ bitDepth: 8.5 }).map(channel => channel.at(-1));
  const rounded = render({ bitDepth: 9 }).map(channel => channel.at(-1));
  assert.notDeepEqual(fractional, rounded);
  assert.notDeepEqual(fractional, low);
  const rateOnly8 = render({ bitDepth: 8, bitEnabled: 0, rateEnabled: 1 });
  const rateOnly16 = render({ bitDepth: 16, bitEnabled: 0, rateEnabled: 1 });
  assert.deepEqual(rateOnly8, rateOnly16);
  assert.notEqual(PARAMETERS.bitDepth.id, PARAMETERS.rateReduction.id);
  assert.equal(PARAMETERS.bitDepth.module, 'crusher');
  assert.equal(PARAMETERS.rateReduction.module, 'crusher');
  assert.equal(PARAMETERS.bitDepth.controlMap.at(-1), 16);
  assert.equal(PARAMETERS.rateReduction.default, .35);
});
