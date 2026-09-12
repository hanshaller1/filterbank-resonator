import { wavefolderTransferCurve } from '../audio/AdditionalProcessors.js';
import { clipperTransfer } from '../audio/RealtimeKernel.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const db = value => 20 * Math.log10(Math.max(1e-6, value));
const theme = () => { const style = getComputedStyle(document.documentElement); return { grid: style.getPropertyValue('--border').trim() || '#303741', accent: style.getPropertyValue('--accent').trim() || '#eaa66c', meter: style.getPropertyValue('--meter').trim() || '#65c391', secondary: style.getPropertyValue('--analyzer-1').trim() || '#73a9c9', text: style.getPropertyValue('--text-secondary').trim() || '#9aa7b4' }; };

class CompactCanvas {
  constructor(canvas, output) { this.canvas = canvas; this.output = output; this.context = canvas?.getContext('2d'); }
  begin() {
    if (!this.context || !this.canvas?.isConnected || this.canvas.offsetParent === null) return null;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2), width = Math.max(180, this.canvas.clientWidth || 260), height = Math.max(100, this.canvas.clientHeight || 120);
    if (this.canvas.width !== width * ratio || this.canvas.height !== height * ratio) { this.canvas.width = width * ratio; this.canvas.height = height * ratio; }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0); this.context.clearRect(0, 0, width, height);
    return { ctx: this.context, width, height, colors: theme() };
  }
  axes(result) { const { ctx, width, height, colors } = result; ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, height / 2); ctx.lineTo(width - 8, height / 2); ctx.moveTo(width / 2, 8); ctx.lineTo(width / 2, height - 8); ctx.stroke(); }
}

export class WavefolderVisualization extends CompactCanvas {
  render(data, settings, enabled) {
    const result = this.begin(); if (!result) return;
    this.axes(result); const { ctx, width, height, colors } = result;
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(8, height - 8); ctx.lineTo(width - 8, 8); ctx.stroke(); ctx.setLineDash([]);
    const curve = data?.curve || wavefolderTransferCurve(settings);
    ctx.globalAlpha = enabled ? 1 : .4; ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath();
    curve.forEach(([input, output], index) => { const x = 8 + (input + 1) * .5 * (width - 16), y = 8 + (1 - clamp(output, -1, 1)) * .5 * (height - 16); if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.globalAlpha = 1;
  }
}

export class TransientVisualization extends CompactCanvas {
  constructor(canvas, output) { super(canvas, output); this.input = []; this.processed = []; this.settings = {}; }
  setSettings(settings) { this.settings = settings || {}; }
  resetUi() { this.input.length = 0; this.processed.length = 0; }
  render(metrics = {}, enabled = false) {
    this.input.push(clamp(metrics.input || 0, 0, 1.5)); this.processed.push(clamp(metrics.output || 0, 0, 1.5));
    if (this.input.length > 72) { this.input.shift(); this.processed.shift(); }
    if (this.output) this.output.value = `In ${db(metrics.input || 0).toFixed(1)} · Out ${db(metrics.output || 0).toFixed(1)} dBFS`;
    const result = this.begin(); if (!result) return; const { ctx, width, height, colors } = result;
    ctx.globalAlpha = enabled ? 1 : .4;
    const attackStrength = Math.min(1, Math.abs(this.settings.transientAttack || 0) / 100);
    const sustainStrength = Math.min(1, Math.abs(this.settings.transientSustain || 0) / 100);
    ctx.fillStyle = colors.accent; ctx.globalAlpha *= .06 + attackStrength * .18; ctx.fillRect(8, 18, (width - 16) * .28, height - 28);
    ctx.globalAlpha = (enabled ? 1 : .4) * (.04 + sustainStrength * .16); ctx.fillStyle = colors.secondary; ctx.fillRect(8 + (width - 16) * .28, 18, (width - 16) * .72, height - 28);
    ctx.globalAlpha = enabled ? 1 : .4;
    const draw = (values, color) => { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; values.forEach((value, i) => { const x = 8 + i / 71 * (width - 16), y = height - 8 - value / 1.5 * (height - 30); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); };
    draw(this.input, colors.secondary); draw(this.processed, colors.meter);
    ctx.fillStyle = colors.text; ctx.font = '10px system-ui'; ctx.fillText(`Attack ${this.settings.transientAttack ?? 0}%`, 10, 12); ctx.fillText(`Sustain ${this.settings.transientSustain ?? 0}%`, width * .45, 12);
    ctx.globalAlpha = 1;
  }
}

export class ClipperVisualization extends CompactCanvas {
  constructor(canvas, output) { super(canvas, output); this.reduction = []; this.settings = {}; }
  setSettings(settings) { this.settings = settings || {}; }
  resetUi() { this.reduction.length = 0; }
  render(metrics = {}, enabled = false) {
    const gr = enabled ? Math.max(0, metrics.reduction || 0) : 0; this.reduction.push(gr); if (this.reduction.length > 64) this.reduction.shift();
    if (this.output) this.output.value = `In ${db(metrics.input || 0).toFixed(1)} · Out ${db(metrics.output || 0).toFixed(1)} · GR ${gr.toFixed(1)} dB`;
    const result = this.begin(); if (!result) return; this.axes(result); const { ctx, width, height, colors } = result;
    const settings = { mode: this.settings.clipperMode, threshold: this.settings.clipperThreshold, amount: this.settings.clipperAmount, ceiling: this.settings.clipperCeiling };
    ctx.globalAlpha = enabled ? 1 : .4; ctx.strokeStyle = colors.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let index = 0; index <= 128; index++) { const input = index / 64 - 1, output = clipperTransfer(input, settings), x = 8 + index / 128 * (width - 16), y = 8 + (1 - output) * .5 * (height - 30); if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    const inPeak = clamp(metrics.input || 0, 0, 1), outPeak = clamp(metrics.output || 0, 0, 1); ctx.fillStyle = colors.meter; ctx.beginPath(); ctx.arc(8 + (inPeak + 1) * .5 * (width - 16), 8 + (1 - outPeak) * .5 * (height - 30), 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = colors.meter; ctx.beginPath(); this.reduction.forEach((value, i) => { const x = 8 + i / 63 * (width - 16), y = height - 3 - Math.min(12, value) / 12 * 14; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
  }
}
