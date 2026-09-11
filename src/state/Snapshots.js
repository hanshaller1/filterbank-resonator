import { PARAMETERS, sanitizeParameters, sanitizeOrder, sanitizeParameter, fromNormalized, toNormalized, clamp } from './parameters.js';
export const SNAPSHOT_IDS = Object.values(PARAMETERS).filter(p => p.module !== 'input' && p.module !== 'output').map(p => p.id);
export function captureSnapshot(state) {
  return { parameters: Object.fromEntries(SNAPSHOT_IDS.map(id => [id, state.parameters[id]])), order: [...state.order] };
}
export function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.parameters) return null;
  const all = sanitizeParameters(snapshot.parameters);
  return { parameters: Object.fromEntries(SNAPSHOT_IDS.map(id => [id, all[id]])), order: sanitizeOrder(snapshot.order) };
}
export function morphSnapshots(a, b, position) {
  const t = clamp(Number(position) || 0, 0, 1);
  const parameters = {};
  for (const id of SNAPSHOT_IDS) {
    const p = PARAMETERS[id], av = a.parameters[id], bv = b.parameters[id];
    parameters[id] = p.type === 'number' && p.morphable
      ? sanitizeParameter(id, av === bv || t === 0 ? av : t === 1 ? bv : p.scaling === 'log' ? fromNormalized(p, toNormalized(p, av) * (1 - t) + toNormalized(p, bv) * t) : av + (bv - av) * t)
      : t < .5 ? av : bv;
  }
  return { parameters, order: [...(t < .5 ? a.order : b.order)] };
}
