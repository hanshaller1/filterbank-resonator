const VIEW_TYPES = new Set(['waveform', 'spectrum', 'spectrogram', 'dynamics', 'gainReduction', 'response', 'transient']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class FloatingWindowController {
  constructor({ panel, handle, openButton, closeButton, minimizeButton, selector, storageKey = 'syntakt-analyzer-window-v1', defaultOpen = true }) {
    this.panel = panel;
    this.handle = handle;
    this.openButton = openButton;
    this.closeButton = closeButton;
    this.minimizeButton = minimizeButton;
    this.selector = selector;
    this.storageKey = storageKey;
    this.defaultOpen = defaultOpen;
    this.events = new AbortController();
    this.drag = null;
    this.state = this.loadState();

    this.applyState();
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.state.open && !this.state.minimized) {
          this.clampSize();
          this.saveState();
        }
      });
      this.resizeObserver.observe(this.panel);
    }
    this.handle.addEventListener('pointerdown', event => this.startDrag(event), { signal: this.events.signal });
    this.handle.addEventListener('pointermove', event => this.moveDrag(event), { signal: this.events.signal });
    this.handle.addEventListener('pointerup', event => this.endDrag(event), { signal: this.events.signal });
    this.handle.addEventListener('pointercancel', event => this.endDrag(event), { signal: this.events.signal });
    this.closeButton.addEventListener('click', () => this.close(), { signal: this.events.signal });
    this.openButton.addEventListener('click', () => this.open(), { signal: this.events.signal });
    this.minimizeButton.addEventListener('click', () => this.toggleMinimize(), { signal: this.events.signal });
    this.selector.addEventListener('change', () => this.saveState(), { signal: this.events.signal });
    window.addEventListener('resize', () => { this.clampPosition(); this.clampSize(); this.saveState(); }, { signal: this.events.signal });
  }

  loadState() {
    const fallback = {
      open: this.defaultOpen,
      minimized: false,
      left: Math.max(16, window.innerWidth - 640),
      top: 24,
      width: 600,
      height: 400,
      mode: 'spectrum'
    };
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      if (!stored || typeof stored !== 'object') return fallback;
      return {
        ...fallback,
        open: stored.open !== false,
        minimized: stored.minimized === true,
        left: Number.isFinite(stored.left) ? stored.left : fallback.left,
        top: Number.isFinite(stored.top) ? stored.top : fallback.top,
        width: Number.isFinite(stored.width) ? stored.width : fallback.width,
        height: Number.isFinite(stored.height) ? stored.height : fallback.height,
        mode: VIEW_TYPES.has(stored.mode) ? stored.mode : fallback.mode
      };
    } catch {
      return fallback;
    }
  }

  applyState() {
    this.selector.value = this.state.mode;
    this.panel.style.width = `${this.state.width}px`;
    this.panel.style.height = `${this.state.height}px`;
    this.panel.style.left = `${this.state.left}px`;
    this.panel.style.top = `${this.state.top}px`;
    this.panel.classList.toggle('is-hidden', !this.state.open);
    this.panel.classList.toggle('is-minimized', this.state.minimized);
    this.openButton.hidden = this.state.open;
    this.updateMinimizeButton();
    this.clampPosition();
    this.clampSize();
  }

  open() {
    this.state.open = true;
    this.panel.classList.remove('is-hidden');
    this.openButton.hidden = true;
    this.clampPosition();
    this.clampSize();
    this.saveState();
  }

  close() {
    this.state.open = false;
    this.panel.classList.add('is-hidden');
    this.openButton.hidden = false;
    this.saveState();
  }

  toggleMinimize() {
    this.state.minimized = !this.state.minimized;
    this.panel.classList.toggle('is-minimized', this.state.minimized);
    if (!this.state.minimized) {
      this.panel.style.width = `${this.state.width}px`;
      this.panel.style.height = `${this.state.height}px`;
      this.clampPosition();
      this.clampSize();
    }
    this.updateMinimizeButton();
    this.saveState();
  }

  updateMinimizeButton() {
    const chevron = this.minimizeButton.querySelector('.analyzer-chevron');
    if (chevron) chevron.classList.toggle('is-collapsed', this.state.minimized);
    else this.minimizeButton.textContent = this.state.minimized ? '□' : '—';
    this.minimizeButton.setAttribute('aria-label', this.state.minimized ? 'Analyzer wiederherstellen' : 'Analyzer minimieren');
    this.minimizeButton.title = this.state.minimized ? 'Wiederherstellen' : 'Minimieren';
  }

  startDrag(event) {
    if (event.button !== 0 || event.target.closest('button, select, input, option')) return;
    const rect = this.panel.getBoundingClientRect();
    this.panel.style.left = `${rect.left}px`;
    this.panel.style.top = `${rect.top}px`;
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
    this.drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    this.handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const left = event.clientX - this.drag.offsetX;
    const top = event.clientY - this.drag.offsetY;
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.clampPosition();
  }

  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    try { this.handle.releasePointerCapture(event.pointerId); } catch {}
    this.saveState();
  }

  clampPosition() {
    if (this.state.open === false) return;
    const rect = this.panel.getBoundingClientRect();
    const minVisibleWidth = Math.min(180, rect.width);
    const minVisibleHeight = Math.min(42, rect.height);
    const left = clamp(rect.left, 0, Math.max(0, window.innerWidth - minVisibleWidth));
    const top = clamp(rect.top, 0, Math.max(0, window.innerHeight - minVisibleHeight));
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
    this.state.left = left;
    this.state.top = top;
  }

  clampSize() {
    if (this.state.open === false || this.state.minimized) return;
    const padding = 12;
    const minWidth = Math.min(420, Math.max(240, window.innerWidth - padding * 2));
    const minHeight = Math.min(360, Math.max(220, window.innerHeight - padding * 2));
    const rect = this.panel.getBoundingClientRect();
    const left = clamp(rect.left, padding, Math.max(padding, window.innerWidth - minWidth - padding));
    const top = clamp(rect.top, padding, Math.max(padding, window.innerHeight - minHeight - padding));
    if (Math.abs(left - rect.left) > 0.5) this.panel.style.left = `${left}px`;
    if (Math.abs(top - rect.top) > 0.5) this.panel.style.top = `${top}px`;
    this.state.left = left;
    this.state.top = top;

    const maxWidth = Math.max(minWidth, window.innerWidth - left - padding);
    const maxHeight = Math.max(minHeight, window.innerHeight - top - padding);
    const width = clamp(rect.width, minWidth, maxWidth);
    const height = clamp(rect.height, minHeight, maxHeight);
    if (Math.abs(width - rect.width) > 0.5) this.panel.style.width = `${width}px`;
    if (Math.abs(height - rect.height) > 0.5) this.panel.style.height = `${height}px`;
  }

  dispose() { this.events.abort(); this.resizeObserver?.disconnect(); this.drag = null; }
  isVisible() { return this.state.open && !this.state.minimized; }
  isOpen() { return this.state.open; }

  saveState() {
    if (this.state.open && !this.state.minimized && !this.panel.classList.contains('is-hidden')) {
      const rect = this.panel.getBoundingClientRect();
      this.state.left = rect.left;
      this.state.top = rect.top;
      this.state.width = rect.width;
      this.state.height = rect.height;
    }
    this.state.mode = this.selector.value;
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)); } catch {}
  }
}
