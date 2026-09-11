import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualizationPanel, spectrogramFrequencyIndex, spectrogramStrength } from '../src/ui/VisualizationPanel.js';

test('Spectrogram maps dB data to frequency bins and keeps silence near the canvas background', () => {
  assert.equal(spectrogramFrequencyIndex(20, 48000, 512), 0);
  assert.equal(spectrogramFrequencyIndex(12000, 48000, 512), 256);
  assert.equal(spectrogramFrequencyIndex(30000, 48000, 512), 511);
  assert.equal(spectrogramStrength(-96), 0);
  assert.ok(spectrogramStrength(-20) > spectrogramStrength(-80));
});

test('Spectrogram source selection is single-select while other modes retain all sources', () => {
  const panel = Object.create(VisualizationPanel.prototype);
  panel.state = { sources: ['input', 'output', 'postFilter'], visible: [true, true, true] };
  panel.sourceNames = ['input', 'output', 'postFilter'];
  panel.mode = 'spectrogram';
  panel.selectSpectrogramSource(1);
  assert.deepEqual(panel.state.visible, [false, true, false]);
  assert.deepEqual(panel.getAnalysisSources(), ['output']);
  panel.mode = 'spectrum';
  panel.state.visible = [true, true, false];
  assert.deepEqual(panel.getAnalysisSources(), ['input', 'output']);
});

test('Spectrogram scrolls one new column instead of painting a full canvas', () => {
  const mainCalls = [], offCalls = [];
  const offContext = {
    fillStyle: '',
    drawImage: (...args) => offCalls.push(['drawImage', ...args]),
    clearRect: (...args) => offCalls.push(['clearRect', ...args]),
    fillRect: (...args) => offCalls.push(['fillRect', ...args, offContext.fillStyle])
  };
  const offscreen = { width: 0, height: 0, getContext: () => offContext };
  const mainContext = {
    fillStyle: '', font: '',
    drawImage: (...args) => mainCalls.push(['drawImage', ...args]),
    fillRect: (...args) => mainCalls.push(['fillRect', ...args]),
    fillText: (...args) => mainCalls.push(['fillText', ...args]),
    measureText: text => ({ width: text.length * 6 })
  };
  const previousDocument = globalThis.document, previousComputedStyle = globalThis.getComputedStyle;
  globalThis.document = { createElement: () => offscreen, documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: name => name === '--visualizer-bg' ? '#0d1116' : '#73a9c9' });
  try {
    const panel = Object.create(VisualizationPanel.prototype);
    panel.width = 100; panel.height = 80; panel.context = mainContext; panel.spectrogramCanvas = null; panel.spectrogramSource = null;
    panel.drawSpectrogram({ source: 'input', frequency: new Float32Array([-96, -80, -40, -20]) }, 48000);
    const columns = offCalls.filter(call => call[0] === 'fillRect');
    assert.equal(columns.length, 35);
    assert.ok(columns.every(call => call[1] === 39 && call[3] === 1 && call[4] === 1));
    assert.ok(offCalls.some(call => call[0] === 'drawImage' && call[1] === offscreen && call[2] === -1));
    assert.ok(new Set(columns.map(call => call[5])).size > 1);
  } finally {
    globalThis.document = previousDocument;
    globalThis.getComputedStyle = previousComputedStyle;
  }
});
