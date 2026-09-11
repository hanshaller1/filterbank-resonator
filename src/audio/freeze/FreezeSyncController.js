import { TransportClock, GRID_BEATS, LOOP_BEATS } from './TransportClock.js';

export class FreezeSyncController {
  constructor(sampleRate, engine) {
    this.sampleRate = sampleRate; this.engine = engine; this.clock = new TransportClock(sampleRate);
    this.settings = { mode: 'free', frozen: false, syncLength: '1bar', bpmMode: 'auto', manualBpm: 120, tempoLocked: false, lockedBpm: 120, startQuantize: 'auto', releaseQuantize: 'off' };
    this.detection = { detectedBpm: null, stableBpm: null, confidence: 0, status: 'Detecting' };
    this.pending = null; this.status = 'Live'; this.lastDetectionFrame = -Infinity; this.error = '';
  }
  get grid() {
    return this.settings.startQuantize === 'auto' ? (LOOP_BEATS[this.settings.syncLength] >= 4 ? '1bar' : 'beat') : this.settings.startQuantize;
  }
  get tempoMode() { return this.settings.bpmMode === 'manual' ? 'Manual' : this.settings.tempoLocked ? 'Locked' : 'Auto'; }
  get effectiveBpm() {
    const s = this.settings;
    return s.bpmMode === 'manual' ? s.manualBpm : s.tempoLocked ? s.lockedBpm : this.detection.stableBpm;
  }
  get duration() { return this.clock.framesPerBeat * (LOOP_BEATS[this.settings.syncLength] || 4); }
  configure(patch, frame) {
    const old = this.settings; this.settings = { ...old, ...patch };
    const s = this.settings;
    if (s.mode !== 'sync') {
      this.pending = null;
      if (!s.frozen) { this.freePending = false; this.engine.release(); this.status = 'Live'; }
      else if (!old.frozen || old.mode !== 'free' || old.freeLength !== s.freeLength || !this.engine.frozen) {
        const seconds = Number.isFinite(s.freeLength) ? Math.max(.005, Math.min(20, s.freeLength)) : .25;
        this.freeDuration = Math.round(seconds * this.sampleRate); this.freePending = true; this.status = 'Buffering';
      }
      return;
    }
    this.freePending = false;
    const tempoChanged = old.bpmMode !== s.bpmMode || old.manualBpm !== s.manualBpm || old.tempoLocked !== s.tempoLocked || old.lockedBpm !== s.lockedBpm;
    const previousBpm = this.clock.bpm;
    const allowTempoChangeWhileFrozen = s.bpmMode === 'manual' || s.tempoLocked
      || (old.bpmMode === 'manual' && s.bpmMode === 'auto') || (old.tempoLocked && !s.tempoLocked);
    if (tempoChanged || !this.clock.valid || old.mode !== 'sync') this.applyTempo(frame, allowTempoChangeWhileFrozen);
    const clockChanged = Math.abs(previousBpm - this.clock.bpm) > .001;
    if (!s.frozen) {
      if (!this.engine.frozen) { this.pending = null; this.status = 'Live'; }
      else if (s.releaseQuantize === 'off' || !this.clock.valid) { this.engine.release(); this.pending = null; this.status = 'Live'; }
      else if (this.pending?.kind !== 'release' || old.releaseQuantize !== s.releaseQuantize) {
        this.pending = { kind: 'release', atFrame: this.clock.nextGridFrame(s.releaseQuantize === 'bar' ? '1bar' : 'beat', frame) };
        this.status = 'Release armed';
      }
      return;
    }
    if (this.pending?.kind === 'release') { this.pending = null; this.status = 'Frozen'; }
    if ((!this.engine.frozen && !this.pending) || clockChanged || old.syncLength !== s.syncLength || old.mode !== 'sync' || (this.pending && old.startQuantize !== s.startQuantize)) this.arm(frame);
  }
  applyTempo(frame, explicit = false) {
    const bpm = this.effectiveBpm;
    if (!Number.isFinite(bpm)) return false;
    if (!explicit && (this.engine.frozen || this.pending)) return false;
    if (!this.clock.valid || Math.abs(this.clock.bpm - bpm) > .001) return this.clock.setBpm(bpm, frame);
    return false;
  }
  onAnalysis(result, frame) {
    if (this.settings.mode !== 'sync') return;
    this.detection = result.tempo; this.lastDetectionFrame = frame;
    const autoChanged = this.settings.bpmMode === 'auto' && !this.settings.tempoLocked
      && result.tempo.status === 'Stable' && Number.isFinite(result.tempo.stableBpm)
      && this.clock.valid && Math.abs(this.clock.bpm - result.tempo.stableBpm) > .65;
    const clockChanged = this.applyTempo(frame, autoChanged);
    if (!this.engine.frozen && !this.pending && result.beat) this.clock.alignBeat(result.beat.referenceTime * this.sampleRate, frame, result.beat.confidence);
    if (this.settings.frozen && ((!this.engine.frozen && !this.pending) || clockChanged)) this.arm(frame);
  }
  arm(frame) {
    if (!this.clock.valid) { this.pending = null; this.status = 'Waiting for tempo'; return; }
    if ((GRID_BEATS[this.grid] || 1) >= 4 && !this.clock.manualReference) {
      this.pending = null; this.status = 'Waiting for Beat 1'; return;
    }
    const duration = this.duration;
    const earliest = this.engine.history.firstFrame === null ? frame + duration + this.engine.seamFrames(duration) + 2
      : Math.max(frame + 1, this.engine.history.firstFrame + duration + this.engine.seamFrames(duration) + 2);
    this.pending = { kind: 'capture', duration, atFrame: this.clock.nextGridFrame(this.grid, earliest, false) };
    this.status = this.engine.canCapture(frame, duration) ? 'Armed' : 'Buffering';
  }
  setBeat1(frame) {
    if (!this.clock.setBeat1(frame)) return;
    if (this.pending?.kind === 'capture' || (this.settings.frozen && !this.engine.frozen)) this.arm(frame);
    else if (this.pending?.kind === 'release') this.pending.atFrame = this.clock.nextGridFrame(this.settings.releaseQuantize === 'bar' ? '1bar' : 'beat', frame);
  }
  tick(frame) {
    if (this.freePending && this.engine.canCapture(frame, this.freeDuration)) {
      if (this.engine.capture(frame, this.freeDuration)) { this.freePending = false; this.status = 'Frozen'; }
    }
    if (!this.pending || frame + 1e-7 < this.pending.atFrame) return;
    if (this.pending.kind === 'release') { this.engine.release(); this.pending = null; this.status = 'Live'; return; }
    if (this.engine.capture(frame, this.pending.duration)) {
      this.clock.setBpm(this.clock.bpm, frame); // hold phase as well as tempo during playback
      this.loopBpm = this.clock.bpm; this.pending = null; this.status = 'Frozen';
    }
    else this.arm(frame);
  }
  info(frame) {
    const stale = frame - this.lastDetectionFrame > this.sampleRate * 3;
    const status = this.tempoMode === 'Locked' ? 'Locked' : this.tempoMode === 'Manual' ? 'Manual' : stale ? 'Detecting' : this.detection.status;
    return { ...this.clock.info(frame), ...this.detection, status,
      stableBpm: this.detection.stableBpm, confidence: stale ? 0 : this.detection.confidence,
      effectiveBpm: this.effectiveBpm,
      bpmMode: this.tempoMode, locked: this.clock.valid, // legacy consumers mean usable tempo
      tempoLocked: this.tempoMode === 'Locked', held: this.clock.valid && this.tempoMode === 'Auto' && status !== 'Stable',
      triggerStatus: this.status, frozen: this.engine.frozen, requested: this.settings.frozen,
      quantization: this.grid, pendingMs: this.pending ? Math.max(0, (this.pending.atFrame - frame) * 1000 / this.sampleRate) : null,
      loopBpm: this.engine.active ? this.loopBpm : null,
      error: this.error };
  }
}
