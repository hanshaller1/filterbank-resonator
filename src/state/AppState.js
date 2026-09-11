import { PARAMETERS, MODULES, defaults, sanitizeParameter, sanitizeParameters, sanitizeOrder, DEFAULT_ORDER } from './parameters.js';
import { normalizeMacros } from '../control/macros.js';
import { normalizeModulation } from '../control/modulation.js';
import { captureSnapshot, morphSnapshots } from './Snapshots.js';
import { defaultState, normalizeState } from './schema.js';
export class AppState {
  constructor(parameters = {}) {
    this.value = { ...defaultState(), parameters: sanitizeParameters(parameters) };
    this.listeners = new Set();
  }
  get state() { return this.value; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(reason) { for (const listener of this.listeners) listener(this.value, reason); }
  setParameter(id, value) { this.setParameters({ [id]: value }); }
  setOrder(order) {
    const next = sanitizeOrder(order);
    if (next.join() === this.value.order.join()) return;
    this.value = { ...this.value, order: next }; this.emit('order');
  }
  setParameters(patch) {
    const next = { ...this.value.parameters };
    for (const [id, value] of Object.entries(patch)) if (Object.hasOwn(PARAMETERS, id)) next[id] = sanitizeParameter(id, value);
    if (Object.keys(next).every(id => next[id] === this.value.parameters[id])) return;
    this.value = { ...this.value, parameters: next }; this.emit('parameters');
  }
  setEqType(type) {
    const old = this.value.parameters;
    const eqIds = MODULES.find(m => m.id === 'eq').parameters.filter(id => id !== 'eqType' && id !== 'eqEnabled');
    const banks = { ...this.value.eqBanks, [old.eqType]: Object.fromEntries(eqIds.map(id => [id, old[id]])) };
    const selected = sanitizeParameter('eqType', type);
    this.value = { ...this.value, eqBanks: banks };
    this.setParameters({ ...Object.fromEntries(eqIds.map(id => [id, banks[selected]?.[id] ?? PARAMETERS[id].default])), eqType: selected });
  }
  storeSnapshot(slot) {
    if (!['a', 'b'].includes(slot)) return;
    this.value = { ...this.value, snapshots: { ...this.value.snapshots, [slot]: captureSnapshot(this.value) } };
    this.emit('snapshot');
  }
  recallSnapshot(slot) {
    const snapshot = this.value.snapshots[slot];
    if (!snapshot) return;
    this.value = { ...this.value, parameters: { ...this.value.parameters, ...snapshot.parameters }, order: [...snapshot.order], morph: slot === 'a' ? 0 : 1 };
    this.emit('recall');
  }
  setMorph(value) {
    if (!this.value.snapshots.a || !this.value.snapshots.b) return;
    const position = Math.max(0, Math.min(1, Number(value) || 0));
    const next = morphSnapshots(this.value.snapshots.a, this.value.snapshots.b, position);
    this.value = { ...this.value, parameters: { ...this.value.parameters, ...next.parameters }, order: next.order, morph: position };
    this.emit('morph');
  }
  setModulation(modulation) { this.value = { ...this.value, modulation: normalizeModulation(modulation) }; this.emit('modulation'); }
  setSource(id, patch) {
    const m = this.value.modulation;
    if (!m.sources[id]) return;
    this.setModulation({ ...m, sources: { ...m.sources, [id]: { ...m.sources[id], ...patch } } });
  }
  setAssignment(id, patch) {
    const m = this.value.modulation;
    this.setModulation({ ...m, assignments: m.assignments.map(a => a.id === id ? { ...a, ...patch } : a) });
  }
  addAssignment() {
    const m = this.value.modulation;
    this.setModulation({ ...m, assignments: [...m.assignments, { id: crypto.randomUUID(), source: 'lfo1', target: 'cutoff', amount: .1, polarity: 1 }] });
  }
  deleteAssignment(id) { const m = this.value.modulation; this.setModulation({ ...m, assignments: m.assignments.filter(a => a.id !== id) }); }
  setMacro(id, patch) {
    this.value = { ...this.value, macros: normalizeMacros(this.value.macros.map(m => m.id === id ? { ...m, ...patch } : m)) };
    this.emit('macros');
  }
  addMacroAssignment(id) {
    const m = this.value.macros.find(m => m.id === id);
    if (!m) return;
    // Start neutral at the current base; choosing a range is an explicit edit.
    const value = this.value.parameters.driveAmount;
    this.setMacro(id, { assignments: [...m.assignments, { id: crypto.randomUUID(), target: 'driveAmount', min: value, max: value, polarity: 1 }] });
  }
  setMacroAssignment(id, assignmentId, patch) {
    const m = this.value.macros.find(m => m.id === id); if (!m) return;
    this.setMacro(id, { assignments: m.assignments.map(a => a.id === assignmentId ? { ...a, ...patch } : a) });
  }
  deleteMacroAssignment(id, assignmentId) {
    const m = this.value.macros.find(m => m.id === id); if (m) this.setMacro(id, { assignments: m.assignments.filter(a => a.id !== assignmentId) });
  }
  setPerformance(performance) { this.value = { ...this.value, ui: { ...this.value.ui, performance: Boolean(performance) } }; this.emit('ui'); }
  restoreState(state, { preserveUi = false } = {}) { const ui = this.value.ui; this.value = normalizeState(state); if (preserveUi) this.value.ui = ui; this.emit('restore'); }
  reset() { this.value = { ...defaultState(), ui: this.value.ui }; this.emit('reset'); }
}
export function readLegacyState(storage) {
  const read = key => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
  const processing = read('processingStates') || {};
  const state = { ...processing };
  if (state.freezeFreeLength !== undefined) state.freezeFreeLength = Number(state.freezeFreeLength) / 1000;
  else if (processing.freezeLength !== undefined) state.freezeFreeLength = Number(processing.freezeLength);
  // A captured buffer cannot survive a reload.
  state.freezeEnabled = false;
  const type = storage.getItem('eqType') || 'tone3';
  const eq = read('eqStates')?.[type] || {};
  state.eqType = type;
  for (const band of ['low', 'mid', 'high', 'tilt']) if (eq[band] !== undefined) state['eq' + band[0].toUpperCase() + band.slice(1)] = eq[band];
  if (Array.isArray(eq.graphic)) eq.graphic.forEach((v, i) => { state['eqGraphic' + i] = v; });
  return sanitizeParameters(state);
}
