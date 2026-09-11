export class SnapshotPanel {
  constructor(store, root) {
    this.store = store; this.root = root; this.events = new AbortController();
    root.innerHTML = '<div class="panel-title"><h2>A/B Snapshots</h2><span>Typen und Reihenfolge wechseln bei 50 %</span></div><div class="snapshot-controls"><div><button type="button" data-snapshot="store-a">Store A</button><button type="button" data-snapshot="recall-a">Recall A</button></div><label>Morph A ↔ B <output data-morph-value>0 %</output><input data-morph type="range" min="0" max="1000" value="0" aria-label="Morph A nach B"></label><div><button type="button" data-snapshot="recall-b">Recall B</button><button type="button" data-snapshot="store-b">Store B</button></div></div>';
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-snapshot]')?.dataset.snapshot;
      if (!action) return;
      const [operation, slot] = action.split('-');
      if (operation === 'store') store.storeSnapshot(slot); else store.recallSnapshot(slot);
    }, { signal: this.events.signal });
    root.querySelector('[data-morph]').addEventListener('input', event => store.setMorph(Number(event.target.value) / 1000), { signal: this.events.signal });
    this.unsubscribe = store.subscribe(() => this.render()); this.render();
  }
  render() {
    const s = this.store.state;
    for (const slot of ['a', 'b']) {
      this.root.querySelector('[data-snapshot="recall-' + slot + '"]').disabled = !s.snapshots[slot];
      this.root.querySelector('[data-snapshot="store-' + slot + '"]').classList.toggle('saved', Boolean(s.snapshots[slot]));
    }
    const slider = this.root.querySelector('[data-morph]');
    slider.disabled = !s.snapshots.a || !s.snapshots.b; slider.value = s.morph * 1000;
    this.root.querySelector('[data-morph-value]').value = Math.round(s.morph * 100) + ' %';
  }
  dispose() { this.events.abort(); this.unsubscribe(); }
}
