// Canonical parameter domains. UI, snapshots and control sources share these definitions.
const definitions = [];
const number = (id, module, displayName, min, max, value, unit = '', extra = {}) =>
  definitions.push({ id, module, displayName, type: 'number', min, max, default: value, unit, scaling: 'linear', morphable: true, modulatable: false, smoothing: 0.025, control: id, ...extra });
const toggle = (id, module, value, extra = {}) =>
  definitions.push({ id, module, displayName: id, type: 'boolean', default: value, morphable: true, modulatable: false, control: id, ...extra });
const choice = (id, module, values, value, extra = {}) =>
  definitions.push({ id, module, displayName: id, type: 'enum', values, default: value, morphable: true, modulatable: false, control: id, ...extra });

number('inputGain', 'input', 'Input Gain', -24, 12, 0, 'dB');
number('outputGain', 'output', 'Output Gain', -24, 6, -6, 'dB');
toggle('outputMute', 'output', false, { control: 'mute' });
toggle('bypass', 'mix', false);
number('dryWet', 'mix', 'Dry / Wet', 0, 1, 1, '%', { uiScale: 100, modulatable: true });
number('wetGain', 'mix', 'Wet Gain', -24, 12, 0, 'dB', { modulatable: true });
toggle('autoGain', 'mix', false);
toggle('freezeEnabled', 'freeze', false);
choice('freezeMode', 'freeze', ['free', 'sync'], 'free');
number('freezeFreeLength', 'freeze', 'Length', 0, 20, .25, 's', { uiScale: 1000 });
choice('freezeSyncLength', 'freeze', ['quarter', 'half', 'beat', '2beats', '1bar', '2bars', '4bars', '8bars'], '1bar');
choice('freezeBpmMode', 'freeze', ['auto', 'manual'], 'auto');
number('freezeManualBpm', 'freeze', 'Manual BPM', 40, 240, 120, 'BPM', { morphable: false, controlEvent: 'change' });
toggle('freezeTempoLocked', 'freeze', false, { control: null });
number('freezeLockedBpm', 'freeze', 'Locked BPM', 40, 240, 120, 'BPM', { morphable: false, control: null });
choice('freezeStartQuantize', 'freeze', ['auto', '1/32', '1/16', '1/8', '1/4', '1/2', 'beat', '2beats', '1bar', '2bars', '4bars'], 'auto');
choice('freezeReleaseQuantize', 'freeze', ['off', 'beat', 'bar'], 'off');
toggle('gateEnabled', 'gate', false);
choice('gateMode', 'gate', ['gate', 'expander'], 'gate');
number('gateThreshold', 'gate', 'Threshold', -80, 0, -45, 'dB', { modulatable: true });
number('gateRange', 'gate', 'Range', 0, 60, 48, 'dB', { modulatable: true });
number('gateAttack', 'gate', 'Attack', 1, 100, 5, 'ms', { modulatable: true });
number('gateRelease', 'gate', 'Release', 20, 1000, 120, 'ms', { modulatable: true });
toggle('transientEnabled', 'transient', false);
number('transientAttack', 'transient', 'Attack', -100, 100, 0, '%', { modulatable: true });
number('transientSustain', 'transient', 'Sustain', -100, 100, 0, '%', { modulatable: true });
toggle('driveEnabled', 'drive', true);
choice('driveCharacter', 'drive', ['clean', 'saturation', 'enhancement', 'midDrive', 'crunch', 'classicDistortion', 'roundFuzz', 'highGain'], 'saturation');
number('driveAmount', 'drive', 'Drive Amount', 0, 1, .32, '%', { uiScale: 100, modulatable: true });
number('driveTone', 'drive', 'Tone', -1, 1, 0, '%', { uiScale: 100, modulatable: true });
number('driveBias', 'drive', 'Bias / Symmetry', -1, 1, 0, '%', { uiScale: 100, modulatable: true });
number('driveShape', 'drive', 'Character / Shape', 0, 1, .35, '%', { uiScale: 100, modulatable: true });
toggle('wavefolderEnabled', 'wavefolder', false);
number('wavefolderFold', 'wavefolder', 'Fold', 0, 100, 25, '%', { modulatable: true });
number('wavefolderBias', 'wavefolder', 'Bias', -100, 100, 0, '%', { modulatable: true });
number('wavefolderOutput', 'wavefolder', 'Output', -12, 6, 0, 'dB', { modulatable: true });
toggle('crusherEnabled', 'crusher', false);
toggle('bitEnabled', 'crusher', true);
toggle('rateEnabled', 'crusher', true);
number('bitDepth', 'crusher', 'Bit Depth', 2, 16, 8, 'bit', { integer: true, modulatable: true });
number('rateReduction', 'crusher', 'Reduction', 0, .95, .35, '', { modulatable: true });
toggle('filterEnabled', 'filter', true);
choice('filterType', 'filter', ['lowpass', 'highpass', 'bandpass', 'notch', 'peak', 'allpass', 'feedforwardComb', 'feedbackComb', 'formant'], 'lowpass');
number('cutoff', 'filter', 'Frequency / Position', 20, 20000, 20000, 'Hz', { scaling: 'log', uiLog: 1000, modulatable: true });
number('resonance', 'filter', 'Resonance / Q / Feedback', .1, 12, .7, '', { modulatable: true });
number('filterPeakGain', 'filter', 'Peak Gain', -12, 12, 0, 'dB', { modulatable: true });
toggle('eqEnabled', 'eq', true);
choice('eqType', 'eq', ['shelf2', 'tone3', 'tilt', 'graphic5'], 'tone3');
for (const band of ['Low', 'Mid', 'High']) number('eq' + band, 'eq', band, -12, 12, 0, 'dB', { modulatable: true });
number('eqTilt', 'eq', 'Tilt', -6, 6, 0, 'dB', { modulatable: true });
for (let i = 0; i < 5; i++) number('eqGraphic' + i, 'eq', ['80 Hz', '250 Hz', '800 Hz', '2.5 kHz', '8 kHz'][i], -12, 12, 0, 'dB', { modulatable: true });
toggle('compressorEnabled', 'compressor', false);
number('compressorThreshold', 'compressor', 'Threshold', -60, 0, -18, 'dB', { modulatable: true });
number('compressorRatio', 'compressor', 'Ratio', 1, 20, 4, ':1', { modulatable: true });
number('compressorAttack', 'compressor', 'Attack', 1, 100, 10, 'ms', { modulatable: true });
number('compressorRelease', 'compressor', 'Release', 20, 1000, 120, 'ms', { modulatable: true });
number('compressorMakeup', 'compressor', 'Makeup', -12, 12, 0, 'dB', { modulatable: true });
toggle('widthEnabled', 'width', false);
number('width', 'width', 'Stereo Width', 0, 200, 100, '%', { modulatable: true });
toggle('clipperEnabled', 'clipper', false);
choice('clipperMode', 'clipper', ['softclip', 'limiter'], 'softclip');
number('clipperThreshold', 'clipper', 'Threshold', -24, 0, -3, 'dB', { modulatable: true });
number('clipperAmount', 'clipper', 'Amount', 0, 1, .25, '%', { modulatable: true });
number('clipperCeiling', 'clipper', 'Ceiling', -12, -.1, -1, 'dBFS', { modulatable: true });
number('clipperRelease', 'clipper', 'Release', 20, 1000, 100, 'ms', { modulatable: true });

export const PARAMETERS = Object.freeze(Object.fromEntries(definitions.map(p => [p.id, Object.freeze(p)])));
export const MODULES = Object.freeze([
  ['freeze', 'Freeze'], ['gate', 'Noise Gate / Expander'], ['transient', 'Transient Shaper'],
  ['drive', 'Drive'], ['wavefolder', 'Wavefolder'], ['crusher', 'Bitcrusher / Sample Rate Reduction'],
  ['filter', 'Filter'], ['eq', 'EQ'], ['compressor', 'Compressor Light'], ['width', 'Stereo Width'], ['clipper', 'Soft Clipper / Limiter']
].map(([id, displayName]) => Object.freeze({ id, type: id, displayName, enabledParameter: id + 'Enabled', parameters: definitions.filter(p => p.module === id).map(p => p.id) })));
export const DEFAULT_ORDER = Object.freeze(MODULES.map(m => m.id));
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const defaults = () => Object.fromEntries(definitions.map(p => [p.id, p.default]));
export function sanitizeParameter(id, value) {
  const p = PARAMETERS[id];
  if (!Object.hasOwn(PARAMETERS, id)) return undefined;
  if (p.type === 'boolean') return value === true || value === 'true';
  if (p.type === 'enum') return p.values.includes(value) ? value : p.default;
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return p.default;
  const result = clamp(Number(value), p.min, p.max);
  return p.integer ? Math.round(result) : result;
}
export function sanitizeParameters(values = {}) {
  return Object.fromEntries(definitions.map(p => [p.id, sanitizeParameter(p.id, values?.[p.id] ?? p.default)]));
}
export function sanitizeOrder(order) {
  const known = [...new Set(Array.isArray(order) ? order.filter(id => DEFAULT_ORDER.includes(id)) : [])];
  return [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))];
}
export function toNormalized(p, value) {
  return p.scaling === 'log' ? Math.log(value / p.min) / Math.log(p.max / p.min) : (value - p.min) / (p.max - p.min);
}
export function fromNormalized(p, value) {
  const t = clamp(value, 0, 1);
  return p.scaling === 'log' ? p.min * (p.max / p.min) ** t : p.min + t * (p.max - p.min);
}
export function fromControl(p, control) {
  if (p.type === 'boolean') return control.type === 'checkbox' ? control.checked : control.getAttribute('aria-pressed') !== 'true';
  if (p.uiLog) return fromNormalized(p, Number(control.value) / p.uiLog);
  return p.type === 'number' ? Number(control.value) / (p.uiScale || 1) : control.value;
}
export function toControl(p, value) {
  if (p.uiLog) return toNormalized(p, value) * p.uiLog;
  return p.type === 'number' ? value * (p.uiScale || 1) : value;
}
export function viewSettings(parameters) {
  return { ...parameters, inputMute: false, driveBypass: !parameters.driveEnabled, filterBypass: !parameters.filterEnabled, eqBypass: !parameters.eqEnabled,
    filterPosition: toNormalized(PARAMETERS.cutoff, parameters.cutoff),
    eqGraphic: Array.from({ length: 5 }, (_, i) => parameters['eqGraphic' + i]) };
}
