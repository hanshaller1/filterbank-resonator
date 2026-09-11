import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../src/state/AppState.js';
import { decodePreset, encodePreset } from '../src/state/schema.js';
import { PresetStore, loadSession, SessionPersistence } from '../src/state/PresetStore.js';
const storage = () => { const data = new Map(); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) }; };
test('Full preset CRUD and JSON round-trip preserve parameters, order, EQ banks and A/B', () => {
  const state = new AppState({ wetGain: -9, autoGain: true, freezeSyncLength: '8bars', eqGraphic4: 9 });
  state.storeSnapshot('a'); state.setParameter('driveCharacter', 'roundFuzz'); state.storeSnapshot('b'); state.setMorph(.7);
  const data = storage(), presets = new PresetStore(data);
  const id = presets.save('Test', state.state);
  const duplicate = presets.duplicate(id); presets.rename(duplicate, 'Copy');
  assert.equal(presets.items.length, 2);
  assert.equal(presets.items[1].name, 'Copy');
  const exported = presets.export(id), decoded = decodePreset(JSON.parse(exported));
  assert.deepEqual(decoded, state.state);
  const imported = presets.import(exported); assert.deepEqual(presets.load(imported), state.state);
  state.reset(); state.restoreState(presets.load(id)); assert.equal(state.state.parameters.wetGain, -9);
  presets.delete(duplicate); assert.equal(presets.items.length, 2);
  assert.equal(new PresetStore(data).items.length, 2);
});
test('Migration ignores unknowns and preserves old bypass and graphic parameters safely', () => {
  const s = decodePreset({ schemaVersion: 1, settings: { driveBypass: true, filterType: 'bad', cutoff: NaN, eqGraphic: [1, 2, 3, 4, 5], freezeLength: 2 }, order: ['eq', 'invalid'] });
  assert.equal(s.parameters.driveEnabled, false); assert.equal(s.parameters.cutoff, 20000);
  assert.equal(s.parameters.filterType, 'lowpass'); assert.equal(s.parameters.eqGraphic4, 5);
  assert.equal(s.parameters.freezeFreeLength, 2); assert.equal(s.order.length, 11);
  assert.throws(() => decodePreset({ schemaVersion: 50, parameters: {} }));
  assert.throws(() => decodePreset({ unrelated: true }));
  const document = encodePreset({ ...s, inputDeviceId: 'private-device' });
  assert.ok(!JSON.stringify(document).includes('private-device'));
});
test('Damaged storage and quota errors do not mutate live state or overwrite stored presets', () => {
  const data = storage(); data.setItem('syntakt-presets-v2', '{broken');
  const repository = new PresetStore(data); assert.equal(repository.items.length, 0);
  assert.throws(() => repository.import('{'));
  repository.storage = { setItem() { throw Error('quota'); } };
  assert.throws(() => repository.save('x', new AppState().state)); assert.equal(repository.items.length, 0);
});
test('Session persists base state and restarts Freeze OFF because audio buffers are not saved', () => {
  const data = storage(), store = new AppState({ freezeEnabled: true, cutoff: 4000 });
  const persistence = new SessionPersistence(store, data);
  persistence.flush(); persistence.dispose();
  const session = loadSession(data, () => ({}));
  assert.equal(session.parameters.freezeEnabled, false); assert.equal(session.parameters.cutoff, 4000);
});
