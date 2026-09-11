import { defaults, sanitizeParameters, sanitizeOrder, MODULES } from './parameters.js';
import { normalizeMacros } from '../control/macros.js';
import { normalizeModulation } from '../control/modulation.js';
import { normalizeSnapshot } from './Snapshots.js';
export const SCHEMA_VERSION = 3;
export function defaultState() {
  return { parameters: defaults(), order: sanitizeOrder(), eqBanks: {}, snapshots: { a: null, b: null }, morph: 0, modulation: normalizeModulation(), macros: normalizeMacros(), ui: { performance: false } };
}
export function migrateParameters(raw = {}) {
  const p = { ...raw };
  if (p.driveBypass !== undefined && p.driveEnabled === undefined) p.driveEnabled = !p.driveBypass;
  if (p.filterBypass !== undefined && p.filterEnabled === undefined) p.filterEnabled = !p.filterBypass;
  if (p.eqBypass !== undefined && p.eqEnabled === undefined) p.eqEnabled = !p.eqBypass;
  if (Array.isArray(p.eqGraphic)) p.eqGraphic.forEach((v, i) => { p['eqGraphic' + i] = v; });
  if (p.freezeLength !== undefined && p.freezeFreeLength === undefined) p.freezeFreeLength = p.freezeLength;
  return sanitizeParameters(p);
}
export function normalizeState(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const eqBanks = {};
  for (const type of ['shelf2', 'tone3', 'tilt', 'graphic5']) if (value.eqBanks?.[type]) {
    const normalized = sanitizeParameters(value.eqBanks[type]);
    eqBanks[type] = Object.fromEntries(MODULES.find(m => m.id === 'eq').parameters.map(id => [id, normalized[id]]));
  }
  return { ...defaultState(), parameters: migrateParameters(value.parameters || value.settings || {}),
    order: sanitizeOrder(value.order), eqBanks, modulation: normalizeModulation(value.modulation), macros: normalizeMacros(value.macros),
    snapshots: { a: normalizeSnapshot(value.snapshots?.a), b: normalizeSnapshot(value.snapshots?.b) },
    morph: Math.max(0, Math.min(1, Number(value.morph) || 0)),
    ui: { performance: value.ui?.performance === true }
  };
}
export function decodePreset(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('Die Datei enthält kein gültiges Preset.');
  const version = document.schemaVersion ?? 1;
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) throw Error('Diese Preset-Version wird noch nicht unterstützt.');
  const content = document.state || document;
  if (!content.parameters && !content.settings) throw Error('Im Preset fehlen die Parameter.');
  // v1 used a flat settings object; v2 uses canonical parameter IDs.
  return normalizeState(content);
}
export function encodePreset(state, name = 'Untitled', includeLayout = false) {
  const normalized = normalizeState(state);
  if (!includeLayout) delete normalized.ui;
  return { schemaVersion: SCHEMA_VERSION, name, state: normalized };
}
