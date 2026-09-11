import { ControlKernel, bindingValue } from '../../control/ControlKernel.js';
class ControlProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.kernel = new ControlKernel(sampleRate); this.bindings = []; this.fallbackTargets = []; this.alive = true; this.tick = 0; this.visualFrames = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'dispose') { this.alive = false; this.port.close(); return; }
      if (data.type === 'tempo') { this.kernel.tempo = Math.min(240, Math.max(40, data.bpm || 120)); return; }
      if (data.type !== 'config') return;
      this.revision = data.revision;
      this.kernel.configure(data.parameters, data.modulation);
      this.fallbackTargets = Array.isArray(data.fallbackTargets) ? data.fallbackTargets : [];
      for (const b of data.bindings || []) if (!this.bindings[b.slot]) this.bindings[b.slot] = { ...b, current: b.anchor, desired: b.anchor, coefficient: 1 - Math.exp(-1 / (sampleRate * (b.smoothing || .025))) };
      this.tick = 0;
    };
  }
  process(inputs, outputs) {
    if (!this.alive) return false;
    const length = outputs[0]?.[0]?.length || 128, input = inputs[0];
    for (let i = 0; i < length; i++) {
      this.kernel.sample(input?.[0]?.[i] || 0, input?.[1]?.[i] ?? input?.[0]?.[i] ?? 0);
      if (this.tick++ % 16 === 0) {
        const values = this.kernel.evaluate();
        for (const b of this.bindings) if (b) b.desired = bindingValue(b, values, this.kernel.parameters);
      }
      for (const b of this.bindings) if (b) {
        b.current += (b.desired - b.current) * b.coefficient;
        outputs[Math.floor(b.slot / 32)][b.slot % 32][i] = Number.isFinite(b.current) ? b.current - b.anchor : 0;
      }
    }
    this.visualFrames += length;
    if (this.visualFrames >= sampleRate / 40) {
      this.visualFrames = 0;
      const visual = this.kernel.visualState();
      visual.fallbackValues = Object.fromEntries(this.fallbackTargets.map(target => [target, this.kernel.values[target]]).filter(([, value]) => Number.isFinite(value)));
      this.port.postMessage?.({ type: 'visuals', revision: this.revision, value: visual });
    }
    return true;
  }
}
registerProcessor('syntakt-control', ControlProcessor);
