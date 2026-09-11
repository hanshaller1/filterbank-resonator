import { MODULATION_TARGETS, SOURCE_DEFINITIONS } from '../control/modulation.js';
import { MODULES } from '../state/parameters.js';

export const targetLabel = parameter => (MODULES.find(module => module.id === parameter.module)?.displayName || parameter.module) + ' · ' + parameter.displayName;
export function fillTargetOptions(select, parameters) { for (const parameter of parameters) select.add(new Option(targetLabel(parameter), parameter.id)); }

const lfoMarkup = (id, label) => `<section class="modulation-module" data-source="${id}">
  <div class="module-header"><label class="module-power"><input type="checkbox" role="switch" aria-label="${label} aktivieren" data-field="enabled"><span class="module-power-state">OFF</span></label><h3>${label}</h3><small>Waveform · Tempo</small></div>
  <div class="module-content modulation-module-content" ><div class="modulator-layout"><div class="modulator-controls">
    <label>Waveform<select data-field="waveform"><option value="sine">Sine</option><option value="triangle">Triangle</option><option value="saw">Saw</option><option value="square">Square</option><option value="random">Random</option></select></label>
    <label>Sync<select data-field="sync"><option value="free">Free</option><option value="tempo">Tempo</option></select></label>
    <label data-free-rate>Rate / Hz<input type="range" min="0.02" max="20" step="0.01" data-field="rate"></label>
    <label data-tempo-rate>Beats / Cycle<select data-field="beats"><option value="0.25">¼</option><option value="0.5">½</option><option value="1">1</option><option value="2">2</option><option value="4">4</option><option value="8">8</option></select></label>
    <label>Depth<input type="range" min="0" max="1" step="0.001" data-field="depth"><output data-source-value="depth"></output></label>
    <label>Phase / °<input type="range" min="0" max="360" step="1" data-field="phase"></label>
    <small data-tempo-status>Tempo: 120 BPM · bereit</small></div><div class="modulator-visual"><canvas data-lfo-visual="${id}" aria-label="${label} Waveform"></canvas><output data-current-value>0 %</output></div></div></div></section>`;

const envelopeMarkup = (id, label) => `<section class="modulation-module" data-source="${id}">
  <div class="module-header"><label class="module-power"><input type="checkbox" role="switch" aria-label="${label} aktivieren" data-field="enabled"><span class="module-power-state">OFF</span></label><h3>${label}</h3><small>Input · Envelope</small></div>
  <div class="module-content modulation-module-content" ><div class="modulator-layout"><div class="modulator-controls">
    <label>Attack / ms<input type="range" min="1" max="1000" data-field="attack"></label><label>Release / ms<input type="range" min="10" max="3000" data-field="release"></label>
    <label>Sensitivity / dB<input type="range" min="-24" max="24" step="0.1" data-field="sensitivity"></label><label>Threshold / dB<input type="range" min="-80" max="0" step="0.1" data-field="threshold"></label>
  </div><div class="modulator-visual"><canvas data-envelope-visual="${id}" aria-label="${label} Pegel und Hüllkurve"></canvas><output data-current-value>0 %</output></div></div></div></section>`;

export class ModulationPanelV2 {
  constructor(store, root) {
    this.store = store; this.root = root; this.events = new AbortController(); this.rows = new Map(); this.visual = null;
    this.history = Object.fromEntries(['envelope1', 'envelope2'].map(id => [id, { input: [], envelope: [] }]));
    root.innerHTML = `<div class="panel-title"><h2>Modulation</h2><span>Grundwert + Modulation · begrenzte Zielbereiche</span></div><div class="modulation-modules">${lfoMarkup('lfo1', 'LFO 1')}${lfoMarkup('lfo2', 'LFO 2')}${envelopeMarkup('envelope1', 'Envelope Follower 1')}${envelopeMarkup('envelope2', 'Envelope Follower 2')}</div>
      <section class="modulation-matrix" data-collapse-section="modulation-matrix"><div class="subsection-header"><h3>Modulationsmatrix</h3><span class="subsection-status">Source → Target → Amount</span></div><div class="subsection-content"><div class="assignment-table"><div class="assignment-row assignment-head"><span>Source</span><span>Target</span><span>Amount</span><span>Polarity</span><span></span></div><div data-assignments></div></div><button type="button" data-add-assignment>+ Zuweisung</button></div></section>`;
    for (const control of root.querySelectorAll('[data-source] input[type="range"]')) {
      if (control.dataset.field === 'depth') continue;
      const value = document.createElement('output'); value.dataset.sourceValue = control.dataset.field; control.after(value);
    }
    this.onInput = event => this.handleInput(event);
    root.addEventListener('input', this.onInput, { signal: this.events.signal });
    root.addEventListener('click', event => { if (event.target.closest('[data-add-assignment]')) store.addAssignment(); if (event.target.closest('[data-delete-assignment]')) store.deleteAssignment(event.target.closest('[data-assignment]').dataset.assignment); }, { signal: this.events.signal });
    this.unsubscribe = store.subscribe(() => this.render()); this.render(); this.paint();
  }

  handleInput(event) {
    const element = event.target, source = element.closest('[data-source]')?.dataset.source;
    if (source && element.dataset.field) {
      const field = element.dataset.field;
      const value = element.type === 'checkbox' ? element.checked : ['waveform', 'sync'].includes(field) ? element.value : Number(element.value);
      if (element.value !== '') this.store.setSource(source, { [field]: value });
    }
    const row = element.closest('[data-assignment]');
    if (row && element.dataset.assignmentField) this.store.setAssignment(row.dataset.assignment, { [element.dataset.assignmentField]: ['source', 'target'].includes(element.dataset.assignmentField) ? element.value : Number(element.value) });
  }

  render() {
    const modulation = this.store.state.modulation;
    for (const [id, source] of Object.entries(modulation.sources)) {
      const content = this.root.querySelector('[data-source="' + id + '"]'); if (!content) continue;
      const module = content.closest('.modulation-module'); module.classList.toggle('module-active', source.enabled);
      module.querySelector('.module-power-state').textContent = source.enabled ? 'ON' : 'OFF';
      for (const control of content.querySelectorAll('[data-field]')) {
        const value = source[control.dataset.field];
        const readout = content.querySelector('[data-source-value="' + control.dataset.field + '"]');
        if (readout && control.dataset.field !== 'depth') readout.value = String(value);
        if (control.type === 'checkbox') control.checked = value; else if (document.activeElement !== control) control.value = value;
      }
      if (id.startsWith('lfo')) {
        content.querySelector('[data-source-value="depth"]').value = Math.round(source.depth * 100) + ' %';
        content.querySelector('[data-free-rate]').hidden = source.sync !== 'free'; content.querySelector('[data-tempo-rate]').hidden = source.sync !== 'tempo';
      }
    }
    const host = this.root.querySelector('[data-assignments]');
    for (const [id, row] of this.rows) if (!modulation.assignments.some(assignment => assignment.id === id)) { row.remove(); this.rows.delete(id); }
    for (const assignment of modulation.assignments) {
      let row = this.rows.get(assignment.id);
      if (!row) { row = document.createElement('div'); row.className = 'assignment-row'; row.dataset.assignment = assignment.id;
        row.innerHTML = '<select data-assignment-field="source" aria-label="Source"></select><select data-assignment-field="target" aria-label="Target"></select><label><input type="range" min="0" max="1" step="0.001" data-assignment-field="amount" aria-label="Amount"><output></output></label><select data-assignment-field="polarity" aria-label="Polarity"><option value="1">+</option><option value="-1">−</option></select><button type="button" data-delete-assignment aria-label="Zuweisung entfernen">×</button>';
        for (const source of Object.values(SOURCE_DEFINITIONS)) row.querySelector('[data-assignment-field="source"]').add(new Option(source.label, source.id)); fillTargetOptions(row.querySelector('[data-assignment-field="target"]'), MODULATION_TARGETS); this.rows.set(assignment.id, row); host.append(row); }
      for (const control of row.querySelectorAll('[data-assignment-field]')) control.value = assignment[control.dataset.assignmentField]; row.querySelector('output').value = (assignment.amount * 100).toFixed(1) + ' %';
    }
    this.root.querySelector('[data-add-assignment]').disabled = modulation.assignments.length >= 64;
  }

  setTempo(info) { if (info.locked) this.lastTempo = info.bpm; const text = `Tempo: ${(this.lastTempo || 120).toFixed(2)} BPM · ${info.locked ? 'stabil' : this.lastTempo ? 'letzter stabiler Wert' : 'bereit'}`; this.root.querySelectorAll('[data-tempo-status]').forEach(element => { element.textContent = text; }); }
  updateVisuals(value) { this.visual = value; for (const id of ['envelope1', 'envelope2']) { const history = this.history[id]; history.input.push(value?.input || 0); history.envelope.push(value?.envelope?.[id] || 0); if (history.input.length > 96) { history.input.shift(); history.envelope.shift(); } } }
  paint() { this.frame = requestAnimationFrame(() => this.paint()); if (this.root.offsetParent === null) return; for (const id of ['lfo1', 'lfo2']) this.paintLfo(id); for (const id of ['envelope1', 'envelope2']) this.paintEnvelope(id); }
  canvas(selector) { const canvas = this.root.querySelector(selector); if (!canvas || canvas.closest('.is-collapsed')) return null; const width = canvas.clientWidth || 300, height = canvas.clientHeight || 92, ratio = Math.min(devicePixelRatio || 1, 2); if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio; } const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height); return { canvas, context, width, height }; }
  paintLfo(id) { const result = this.canvas('[data-lfo-visual="' + id + '"]'); if (!result) return; const { context, width, height, canvas } = result, source = this.store.state.modulation.sources[id], phase = this.visual?.lfoPhase?.[id] || 0, phaseOffset = source.phase / 360; context.strokeStyle = 'rgba(130,150,170,.35)'; context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke(); const wave = position => { const p = ((position % 1) + 1) % 1; return source.waveform === 'sine' ? Math.sin(p * Math.PI * 2) : source.waveform === 'triangle' ? 1 - 4 * Math.abs(p - .5) : source.waveform === 'saw' ? p * 2 - 1 : source.waveform === 'square' ? p < .5 ? 1 : -1 : (this.visual?.randomValue?.[id] || 0); }; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--analyzer-1') || '#73a9c9'; context.lineWidth = 1.8; context.beginPath(); for (let x = 0; x <= width; x += 2) { const y = height / 2 - wave(x / width + phaseOffset) * height * .36 * source.depth; if (!x) context.moveTo(x, y); else context.lineTo(x, y); } context.stroke(); const markerPosition = (phase + phaseOffset) % 1, marker = phase * width; context.fillStyle = source.enabled ? getComputedStyle(document.documentElement).getPropertyValue('--accent') : '#748190'; context.beginPath(); context.arc(marker, height / 2 - wave(markerPosition) * height * .36 * source.depth, 4, 0, Math.PI * 2); context.fill(); canvas.parentElement.querySelector('[data-current-value]').value = source.enabled ? `${Math.round((this.visual?.sources?.[id] || 0) * 100)} %` : 'OFF';
  }
  paintEnvelope(id) { const result = this.canvas('[data-envelope-visual="' + id + '"]'); if (!result) return; const { context, width, height, canvas } = result, source = this.store.state.modulation.sources[id], history = this.history[id]; context.strokeStyle = 'rgba(130,150,170,.35)'; context.setLineDash([3, 3]); const threshold = Math.max(0, Math.min(1, 10 ** ((source.threshold - source.sensitivity) / 20))); context.beginPath(); context.moveTo(0, height * (.95 - threshold * .9)); context.lineTo(width, height * (.95 - threshold * .9)); context.stroke(); context.setLineDash([]); const draw = (values, color) => { context.strokeStyle = color; context.lineWidth = 1.6; context.beginPath(); values.forEach((value, index) => { const x = index * width / Math.max(1, values.length - 1), y = height - Math.min(1, value) * height * .9 - height * .05; if (!index) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); }; draw(history.input, 'rgba(140,155,170,.6)'); draw(history.envelope, getComputedStyle(document.documentElement).getPropertyValue('--analyzer-3') || '#7fba9b'); canvas.parentElement.querySelector('[data-current-value]').value = source.enabled ? `${Math.round((this.visual?.sources?.[id] || 0) * 100)} %` : 'OFF';
  }
  dispose() { this.events.abort(); this.unsubscribe(); cancelAnimationFrame(this.frame); }
}
