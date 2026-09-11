const EQ_TYPES = ['shelf2', 'tone3', 'tilt', 'graphic5'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function configureFilter(filter, type, frequency, q = 1) {
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
}

export class EQProcessor {
  constructor(audioContext) {
    this.context = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.bypassGain = audioContext.createGain();
    this.paths = new Map();
    this.settings = { type: 'tone3', low: 0, mid: 0, high: 0, tilt: 0, graphic: [0, 0, 0, 0, 0], bypass: false };

    this.addPath('shelf2', [this.createShelf(100, 'low'), this.createShelf(8000, 'high')]);
    this.addPath('tone3', [this.createShelf(100, 'low'), this.createPeak(1000), this.createShelf(8000, 'high')]);
    this.addPath('tilt', [this.createShelf(100, 'low'), this.createShelf(8000, 'high')]);
    this.addPath('graphic5', [80, 250, 800, 2500, 8000].map(frequency => this.createPeak(frequency, 1)));
    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);
    this.update(this.settings);
  }

  createShelf(frequency, side) {
    const filter = this.context.createBiquadFilter();
    configureFilter(filter, side === 'low' ? 'lowshelf' : 'highshelf', frequency);
    return filter;
  }

  createPeak(frequency, q = 1.1) {
    const filter = this.context.createBiquadFilter();
    configureFilter(filter, 'peaking', frequency, q);
    return filter;
  }

  addPath(type, filters) {
    const pathGain = this.context.createGain();
    let previous = this.input;
    filters.forEach(filter => { previous.connect(filter); previous = filter; });
    previous.connect(pathGain);
    pathGain.connect(this.output);
    this.paths.set(type, { filters, pathGain });
  }

  connect(destination) { this.output.connect(destination); }

  disconnect() { try { this.output.disconnect(); } catch {} }

  update({ type = 'tone3', low = 0, mid = 0, high = 0, tilt = 0, graphic = [0, 0, 0, 0, 0], bypass = false } = {}) {
    const safeType = EQ_TYPES.includes(type) ? type : 'tone3';
    const now = this.context.currentTime;
    const timeConstant = 0.025;
    const gains = {
      shelf2: [low, high],
      tone3: [low, mid, high],
      tilt: [-clamp(tilt, -6, 6), clamp(tilt, -6, 6)],
      graphic5: graphic.slice(0, 5).map(value => clamp(Number(value) || 0, -12, 12))
    };
    for (const [pathType, path] of this.paths) {
      const pathGains = gains[pathType];
      path.filters.forEach((filter, index) => filter.gain.setTargetAtTime(pathGains[index] || 0, now, timeConstant));
      path.pathGain.gain.setTargetAtTime(!bypass && pathType === safeType ? 1 : 0, now, timeConstant);
    }
    this.bypassGain.gain.setTargetAtTime(bypass ? 1 : 0, now, timeConstant);
    this.settings = { type: safeType, low, mid, high, tilt, graphic: [...graphic], bypass };
  }
}
