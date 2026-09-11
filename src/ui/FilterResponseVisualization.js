const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const FORMANTS = [
  [[800, 1.0], [1150, .72], [2900, .46], [3900, .30], [4950, .18]],
  [[400, 1.0], [1700, .76], [2300, .50], [3200, .32], [4500, .18]],
  [[350, 1.0], [2000, .78], [2800, .54], [3800, .34], [4950, .20]],
  [[450, 1.0], [800, .72], [2830, .48], [3800, .31], [4950, .18]],
  [[325, 1.0], [700, .74], [2530, .48], [3500, .30], [4950, .17]]
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const db = value => 20 * Math.log10(Math.max(value, 0.0001));

function biquadMagnitude(type, frequency, cutoff, q) {
  const ratio = frequency / Math.max(cutoff, MIN_FREQUENCY);
  const denominator = Math.sqrt((1 - ratio * ratio) ** 2 + (ratio / q) ** 2);
  if (type === 'lowpass') return 1 / denominator;
  if (type === 'highpass') return ratio * ratio / denominator;
  if (type === 'bandpass') return (ratio / q) / denominator;
  if (type === 'notch') return Math.abs(1 - ratio * ratio) / denominator;
  return 1;
}

function interpolateFormants(position) {
  const location = clamp(position, 0, 1) * 4;
  const index = Math.min(3, Math.floor(location));
  const blend = location - index;
  return FORMANTS[0].map((_, band) => [
    FORMANTS[index][band][0] + (FORMANTS[index + 1][band][0] - FORMANTS[index][band][0]) * blend,
    FORMANTS[index][band][1] + (FORMANTS[index + 1][band][1] - FORMANTS[index][band][1]) * blend
  ]);
}

export function filterResponseAt(type, frequency, settings) {
  const cutoff = settings.cutoff;
  const q = clamp(settings.resonance, .1, 12);
  if (type === 'allpass') return { value: -Math.atan2(frequency / cutoff / q, 1 - (frequency / cutoff) ** 2) * 360 / Math.PI, phase: true };
  if (['lowpass', 'highpass', 'bandpass', 'notch'].includes(type)) return { value: db(biquadMagnitude(type, frequency, cutoff, q)) };
  if (type === 'peak') {
    const width = clamp(1.8 / Math.sqrt(q), .16, 1.8);
    const distance = Math.log2(frequency / Math.max(cutoff, MIN_FREQUENCY));
    return { value: settings.filterPeakGain * Math.exp(-0.5 * (distance / width) ** 2) };
  }
  if (type === 'feedforwardComb') {
    const delay = clamp(1 / Math.max(cutoff, MIN_FREQUENCY), .00015, .05);
    const amount = .12 + q / 12 * .62;
    return { value: db(Math.sqrt(1 + amount * amount + 2 * amount * Math.cos(2 * Math.PI * frequency * delay))) - 2 };
  }
  if (type === 'feedbackComb') {
    const delay = clamp(1 / Math.max(cutoff, MIN_FREQUENCY), .00015, .05);
    const feedback = .12 + q / 12 * .72;
    return { value: clamp(db(1 / Math.sqrt(1 + feedback * feedback - 2 * feedback * Math.cos(2 * Math.PI * frequency * delay))) - 1.5, -18, 18) };
  }
  const formants = interpolateFormants(settings.filterPosition);
  const sharpness = 1.2 + q / 12 * 10;
  const magnitude = formants.reduce((sum, [center, amplitude]) => {
    const distance = Math.log2(frequency / center);
    return sum + amplitude * Math.exp(-0.5 * (distance * sharpness) ** 2);
  }, .08);
  return { value: clamp(db(magnitude) - 5, -18, 18) };
}

export class FilterResponseVisualization {
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
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    const ctx = this.context;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, width, height);
    const pad = { left: 42, right: 16, top: 20, bottom: 25 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const type = this.settings.filterType;
    const phase = type === 'allpass';
    const minDb = phase ? -360 : -24;
    const maxDb = phase ? 0 : 12;
    const x = frequency => pad.left + (Math.log10(frequency / MIN_FREQUENCY) / Math.log10(MAX_FREQUENCY / MIN_FREQUENCY)) * plotWidth;
    const y = value => pad.top + (maxDb - clamp(value, minDb, maxDb)) / (maxDb - minDb) * plotHeight;
    ctx.font = '10px system-ui, sans-serif'; ctx.lineWidth = 1;
    ctx.strokeStyle = '#26313c'; ctx.fillStyle = '#748392';
    for (const value of [...new Set([minDb, 0, maxDb])]) { ctx.beginPath(); ctx.moveTo(pad.left, y(value)); ctx.lineTo(width - pad.right, y(value)); ctx.stroke(); ctx.fillText(`${value > 0 ? '+' : ''}${value} ${phase ? '°' : 'dB'}`, 6, y(value) + 3); }
    for (const frequency of [20, 100, 1000, 10000, 20000]) { const px = x(frequency); ctx.beginPath(); ctx.moveTo(px, pad.top); ctx.lineTo(px, height - pad.bottom); ctx.stroke(); ctx.fillText(frequency >= 1000 ? `${frequency / 1000}k` : frequency, px - 10, height - 7); }
    ctx.strokeStyle = '#e0a56b'; ctx.lineWidth = 2; ctx.beginPath();
    for (let index = 0; index <= 320; index += 1) {
      const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, index / 320);
      const point = filterResponseAt(type, frequency, this.settings);
      const px = x(frequency); const py = y(point.value);
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = '#9aa7b4'; ctx.fillText(phase ? 'Phase response (approx.)' : 'Magnitude response · Näherung', pad.left, 12);
  }
}
