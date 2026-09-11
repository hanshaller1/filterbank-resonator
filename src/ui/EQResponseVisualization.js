const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const shelf = (frequency, transition, gain, low) => gain * (low ? 1 / (1 + Math.pow(frequency / transition, 2)) : 1 / (1 + Math.pow(transition / frequency, 2)));
const bell = (frequency, center, gain, width = 1.2) => gain * Math.exp(-0.5 * (Math.log2(frequency / center) / width) ** 2);

export function eqResponseAt(frequency, settings) {
  if (settings.eqType === 'shelf2') return shelf(frequency, 100, settings.eqLow, true) + shelf(frequency, 8000, settings.eqHigh, false);
  if (settings.eqType === 'tone3') return shelf(frequency, 100, settings.eqLow, true) + bell(frequency, 1000, settings.eqMid, 1.25) + shelf(frequency, 8000, settings.eqHigh, false);
  if (settings.eqType === 'tilt') return clamp(settings.eqTilt * Math.log2(frequency / 1000) / 4, -12, 12);
  return [80, 250, 800, 2500, 8000].reduce((sum, center, index) => sum + bell(frequency, center, settings.eqGraphic[index] || 0, 1), 0);
}

export class EQResponseVisualization {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.settings = null;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  dispose() { this.resizeObserver?.disconnect(); }
  render(settings) { this.settings = settings; this.draw(); }

  draw() {
    if (!this.settings || !this.canvas.clientWidth) return;
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight || 150;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    const ctx = this.context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, width, height);
    const pad = { left: 42, right: 16, top: 20, bottom: 25 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = frequency => pad.left + Math.log10(frequency / MIN_FREQUENCY) / Math.log10(MAX_FREQUENCY / MIN_FREQUENCY) * plotWidth;
    const y = value => pad.top + (12 - clamp(value, -18, 12)) / 30 * plotHeight;
    ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = '#26313c'; ctx.fillStyle = '#748392';
    for (const value of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(pad.left, y(value)); ctx.lineTo(width - pad.right, y(value)); ctx.stroke(); ctx.fillText(`${value > 0 ? '+' : ''}${value} dB`, 6, y(value) + 3); }
    for (const frequency of [20, 100, 1000, 10000, 20000]) { const px = x(frequency); ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, height - pad.bottom); ctx.stroke(); ctx.fillText(frequency >= 1000 ? `${frequency / 1000}k` : frequency, px - 10, height - 7); }
    ctx.strokeStyle = '#76b7e8'; ctx.lineWidth = 2; ctx.beginPath();
    for (let index = 0; index <= 320; index += 1) { const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, index / 320); const px = x(frequency); const py = y(eqResponseAt(frequency, this.settings)); if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = '#9aa7b4'; ctx.fillText('EQ response · Näherung', pad.left, 12);
  }
}
