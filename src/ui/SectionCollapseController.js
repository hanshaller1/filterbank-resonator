const STORAGE_KEY = 'syntakt-ui-layout-v1';
const REMOVED_KEYS = new Set(['lfo1', 'lfo2', 'envelope1', 'envelope2']);

const readLayout = storage => {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    for (const key of REMOVED_KEYS) delete value[key];
    return value;
  } catch { return {}; }
};

const isInteractive = target => Boolean(target.closest('button, input, select, textarea, label, a, summary, [tabindex]'));

export class SectionCollapseController {
  constructor(root = document, storage = localStorage) {
    this.root = root; this.storage = storage; this.layout = readLayout(storage); this.items = new Map();
    // Rewrite legacy layouts once so removed per-source collapse states do not
    // survive in persistence while the parent Modulation state remains intact.
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.layout)); } catch {}
    this.events = new AbortController();
    this.scan();
    this.root.addEventListener('click', event => {
      const action = event.target.closest('[data-section-action]')?.dataset.sectionAction;
      if (action === 'collapse-processing') this.setProcessing(false);
      if (action === 'expand-processing') this.setProcessing(true);
      if (action === 'collapse-all-sections') this.setAll(false);
      if (action === 'expand-all-sections') this.setAll(true);
    }, { signal: this.events.signal });
  }

  scan() {
    for (const element of this.root.querySelectorAll('[data-collapse-section], [data-collapsible]')) this.register(element);
  }

  register(element) {
    if (this.items.has(element)) return this.items.get(element);
    const key = element.dataset.collapseKey || element.dataset.collapseSection || `processing:${element.dataset.collapsible}`;
    element.dataset.collapseKey = key;
    element.classList.add('section-collapsible');
    const header = element.querySelector(':scope > .section-header, :scope > .panel-title, :scope > .meter-panel-title, :scope > .module-header, :scope > .subsection-header');
    let content = element.querySelector(':scope > .section-content, :scope > .module-content, :scope > .subsection-content');
    let toggle = header?.querySelector(':scope > .section-toggle, :scope > .module-toggle');

    if (!header && element.matches('fieldset')) {
      const legend = element.querySelector(':scope > legend');
      if (!legend) return null;
      toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'section-toggle fieldset-toggle';
      toggle.innerHTML = `<span>${legend.textContent.trim()}</span><span class="collapse-chevron" aria-hidden="true"></span>`;
      legend.replaceWith(toggle);
      this.prepareToggle(toggle, key, element);
      const controls = [...element.children].filter(child => child !== toggle);
      const content = document.createElement('div'); content.className = 'section-content'; content.id = `collapse-content-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
      controls.forEach(control => content.append(control)); element.append(content);
      const item = { element, header: toggle, content, controls: null, key, fieldset: true };
      this.items.set(element, item); this.apply(item); return item;
    }

    if (!header) return null;
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'section-toggle';
      const heading = header.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > strong');
      toggle.innerHTML = '<span class="collapse-chevron" aria-hidden="true"></span>';
      toggle.setAttribute('aria-label', `${heading?.textContent || element.dataset.collapseSection || 'Section'} auf- oder zuklappen`);
      header.append(toggle);
      if (heading) heading.classList.add('section-heading');
    } else if (!toggle.querySelector('.collapse-chevron')) {
      const chevron = document.createElement('span'); chevron.className = 'collapse-chevron'; chevron.setAttribute('aria-hidden', 'true'); toggle.append(chevron);
    }
    if (!content) {
      content = document.createElement('div'); content.className = 'section-content';
      const children = [...element.children].filter(child => child !== header);
      children.forEach(child => content.append(child)); element.append(content);
    }
    if (content.id) toggle.setAttribute('aria-controls', content.id);
    this.prepareToggle(toggle, key, element);
    const item = { element, header, content, controls: null, key, fieldset: false };
    this.items.set(element, item); this.apply(item);
    header.addEventListener('click', event => {
      if (event.target === toggle || event.target.closest('.section-toggle')) return;
      if (isInteractive(event.target)) return;
      this.toggle(item);
    }, { signal: this.events.signal });
    return item;
  }

  prepareToggle(toggle, key, element) {
    toggle.setAttribute('aria-controls', `collapse-content-${key.replace(/[^a-z0-9_-]/gi, '-')}`);
    toggle.addEventListener('click', event => { event.stopPropagation(); this.toggle(this.items.get(element)); }, { signal: this.events.signal });
  }

  apply(item) {
    if (!item) return;
    const open = this.layout[item.key] !== false;
    item.element.classList.toggle('is-collapsed', !open);
    if (item.content) { item.content.id = item.content.id || `collapse-content-${item.key.replace(/[^a-z0-9_-]/gi, '-')}`; item.content.hidden = !open; }
    if (item.controls) item.controls.forEach(control => { control.hidden = !open; });
    const toggle = item.header.matches('button') ? item.header : item.header.querySelector(':scope > .section-toggle, :scope > .module-toggle');
    toggle?.setAttribute('aria-expanded', String(open));
    if (item.content) toggle?.setAttribute('aria-controls', item.content.id);
  }

  toggle(item) { if (!item) return; this.layout[item.key] = item.element.classList.contains('is-collapsed'); this.persist(); this.apply(item); }
  setItem(item, open) { if (!item) return; this.layout[item.key] = Boolean(open); this.apply(item); }
  setProcessing(open) {
    for (const item of this.items.values()) if (item.element.matches('[data-collapsible]')) this.layout[item.key] = Boolean(open);
    this.persist(); for (const item of this.items.values()) if (item.element.matches('[data-collapsible]')) this.apply(item);
  }
  setAll(open) { for (const item of this.items.values()) this.layout[item.key] = Boolean(open); this.persist(); for (const item of this.items.values()) this.apply(item); }
  persist() { try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.layout)); } catch {} }
  dispose() { this.events.abort(); this.items.clear(); }
}

export { STORAGE_KEY };
