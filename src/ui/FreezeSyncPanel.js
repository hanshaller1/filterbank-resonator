const fixed = n => Number.isFinite(n) ? n.toFixed(2) : '—';
const ms = n => Number.isFinite(n) ? `${Math.max(0, n).toFixed(1)} ms` : '—';
export class FreezeSyncPanel {
  constructor(store, engine, root) {
    this.store = store; this.engine = engine; this.root = root; this.info = null; this.events = new AbortController();
    const listen = (id, action) => root.querySelector('#' + id).addEventListener('click', action, { signal: this.events.signal });
    listen('freezeLockBpm', () => {
      if (store.state.parameters.freezeTempoLocked) store.setParameter('freezeTempoLocked', false);
      else if (this.info?.valid && Number.isFinite(this.info.stableBpm) && this.info.status === 'Stable' && this.info.confidence >= .72) {
        store.setParameters({ freezeTempoLocked: true, freezeLockedBpm: this.info.stableBpm });
      }
    });
    listen('freezeSetBeat1', () => engine.nodes?.registry.get('freeze').processor.setBeat1());
    root.querySelector('#freezeManualBpm').addEventListener('change', event => {
      const value = Number(event.target.value);
      if (event.target.value !== '' && Number.isFinite(value)) store.setParameters({ freezeManualBpm: value, freezeBpmMode: 'manual', freezeTempoLocked: false });
      event.target.value = store.state.parameters.freezeManualBpm;
    }, { signal: this.events.signal });
    this.unsubscribe = store.subscribe(() => this.render()); this.render();
  }
  render() {
    const p = this.store.state.parameters;
    this.root.hidden = p.freezeMode !== 'sync';
    const lock = this.root.querySelector('#freezeLockBpm');
    lock.textContent = p.freezeTempoLocked ? 'Unlock BPM' : 'Lock BPM';
    lock.setAttribute('aria-pressed', String(p.freezeTempoLocked));
    lock.classList.toggle('active', p.freezeTempoLocked);
    lock.disabled = p.freezeBpmMode === 'manual' || (!p.freezeTempoLocked && (!this.engine.active || !this.info?.valid || !Number.isFinite(this.info?.stableBpm) || this.info.status !== 'Stable' || this.info.confidence < .72));
    this.root.querySelector('#freezeSetBeat1').disabled = !this.engine.active || !this.info?.valid;
  }
  update(info) {
    this.info = info; this.render();
    const valid = this.engine.active && info?.valid, p = this.store.state.parameters;
    const status = !this.engine.active ? 'Audio stopped' : info?.error || (info?.triggerStatus === 'Waiting for tempo' ? 'Waiting for tempo · Manual BPM möglich' : info?.triggerStatus || 'Live');
    this.root.querySelector('#freezeBeatValue').textContent = valid ? `Beat ${info.beat} / 4 · Bar ${info.bar}${info.barReference === 'Manual' ? '' : ' · geschätzt'}` : 'Beat — / 4';
    this.root.querySelector('#freezeTriggerStatus').textContent = status + (info?.pendingMs != null ? ` · in ${Math.ceil(info.pendingMs)} ms` : '');
    const values = { detectedBpm: fixed(info?.detectedBpm), stableBpm: fixed(info?.stableBpm), clockBpm: valid ? fixed(info.bpm) : '—',
      confidence: `${Math.round((info?.confidence || 0) * 100)} %`, bpmMode: info?.bpmMode || (p.freezeBpmMode === 'manual' ? 'Manual' : p.freezeTempoLocked ? 'Locked' : 'Auto'),
      beat: valid ? `${info.beat} / 4` : '—', bar: valid ? info.bar : '—', barReference: info?.barReference || 'Estimated',
      beatPhase: valid ? info.beatPhase.toFixed(4) : '—', nextBeatMs: valid ? ms(info.nextBeatMs) : '—', nextBarMs: valid ? ms(info.nextBarMs) : '—',
      triggerStatus: status, quantization: info?.quantization || p.freezeStartQuantize, release: p.freezeReleaseQuantize, loopBpm: fixed(info?.loopBpm) };
    const analysis = info?.analysis;
    Object.assign(values, {
      analysisRuntime: analysis ? `${fixed(analysis.seconds)} s` : 'No diagnostic status received',
      analysisRms: analysis ? analysis.rms > 0 ? `${fixed(20 * Math.log10(analysis.rms))} dBFS` : 'Silence' : '—',
      analysisPackets: analysis ? `${analysis.batches} / ${analysis.replies} · ${analysis.connected ? 'connected' : 'not connected'}` : '—',
      analysisReply: analysis?.replyAge != null ? `${fixed(analysis.replyAge)} s ago` : 'No reply',
      analysisCandidates: analysis ? `${analysis.onsetCount ?? 0} / ${(analysis.candidates || []).map(fixed).join(', ') || 'none'}` : '—',
      analysisDecision: analysis?.reason ? `${analysis.reason} · 8s: ${fixed(analysis.shortBpm)} / 16s: ${fixed(analysis.longBpm)}` : 'Waiting for worker analysis'
    });
    for (const el of this.root.querySelectorAll('[data-sync-debug]')) el.textContent = values[el.dataset.syncDebug];
    if (p.freezeMode === 'sync') {
      const label = this.root.closest('[data-collapsible]').querySelector('.module-power-state');
      const armed = ['Armed', 'Buffering', 'Waiting for tempo', 'Waiting for Beat 1', 'Release armed'].includes(info?.triggerStatus);
      label.textContent = armed ? info.triggerStatus === 'Release armed' ? 'RELEASING' : 'ARMED' : info?.frozen ? 'ON' : 'OFF';
      for (const button of document.querySelectorAll('[data-quick="freezeEnabled"]')) button.textContent = `Freeze${armed ? ' · ' + info.triggerStatus : ''}`;
    } else for (const button of document.querySelectorAll('[data-quick="freezeEnabled"]')) button.textContent = 'Freeze';
  }
  resetUi() { this.info = null; this.render(); }
  dispose() { this.events.abort(); this.unsubscribe(); }
}
