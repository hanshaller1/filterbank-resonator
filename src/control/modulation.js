import { PARAMETERS, clamp } from '../state/parameters.js';
export const SOURCE_DEFINITIONS = Object.freeze({
  lfo1: { id: 'lfo1', label: 'LFO 1', defaults: { enabled: false, waveform: 'sine', rate: 1, depth: 1, phase: 0, sync: 'free', beats: 1 } },
  lfo2: { id: 'lfo2', label: 'LFO 2', defaults: { enabled: false, waveform: 'sine', rate: 1, depth: 1, phase: 0, sync: 'free', beats: 1 } },
  envelope1: { id: 'envelope1', label: 'Envelope Follower 1', defaults: { enabled: false, attack: 10, release: 180, sensitivity: 0, threshold: -45 } },
  envelope2: { id: 'envelope2', label: 'Envelope Follower 2', defaults: { enabled: false, attack: 10, release: 180, sensitivity: 0, threshold: -45 } }
});
export const MODULATION_TARGETS = Object.values(PARAMETERS).filter(p => p.modulatable);
const finite = (v, fallback, min, max) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
export function normalizeModulation(raw) {
  const legacy = raw?.sources || {};
  const sourceValue = id => legacy[id] || (id === 'lfo1' ? legacy.lfo : id === 'envelope1' ? legacy.envelope : {}) || {};
  const normalizeLfo = id => {
    const value = sourceValue(id);
    return { ...SOURCE_DEFINITIONS[id].defaults, enabled: value.enabled === true,
      waveform: ['sine', 'triangle', 'saw', 'square', 'random'].includes(value.waveform) ? value.waveform : 'sine',
      rate: finite(value.rate, 1, .02, 20), depth: finite(value.depth, 1, 0, 1), phase: finite(value.phase, 0, 0, 360),
      sync: value.sync === 'tempo' ? 'tempo' : 'free', beats: [.25, .5, 1, 2, 4, 8].includes(value.beats) ? value.beats : 1 };
  };
  const normalizeEnvelope = id => {
    const value = sourceValue(id);
    return { ...SOURCE_DEFINITIONS[id].defaults, enabled: value.enabled === true,
      attack: finite(value.attack, 10, 1, 1000), release: finite(value.release, 180, 10, 3000),
      sensitivity: finite(value.sensitivity, 0, -24, 24), threshold: finite(value.threshold, -45, -80, 0) };
  };
  const sources = { lfo1: normalizeLfo('lfo1'), lfo2: normalizeLfo('lfo2'), envelope1: normalizeEnvelope('envelope1'), envelope2: normalizeEnvelope('envelope2') };
  const ids = new Set();
  const assignments = (Array.isArray(raw?.assignments) ? raw.assignments : []).slice(0, 64).map(a => ({ ...a, source: a?.source === 'lfo' ? 'lfo1' : a?.source === 'envelope' ? 'envelope1' : a?.source })).filter(a => a && Object.hasOwn(sources, a.source) && PARAMETERS[a.target]?.modulatable).map((a, i) => {
    let id = typeof a.id === 'string' && a.id.length < 100 ? a.id : 'assignment-' + i;
    if (ids.has(id)) id = 'assignment-' + i; ids.add(id);
    return { id, source: a.source, target: a.target, amount: finite(a.amount, .1, 0, 1), polarity: a.polarity === -1 ? -1 : 1 };
  });
  return { sources, assignments };
}
