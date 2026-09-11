import { PARAMETERS, fromNormalized } from '../state/parameters.js';
import { VOWELS } from './FormantFilterProcessor.js';

// These controls need a processor reconfiguration (for example a new wavefolder
// curve). They stay in the same central parameter registry as native AudioParams.
export const FALLBACK_TARGETS = Object.freeze({
  driveBias: { module: 'drive', setting: 'bias', method: 'updateTransfer' }, driveShape: { module: 'drive', setting: 'shape', method: 'updateTransfer' },
  wavefolderFold: { module: 'wavefolder', setting: 'fold' }, wavefolderBias: { module: 'wavefolder', setting: 'bias' }, wavefolderOutput: { module: 'wavefolder', setting: 'output' }
});

// Native parameter destinations and existing transfer mappings live in one adapter.
// The processor implementations themselves do not know about modulation.
export function parameterTargets(nodes, sampleRate) {
  const bindings = [], get = id => nodes.registry.get(id).processor;
  const add = (target, param, transform = v => v, extra = {}) => {
    const p = PARAMETERS[target];
    bindings.push({ target, param, table: Float32Array.from({ length: 2049 }, (_, i) => transform(fromNormalized(p, i / 2048))), ...extra });
  };
  const drive = get('drive');
  for (const [module, pairs] of Object.entries({ gate: [['gateThreshold', 'threshold'], ['gateRange', 'range'], ['gateAttack', 'attack'], ['gateRelease', 'release']], transient: [['transientAttack', 'attack'], ['transientSustain', 'sustain']], crusher: [['bitDepth', 'bitDepth'], ['rateReduction', 'reduction']], clipper: [['clipperThreshold', 'threshold'], ['clipperAmount', 'amount'], ['clipperCeiling', 'ceiling'], ['clipperRelease', 'release']] })) {
    for (const [target, name] of pairs) add(target, get(module).input.parameters.get(name));
  }
  for (const [character, path] of drive.paths) {
    const intensity = v => Math.max(0, Math.min(1, v)) ** 1.85;
    add('driveAmount', path.preGain.gain, v => 10 ** (path.profile.driveMaxDb * intensity(v) / 20));
    add('driveAmount', path.cleanGain.gain, v => Math.cos(intensity(v) * Math.PI * .5));
    add('driveAmount', path.shapedGain.gain, v => Math.sin(intensity(v) * Math.PI * .5));
    add('driveAmount', path.pathGain.gain, v => { const i = intensity(v); return 10 ** ((-path.profile.compensationMaxDb * i - 3.5 * Math.sin(Math.PI * i)) / 20); }, { character, smoothing: .04 });
    for (const name of ['preTone', 'postTone']) if (path[name]) add('driveAmount', path[name].gain, v => path.profile[name].gainDb(intensity(v)));
    add('driveTone', path.userTone.gain, v => v * 6, { smoothing: .03 });
  }
  for (const [type, { processor: f }] of get('filter').paths) {
    if (f.node) {
      add('cutoff', f.node.frequency, v => Math.min(v, sampleRate * .49), { smoothing: .015 });
      add('resonance', f.node.Q, v => v, { smoothing: .015 });
      if (type === 'peak') add('filterPeakGain', f.node.gain);
    } else if (f.delay) {
      add('cutoff', f.delay.delayTime, v => Math.max(.00015, Math.min(.05, 1 / v)));
      add('resonance', (f.feedbackGain || f.delayedGain).gain, v => .12 + v / 12 * (f.feedbackGain ? .72 : .62));
    } else {
      f.bands.forEach((band, index) => {
        const interpolate = (v, part) => {
          const t = Math.log(v / 20) / Math.log(1000) * 4, i = Math.min(3, Math.floor(t)), blend = t - i;
          return VOWELS[i].bands[index][part] * (1 - blend) + VOWELS[i + 1].bands[index][part] * blend;
        };
        add('cutoff', band.filter.frequency, v => interpolate(v, 0));
        add('cutoff', band.gain.gain, v => interpolate(v, 1) * .27);
        add('resonance', band.filter.Q, v => 1.2 + v / 12 * 10);
      });
    }
  }
  const paths = get('eq').paths;
  for (const type of ['shelf2', 'tone3']) {
    const filters = paths.get(type).filters;
    add('eqLow', filters[0].gain); add('eqHigh', filters.at(-1).gain);
    if (type === 'tone3') add('eqMid', filters[1].gain);
  }
  paths.get('tilt').filters.forEach((f, i) => add('eqTilt', f.gain, v => i ? v : -v));
  paths.get('graphic5').filters.forEach((f, i) => add('eqGraphic' + i, f.gain));
  const compressor = get('compressor');
  add('compressorThreshold', compressor.compressor.threshold, v => v, { smoothing: .02 });
  add('compressorRatio', compressor.compressor.ratio, v => v, { smoothing: .025 });
  add('compressorAttack', compressor.compressor.attack, v => v / 1000, { smoothing: .02 });
  add('compressorRelease', compressor.compressor.release, v => v / 1000, { smoothing: .03 });
  add('compressorMakeup', compressor.makeup.gain, v => 10 ** (v / 20), { smoothing: .03 });
  add('width', get('width').sideOutL.gain, v => v / 100);
  add('width', get('width').sideOutR.gain, v => -v / 100);
  bindings.push({ target: 'dryWet', targets: ['dryWet', 'wetGain'], param: nodes.dryGain.gain, kind: 'dryMix' });
  bindings.push({ target: 'wetGain', targets: ['dryWet', 'wetGain'], param: nodes.wetGain.gain, kind: 'wetMix' });
  return bindings;
}
