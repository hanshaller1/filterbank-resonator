import { PARAMETERS, sanitizeParameter, toNormalized, fromNormalized, clamp } from '../state/parameters.js';
export const MACRO_TARGETS = Object.values(PARAMETERS).filter(p => p.type === 'number' && p.morphable);
export function normalizeMacros(raw) {
  return Array.from({ length: 8 }, (_, index) => {
    const id = 'macro-' + (index + 1), macro = Array.isArray(raw) ? raw.find(m => m?.id === id) || {} : {};
    const ids = new Set();
    const assignments = (Array.isArray(macro.assignments) ? macro.assignments : []).slice(0, 32).filter(a => a && PARAMETERS[a.target]?.type === 'number' && PARAMETERS[a.target].morphable).map((a, i) => {
      const p = PARAMETERS[a.target];
      let assignmentId = typeof a.id === 'string' && a.id.length < 100 ? a.id : id + '-target-' + i;
      if (ids.has(assignmentId)) assignmentId = id + '-target-' + i; ids.add(assignmentId);
      return { id: assignmentId, target: a.target, min: sanitizeParameter(a.target, a.min ?? p.min), max: sanitizeParameter(a.target, a.max ?? p.max), polarity: a.polarity === -1 ? -1 : 1 };
    });
    return { id, name: typeof macro.name === 'string' && macro.name.trim() ? macro.name.trim().slice(0, 40) : 'Macro ' + (index + 1),
      value: typeof macro.value === 'number' && Number.isFinite(macro.value) ? clamp(macro.value, 0, 1) : 0, assignments };
  });
}
// One mapping sets its declared range exactly. Multiple mappings to the same
// parameter add their offsets relative to that parameter's base, then clamp.
// The result is derived; neither macros nor modulation write into base state.
export function resolveMacroParameters(base, macros) {
  const offsets = {}, result = { ...base };
  for (const macro of macros) for (const a of macro.assignments) {
    const p = PARAMETERS[a.target], t = a.polarity < 0 ? 1 - macro.value : macro.value;
    const mapped = toNormalized(p, a.min) * (1 - t) + toNormalized(p, a.max) * t;
    offsets[a.target] = (offsets[a.target] || 0) + mapped - toNormalized(p, base[a.target]);
  }
  for (const [id, offset] of Object.entries(offsets)) {
    const p = PARAMETERS[id]; result[id] = sanitizeParameter(id, fromNormalized(p, toNormalized(p, base[id]) + offset));
  }
  return result;
}
