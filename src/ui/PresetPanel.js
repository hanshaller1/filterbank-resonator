export class PresetPanel {
  constructor(store, repository, root, message) {
    this.store = store; this.repository = repository; this.root = root; this.message = message;
    this.events = new AbortController(); this.selected = '';
    root.innerHTML = '<div class="panel-title"><h2>Presets</h2><span>Speichern, Laden und Austausch</span></div><div class="preset-row"><label>Preset<select data-presets><option value="">Ungespeicherter Zustand</option></select></label><label>Name<input data-preset-name type="text" maxlength="80" value="Untitled"></label><div class="preset-actions"><button type="button" data-preset="init">New / Init</button><button type="button" data-preset="save">Save</button><button type="button" data-preset="load">Load</button><button type="button" data-preset="rename">Rename</button><button type="button" data-preset="duplicate">Duplicate</button><button type="button" data-preset="delete">Delete</button><button type="button" data-preset="export">Export JSON</button><button type="button" data-preset="import">Import JSON</button></div><input data-preset-file type="file" accept=".json,application/json" hidden></div>';
    this.select = root.querySelector('[data-presets]'); this.name = root.querySelector('[data-preset-name]');
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-preset]')?.dataset.preset;
      if (action) this.action(action);
    }, { signal: this.events.signal });
    this.select.addEventListener('change', () => { this.selected = this.select.value; this.name.value = repository.items.find(p => p.id === this.selected)?.name || 'Untitled'; this.render(); }, { signal: this.events.signal });
    root.querySelector('[data-preset-file]').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      try { if (file.size > 250_000) throw Error('Die Preset-Datei ist zu groß.'); this.selected = repository.import(await file.text()); this.render(); this.message('Preset importiert. Mit Load übernehmen.'); } catch (error) { this.message(error.message, true); }
      event.target.value = '';
    }, { signal: this.events.signal });
    this.render();
  }
  action(action) {
    try {
      if (action === 'init') { this.store.reset(); this.selected = ''; this.name.value = 'Untitled'; }
      if (action === 'save') this.selected = this.repository.save(this.name.value, this.store.state, this.selected);
      if (action === 'load') this.store.restoreState(this.repository.load(this.selected), { preserveUi: true });
      if (action === 'rename') this.repository.rename(this.selected, this.name.value);
      if (action === 'duplicate') this.selected = this.repository.duplicate(this.selected);
      if (action === 'delete') { this.repository.delete(this.selected); this.selected = ''; }
      if (action === 'import') { this.root.querySelector('[data-preset-file]').click(); return; }
      if (action === 'export') {
        const blob = new Blob([this.repository.export(this.selected)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = (this.name.value.replace(/[^a-z0-9_-]/gi, '_') || 'preset') + '.json';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      this.render(); this.message('Preset: ' + ({ init: 'Initialzustand geladen.', save: 'gespeichert.', load: 'geladen.', rename: 'umbenannt.', duplicate: 'dupliziert.', delete: 'gelöscht.', export: 'exportiert.' }[action] || ''));
    } catch (error) { this.message(error.message, true); }
  }
  render() {
    this.select.replaceChildren(new Option('Ungespeicherter Zustand', ''));
    for (const p of this.repository.items) this.select.add(new Option(p.name, p.id));
    this.select.value = this.selected;
    const selected = this.repository.items.find(p => p.id === this.selected);
    if (selected) this.name.value = selected.name;
    for (const action of ['load','rename','duplicate','delete','export']) this.root.querySelector('[data-preset="' + action + '"]').disabled = !selected;
  }
  dispose() { this.events.abort(); }
}
