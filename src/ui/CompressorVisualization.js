export class CompressorVisualization {
  constructor(canvas, output) { this.canvas = canvas; this.output = output; this.context = canvas?.getContext('2d'); this.settings = null; this.last = ''; }
  setSettings(settings) { this.settings = settings; }
  render(reduction = 0, enabled = false) {
    const s = this.settings; if (!s || !this.context || !this.canvas) return;
    const gr = enabled && Number.isFinite(reduction) ? Math.max(0, reduction) : 0;
    if (this.output) this.output.value = `GR: -${gr.toFixed(1)} dB`;
    if (!this.canvas.isConnected || this.canvas.offsetParent === null) return;
    const scale = globalThis.devicePixelRatio || 1, width = Math.max(180, this.canvas.clientWidth || 260), height = Math.max(100, this.canvas.clientHeight || 120), theme = document.documentElement.dataset.theme || '';
    const key = `${s.compressorThreshold}:${s.compressorRatio}:${gr.toFixed(2)}:${enabled}:${width}:${height}:${scale}:${theme}`;
    if (key === this.last) return; this.last = key;
    if (this.canvas.width !== width * scale || this.canvas.height !== height * scale) { this.canvas.width = width * scale; this.canvas.height = height * scale; }
    const ctx = this.context; ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement), grid = css.getPropertyValue('--border').trim() || '#303741', accent = css.getPropertyValue('--accent').trim() || '#eaa66c', meter = css.getPropertyValue('--meter').trim() || '#65c391';
    const margin = 10, xFor = db => margin + (db + 60) / 60 * (width - margin * 2), yFor = db => height - margin - (db + 60) / 60 * (height - margin * 2);
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(margin, height - margin); ctx.lineTo(width - margin, margin); ctx.stroke();
    const threshold = s.compressorThreshold, ratio = Math.max(1, s.compressorRatio);
    ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xFor(threshold), margin); ctx.lineTo(xFor(threshold), height - margin); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = enabled ? 1 : .4; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let db = -60; db <= 0; db += 1) { const out = db <= threshold ? db : threshold + (db - threshold) / ratio; const x = xFor(db), y = yFor(out); if (db === -60) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    const reductionHeight = Math.min(1, gr / 24) * (height - margin * 2);
    ctx.fillStyle = meter; ctx.fillRect(width - margin - 4, height - margin - reductionHeight, 4, reductionHeight); ctx.globalAlpha = 1;
  }
}
