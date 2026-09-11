import { MODULES } from '../state/parameters.js';
export class ProcessingList {
  constructor(store, engine) {
    this.store = store; this.engine = engine;
    this.root = document.querySelector('.controls');
    this.items = new Map([...this.root.querySelectorAll('[data-collapsible]')].map(e => [e.dataset.collapsible, e]));
    this.events = new AbortController();
    this.dragged = null;
    this.selected = new Set();
    for (const [id, element] of this.items) {
      const controls = document.createElement('div'); controls.className = 'module-order';
      const handle = document.createElement('button'); handle.type = 'button'; handle.textContent = '⠿'; handle.draggable = true;
      handle.title = 'Modul verschieben'; handle.setAttribute('aria-label', MODULES.find(m => m.id === id).displayName + ' verschieben');
      controls.append(handle);
      for (const [label, direction] of [['↑', -1], ['↓', 1]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.dataset.direction = direction; button.setAttribute('aria-label', direction < 0 ? 'Modul nach oben' : 'Modul nach unten');
        button.addEventListener('click', () => this.move(id, direction), { signal: this.events.signal }); controls.append(button);
      }
      element.querySelector('.module-header').prepend(controls);
      handle.addEventListener('dragstart', event => { this.dragged = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; element.classList.add('is-dragging'); }, { signal: this.events.signal });
      handle.addEventListener('dragend', () => { this.dragged = null; element.classList.remove('is-dragging'); }, { signal: this.events.signal });
      element.addEventListener('dragover', event => { if (this.dragged) event.preventDefault(); }, { signal: this.events.signal });
      element.addEventListener('drop', event => {
        if (!this.dragged || this.dragged === id) return;
        event.preventDefault();
        const order = [...this.store.state.order].filter(item => item !== this.dragged);
        const rect = element.getBoundingClientRect();
        order.splice(order.indexOf(id) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0), 0, this.dragged);
        this.store.setOrder(order);
      }, { signal: this.events.signal });
      element.addEventListener('focusin', () => this.select(id), { signal: this.events.signal });
      element.addEventListener('pointerdown', event => { if (!event.target.closest('.module-order')) this.select(id); }, { signal: this.events.signal });
    }
    document.getElementById('processingDeselectAll')?.addEventListener('click', () => this.deselectAll(), { signal: this.events.signal });
    this.unsubscribe = store.subscribe(() => this.render());
    engine.onRoutingChange = () => this.render();
    this.render();
  }
  move(id, direction) {
    const order = [...this.store.state.order], from = order.indexOf(id), to = from + direction;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.store.setOrder(order);
  }
  select(id) {
    if (!this.items.has(id)) return;
    this.selected.add(id);
    const element = this.items.get(id); element.classList.add('is-selected'); element.setAttribute('aria-selected', 'true');
  }
  deselectAll() {
    this.selected.clear();
    for (const element of this.items.values()) { element.classList.remove('is-selected'); element.setAttribute('aria-selected', 'false'); }
  }
  render() {
    // While a fade is pending the UI still shows the currently connected graph.
    const order = this.engine.nodes?.registry.order || this.store.state.order;
    const key = order.join(); if (key === this.renderedOrder) return; this.renderedOrder = key;
    const anchor = this.root.querySelector('.switch-row');
    const host = anchor?.parentElement || this.root;
    order.forEach((id, i) => {
      const element = this.items.get(id); host.insertBefore(element, anchor);
      element.querySelector('[data-direction="-1"]').disabled = i === 0;
      element.querySelector('[data-direction="1"]').disabled = i === order.length - 1;
    });
    this.root.querySelector('.panel-title span').textContent = order.map(id => MODULES.find(m => m.id === id).displayName.split(' / ')[0]).join(' → ');
  }
  dispose() { this.events.abort(); this.unsubscribe(); this.engine.onRoutingChange = () => {}; }
}
