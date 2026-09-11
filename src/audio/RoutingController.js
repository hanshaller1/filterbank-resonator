// Only an explicit routing change performs disconnect/reconnect. Node instances survive.
// A short audio-clock fade protects the serial graph while its edges are exchanged.
export class RoutingController {
  constructor(context, registry, gate) {
    this.context = context; this.registry = registry; this.gate = gate;
    this.pending = null; this.task = null; this.disposed = false; this.timer = null; this.finishWait = null;
    this.onChange = () => {};
  }
  request(order) {
    if (this.disposed) return Promise.resolve();
    this.pending = [...order];
    if (!this.task) this.task = this.drain().finally(() => { this.task = null; if (this.pending && !this.disposed) this.request(this.pending); });
    return this.task;
  }
  waitForAudioTime(endTime) {
    return new Promise(resolve => {
      this.finishWait = resolve;
      const poll = () => {
        if (this.disposed || this.context.state !== 'running' || this.context.currentTime >= endTime) {
          this.finishWait = null; resolve(); return;
        }
        this.timer = setTimeout(poll, 5);
      };
      poll();
    });
  }
  async drain() {
    while (this.pending && !this.disposed) {
      if (this.pending.join() === this.registry.order.join()) { this.pending = null; continue; }
      const gain = this.gate.gain, now = this.context.currentTime;
      gain.cancelAndHoldAtTime(now);
      gain.linearRampToValueAtTime(0, now + .015);
      await this.waitForAudioTime(now + .018);
      if (this.disposed) return;
      const next = this.pending; this.pending = null;
      this.registry.rewire(next);
      this.onChange();
      const start = this.context.currentTime;
      gain.cancelScheduledValues(start); gain.setValueAtTime(0, start);
      gain.linearRampToValueAtTime(1, start + .02);
      await this.waitForAudioTime(start + .023);
    }
  }
  dispose() { this.disposed = true; this.pending = null; clearTimeout(this.timer); this.finishWait?.(); this.finishWait = null; }
}
