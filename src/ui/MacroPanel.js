import { MACRO_TARGETS } from '../control/macros.js';
import { PARAMETERS, toControl } from '../state/parameters.js';
import { fillTargetOptions } from './ModulationPanelV2.js';
export class MacroPanel {
  constructor(store, root, modeButton) {
    this.store = store; this.root = root; this.modeButton = modeButton; this.selected = 'macro-1'; this.rows = new Map(); this.events = new AbortController();
    root.innerHTML = `<div class="panel-title"><h2>Makros</h2><span>Ein Regler · mehrere Ziele</span></div><div class="macro-grid"></div>
      <div class="performance-actions performance-only" data-collapse-section="performance"><div class="subsection-header"><h3>Performance Mode</h3><span class="subsection-status">Schnellzugriff</span></div><div class="subsection-content performance-actions-content"><button type="button" data-quick="freezeEnabled" aria-pressed="false">Freeze</button><button type="button" data-quick="bypass" aria-pressed="false">Global Bypass</button></div></div>
      <div class="macro-editor edit-only" data-collapse-section="macro-assignments"><div class="panel-title"><h3 data-macro-editor-title>Zuweisungen</h3><span>Min / Max in Parametereinheiten · Frequenzen logarithmisch</span></div>
        <div class="assignment-row macro-assignment assignment-head"><span>Target</span><span>Min</span><span>Max</span><span>Richtung</span><span></span></div><div data-macro-assignments></div>
        <button type="button" data-add-macro-assignment>+ Ziel</button><p class="help-text">Mehrere Makros auf einem Ziel addieren ihre Abweichungen vom Grundwert. Danach wirkt die Modulation.</p></div>`;
    for (const macro of store.state.macros) {
      const card = document.createElement('div'); card.className = 'macro-card'; card.dataset.macro = macro.id;
      card.innerHTML = '<input class="macro-name edit-only" maxlength="40" aria-label="Makro umbenennen"><strong class="performance-only" data-macro-name></strong><output></output><input type="range" min="0" max="1" step="0.001" data-macro-value><button class="edit-only" type="button" data-edit-macro>Ziele</button><small data-target-count></small>';
      root.querySelector('.macro-grid').append(card);
    }
    modeButton.addEventListener('click', () => store.setPerformance(!store.state.ui.performance), { signal: this.events.signal });
    root.addEventListener('input', event => {
      const el = event.target, macro = el.closest('[data-macro]')?.dataset.macro;
      if (macro && el.matches('[data-macro-value]')) store.setMacro(macro, { value: Number(el.value) });
      const row = el.closest('[data-macro-assignment]');
      if (row && el.dataset.macroField) {
        const field = el.dataset.macroField, m = store.state.macros.find(m => m.id === this.selected), a = m.assignments.find(a => a.id === row.dataset.macroAssignment);
        if (field === 'target') { const value = store.state.parameters[el.value]; store.setMacroAssignment(this.selected, a.id, { target: el.value, min: value, max: value }); }
        else if (el.value !== '') {
          const p = PARAMETERS[a.target], value = Number(el.value);
          store.setMacroAssignment(this.selected, a.id, { [field]: field === 'polarity' ? value : value / (p.uiScale || 1) });
        }
      }
    }, { signal: this.events.signal });
    root.addEventListener('change', event => { if (event.target.matches('.macro-name')) store.setMacro(event.target.closest('[data-macro]').dataset.macro, { name: event.target.value }); }, { signal: this.events.signal });
    root.addEventListener('click', event => {
      if (event.target.closest('[data-edit-macro]')) { this.selected = event.target.closest('[data-macro]').dataset.macro; this.render(); }
      if (event.target.closest('[data-add-macro-assignment]')) store.addMacroAssignment(this.selected);
      if (event.target.closest('[data-delete-macro-assignment]')) store.deleteMacroAssignment(this.selected, event.target.closest('[data-macro-assignment]').dataset.macroAssignment);
      const quick = event.target.closest('[data-quick]')?.dataset.quick;
      if (quick) store.setParameter(quick, !store.state.parameters[quick]);
    }, { signal: this.events.signal });
    this.unsubscribe = store.subscribe(() => this.render()); this.render();
  }
  render() {
    const state = this.store.state;
    document.body.classList.toggle('performance-mode', state.ui.performance);
    this.modeButton.textContent = state.ui.performance ? 'Edit Mode' : 'Performance Mode';
    this.modeButton.setAttribute('aria-pressed', String(state.ui.performance));
    for (const macro of state.macros) {
      const card = this.root.querySelector('[data-macro="' + macro.id + '"]');
      if (document.activeElement !== card.querySelector('.macro-name')) card.querySelector('.macro-name').value = macro.name;
      card.querySelector('[data-macro-name]').textContent = macro.name;
      card.querySelector('[data-macro-value]').value = macro.value;
      card.querySelector('[data-macro-value]').setAttribute('aria-label', macro.name);
      card.querySelector('output').value = Math.round(macro.value * 100) + ' %';
      card.querySelector('[data-target-count]').textContent = macro.assignments.length + ' Ziele';
      card.classList.toggle('selected', macro.id === this.selected);
    }
    for (const el of this.root.querySelectorAll('[data-quick]')) { const active = state.parameters[el.dataset.quick]; el.setAttribute('aria-pressed', String(active)); el.classList.toggle('active', active); }
    const macro = state.macros.find(m => m.id === this.selected);
    this.root.querySelector('[data-macro-editor-title]').textContent = macro.name + ' · Ziele';
    const host = this.root.querySelector('[data-macro-assignments]');
    for (const [id, row] of this.rows) if (!macro.assignments.some(a => a.id === id)) { row.remove(); this.rows.delete(id); }
    for (const a of macro.assignments) {
      let row = this.rows.get(a.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'assignment-row macro-assignment'; row.dataset.macroAssignment = a.id;
        row.innerHTML = '<select data-macro-field="target" aria-label="Makro-Ziel"></select><input type="number" data-macro-field="min" aria-label="Min"><input type="number" data-macro-field="max" aria-label="Max"><select data-macro-field="polarity" aria-label="Richtung"><option value="1">→</option><option value="-1">←</option></select><button type="button" data-delete-macro-assignment aria-label="Ziel entfernen">×</button>';
        fillTargetOptions(row.querySelector('[data-macro-field="target"]'), MACRO_TARGETS); this.rows.set(a.id, row); host.append(row);
      }
      const p = PARAMETERS[a.target], scale = p.uiScale || 1;
      for (const el of row.querySelectorAll('[data-macro-field]')) {
        const field = el.dataset.macroField;
        if (['min', 'max'].includes(field)) {
          el.min = p.min * scale; el.max = p.max * scale; el.step = p.integer ? 1 : 'any'; el.title = p.displayName + ' / ' + (p.unit || 'Wert');
          if (document.activeElement !== el) el.value = Number((a[field] * scale).toPrecision(7));
        } else el.value = a[field];
      }
    }
    this.root.querySelector('[data-add-macro-assignment]').disabled = macro.assignments.length >= 32;
  }
  dispose() { this.events.abort(); this.unsubscribe(); }
}
