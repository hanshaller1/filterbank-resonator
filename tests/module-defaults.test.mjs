import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AppState } from '../src/state/AppState.js';
import { MODULES, defaults } from '../src/state/parameters.js';
import { normalizeModulation } from '../src/control/modulation.js';

test('module defaults reset only the selected processing module', () => {
  const store = new AppState();
  store.setParameters({ driveAmount: .9, filterEnabled: false });
  const order = [...store.state.order];
  assert.equal(store.resetModuleToDefaults('drive'), true);
  assert.equal(store.state.parameters.driveAmount, defaults().driveAmount);
  assert.equal(store.state.parameters.filterEnabled, false);
  assert.deepEqual(store.state.order, order);
});

test('EQ module reset clears remembered EQ banks as module-local state', () => {
  const store = new AppState();
  store.setEqType('shelf2');
  store.setParameter('eqLow', 7);
  assert.ok(Object.keys(store.state.eqBanks).length > 0);
  store.resetModuleToDefaults('eq');
  assert.deepEqual(store.state.eqBanks, {});
  assert.equal(store.state.parameters.eqType, 'tone3');
  assert.equal(store.state.parameters.eqLow, 0);
});

test('modulation defaults reset sources and assignments without changing DSP parameters', () => {
  const store = new AppState();
  store.setParameter('cutoff', 800);
  store.setModulation({ sources: { lfo1: { enabled: true, rate: 8 } }, assignments: [{ id: 'x', source: 'lfo1', target: 'cutoff', amount: 1, polarity: -1 }] });
  store.resetModuleToDefaults('modulation');
  assert.deepEqual(store.state.modulation, normalizeModulation());
  assert.equal(store.state.parameters.cutoff, 800);
});

test('every processing module and Modulation expose a Default action', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const module of MODULES) assert.match(html, new RegExp(`data-reset-module="${module.id}"`));
  assert.match(readFileSync(new URL('../src/ui/ModulationPanelV2.js', import.meta.url), 'utf8'), /data-reset-module="modulation"/);
});
