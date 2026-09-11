export class DriveCurveVisualization {
  constructor(canvas) { this.canvas = canvas; this.context = canvas?.getContext('2d'); this.lastKey = ''; }
  render(data, enabled = true) {
    if (!this.context || !this.canvas) return;
    if (!this.canvas.isConnected || this.canvas.offsetParent === null) return;
    const scale = globalThis.devicePixelRatio || 1, width = Math.max(220, this.canvas.clientWidth || 320), height = Math.max(100, this.canvas.clientHeight || 120);
    const theme = document.documentElement.dataset.theme || '';
    const key = data ? `${data.character}:${data.amount.toFixed(4)}:${data.bias.toFixed(3)}:${data.shape.toFixed(3)}:${enabled}:${width}:${height}:${scale}:${theme}` : `empty:${width}:${height}:${scale}:${theme}`;
    if (key === this.lastKey) return; this.lastKey = key;
    if (this.canvas.width !== width * scale || this.canvas.height !== height * scale) { this.canvas.width = width * scale; this.canvas.height = height * scale; }
    const ctx = this.context; ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement), grid = css.getPropertyValue('--border').trim() || '#303741', accent = css.getPropertyValue('--accent').trim() || '#eaa66c';
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(width / 2, 8); ctx.lineTo(width / 2, height - 8); ctx.moveTo(8, height / 2); ctx.lineTo(width - 8, height / 2); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(8, height - 8); ctx.lineTo(width - 8, 8); ctx.stroke(); ctx.setLineDash([]);
    if (!data?.curve) return;
    ctx.globalAlpha = enabled ? 1 : .4; ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < data.curve.length; i += 2) {
      const x = 8 + (data.curve[i] + 1) * .5 * (width - 16), y = 8 + (1 - (data.curve[i + 1] + 1) * .5) * (height - 16);
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
}
