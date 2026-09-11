import { encodePreset, decodePreset } from './schema.js';
const KEY = 'syntakt-presets-v2';
export class PresetStore {
  constructor(storage) {
    this.storage = storage; this.items = [];
    try {
      const data = JSON.parse(storage.getItem(KEY) || '[]');
      if (Array.isArray(data)) for (const item of data.slice(0, 100)) {
        try { this.items.push({ id: String(item.id), name: this.safeName(item.name), document: encodePreset(decodePreset(item.document), this.safeName(item.name)) }); } catch {}
      }
    } catch {}
  }
  safeName(name) { return (String(name || '').trim() || 'Untitled').slice(0, 80); }
  persist(next) {
    const json = JSON.stringify(next);
    if (json.length > 2_000_000 || next.length > 100) throw Error('Der lokale Preset-Speicher ist voll. Bitte Presets exportieren oder löschen.');
    try { this.storage.setItem(KEY, json); } catch { throw Error('Preset konnte nicht gespeichert werden. Browser-Speicher ist voll oder nicht verfügbar.'); }
    this.items = next;
  }
  save(name, state, id = null) {
    const existing = this.items.find(item => item.id === id);
    const item = { id: existing?.id || crypto.randomUUID(), name: this.safeName(name), document: encodePreset(state, this.safeName(name)) };
    this.persist(existing ? this.items.map(p => p.id === id ? item : p) : [...this.items, item]); return item.id;
  }
  load(id) { const item = this.items.find(p => p.id === id); if (!item) throw Error('Preset nicht gefunden.'); return decodePreset(item.document); }
  rename(id, name) { if (!this.items.some(p => p.id === id)) throw Error('Preset nicht gefunden.'); this.persist(this.items.map(p => p.id === id ? { ...p, name: this.safeName(name), document: { ...p.document, name: this.safeName(name) } } : p)); }
  delete(id) { this.persist(this.items.filter(p => p.id !== id)); }
  duplicate(id) { const p = this.items.find(p => p.id === id); if (!p) throw Error('Preset nicht gefunden.'); return this.save(p.name + ' – Kopie', this.load(id)); }
  import(text) {
    if (text.length > 250_000) throw Error('Die Preset-Datei ist zu groß.');
    let document;
    try { document = JSON.parse(text); } catch { throw Error('Die Datei ist kein gültiges JSON.'); }
    return this.save(document.name || 'Imported', decodePreset(document));
  }
  export(id) { const item = this.items.find(p => p.id === id); if (!item) throw Error('Preset nicht gefunden.'); return JSON.stringify(item.document, null, 2); }
}
export class SessionPersistence {
  constructor(store, storage, onError = () => {}) {
    this.store = store; this.storage = storage; this.onError = onError; this.timer = null;
    this.unsubscribe = store.subscribe(() => { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 350); });
  }
  flush() { clearTimeout(this.timer); try { this.storage.setItem('syntakt-session-v2', JSON.stringify(encodePreset(this.store.state, 'Session', true))); } catch { this.onError('Der aktuelle Zustand konnte nicht lokal gespeichert werden.'); } }
  dispose() { this.flush(); this.unsubscribe(); }
}
export function loadSession(storage, fallback) {
  try {
    const raw = storage.getItem('syntakt-session-v2');
    if (raw) { const state = decodePreset(JSON.parse(raw)); state.parameters.freezeEnabled = false; return state; }
  } catch {}
  return { parameters: fallback() };
}
