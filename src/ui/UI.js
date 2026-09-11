import { PARAMETERS, toControl, viewSettings } from '../state/parameters.js';

const $ = id => document.getElementById(id);

const formatFreezeLength = milliseconds => {
  const value = Math.max(0, Number(milliseconds) || 0);
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
};

const FILTER_UI = {
  lowpass: { label: 'Low-Pass', primary: 'Cutoff', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Lässt tiefe Frequenzen passieren und rollt Höhen oberhalb des Cutoffs ab.', detail: 'Der Low-Pass glättet Höhen; Cutoff bestimmt die Eckfrequenz, Resonance / Q die Betonung direkt an dieser Stelle. Gut für dunklere Flächen, Sweeps und Basskontrolle.' },
  highpass: { label: 'High-Pass', primary: 'Cutoff', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Entfernt tiefe Frequenzen und lässt den oberen Bereich passieren.', detail: 'Der High-Pass dünnt Bass und Rumpeln unterhalb des Cutoffs aus. Cutoff setzt die Trennfrequenz, Resonance / Q formt die Kante. Nützlich zum Aufräumen und für dünne, bewegte Sounds.' },
  bandpass: { label: 'Band-Pass', primary: 'Center Frequency', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Lässt vor allem ein schmales Frequenzband um die Mittenfrequenz passieren.', detail: 'Der Band-Pass isoliert einen Bereich um die Center Frequency. Höheres Resonance / Q macht das Band schmaler und prägnanter; geeignet für Sweeps, Resonanzklänge und perkussive Akzente.' },
  notch: { label: 'Notch', primary: 'Center Frequency', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Senkt ein schmales Band um die Mittenfrequenz ab.', detail: 'Der Notch erzeugt eine Kerbe im Frequenzgang. Center Frequency legt die ausgesparte Stelle fest, Resonance / Q ihre Breite. Praktisch gegen störende Frequenzen oder für phasige Klangbewegungen.' },
  peak: { label: 'Peak / Bell', primary: 'Center Frequency', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Formt einen begrenzten Bereich um die Mittenfrequenz mit Peak Gain.', detail: 'Peak / Bell hebt oder senkt Frequenzen um die Center Frequency. Resonance / Q bestimmt die Breite, Peak Gain die Stärke von -12 bis +12 dB. Geeignet für gezieltes Tone-Shaping.' },
  allpass: { label: 'Allpass', primary: 'Phase Frequency', resonance: 'Resonance / Q', min: '20 Hz', max: '20 kHz', short: 'Behält den Pegel weitgehend bei und verändert die frequenzabhängige Phase.', detail: 'Der Allpass verschiebt vor allem die Phase und lässt den Frequenzgang nahezu unverändert. Phase Frequency legt den Wirkbereich fest, Resonance / Q die Ausprägung. Der Klangunterschied ist allein subtil und wird mit parallelen Signalen deutlicher.' },
  feedforwardComb: { label: 'Feedforward Comb', primary: 'Comb Frequency', resonance: 'Effect Strength', min: '20 Hz', max: '20 kHz', short: 'Mischt das Signal mit einer kurzen verzögerten Kopie und erzeugt regelmäßige Kammkerben.', detail: 'Beim Feedforward Comb bestimmt Comb Frequency den Abstand der spektralen Strukturen. Effect Strength regelt den Anteil der verzögerten Kopie. Der Klang kann hohl, phasig oder metallisch werden.' },
  feedbackComb: { label: 'Feedback Comb', primary: 'Comb Frequency', resonance: 'Feedback', min: '20 Hz', max: '20 kHz', short: 'Führt eine kurze Verzögerung zurück und erzeugt kontrollierte Resonanzstrukturen.', detail: 'Beim Feedback Comb bestimmt Comb Frequency den Abstand der Resonanzen. Feedback verstärkt die Rückkopplung, bleibt intern begrenzt und erzeugt metallische, resonante Klangfarben.' },
  formant: { label: 'Formant / Vowel', primary: 'Vowel Position', resonance: 'Formant Sharpness', min: 'A', max: 'U', short: 'Mehrere Formanten färben das Signal vokalartig und morphen zwischen A, E, I, O und U.', detail: 'Vowel Position morpht kontinuierlich durch die fünf Vokalcharaktere A, E, I, O und U. Formant Sharpness bestimmt die Schärfe der Formantbänder. Geeignet für vokalartige Sweeps und lebendige Synth-Färbungen.' }
};

const EQ_UI = {
  shelf2: { label: '2-Band Shelf', short: 'Einfaches Bass-/Höhen-Tone-Shaping.', detail: 'Low und High heben oder senken Bässe und Höhen breit an. Low arbeitet bei 100 Hz, High bei 8 kHz; beide Regler reichen von -12 bis +12 dB.' },
  tone3: { label: '3-Band Tone', short: 'Musikalische Klangformung mit Bass, Mitten und Höhen.', detail: 'Low-Shelf bei 100 Hz, breite Mitte bei 1 kHz und High-Shelf bei 8 kHz. Low, Mid und High formen jeweils -12 bis +12 dB.' },
  tilt: { label: 'Tilt', short: 'Macht das gesamte Signal mit einem Regler dunkler oder heller.', detail: 'Tilt verschiebt die Klangbalance um einen festen Pivot bei etwa 1 kHz. Negative Werte machen wärmer, positive brillanter. Bereich -6 bis +6 dB.' },
  graphic5: { label: '5-Band Graphic', short: 'Formt fünf feste Frequenzbereiche unabhängig voneinander.', detail: 'Feste Bänder bei 80, 250, 800, 2.5 kHz und 8 kHz. Jeder Gain-Regler arbeitet unabhängig von -12 bis +12 dB.' }
};

export class UI {
  constructor(store) {
    this.store = store;
    this.elements = {
      inputDevice: $('inputDevice'), outputDevice: $('outputDevice'), inputPeak: $('inputPeak'), currentInput: $('currentInput'), currentOutput: $('currentOutput'),
      sampleRate: $('sampleRate'), contextState: $('contextState'), audioState: $('audioState'), startAudio: $('startAudio'), stopAudio: $('stopAudio'), message: $('message'),
      cutoff: $('cutoff'), resonance: $('resonance'), filterType: $('filterType'), filterEnabled: $('filterEnabled'), filterPeakGain: $('filterPeakGain'), dryWet: $('dryWet'), wetGain: $('wetGain'), autoGain: $('autoGain'), inputGain: $('inputGain'), outputGain: $('outputGain'), bypass: $('bypass'), driveAmount: $('driveAmount'), driveTone: $('driveTone'), driveBias: $('driveBias'), driveShape: $('driveShape'), driveEnabled: $('driveEnabled'), character: $('driveCharacter'), eqLow: $('eqLow'), eqHigh: $('eqHigh'), eqEnabled: $('eqEnabled'),
      gateEnabled: $('gateEnabled'), gateMode: $('gateMode'), gateThreshold: $('gateThreshold'), gateRange: $('gateRange'), gateAttack: $('gateAttack'), gateRelease: $('gateRelease'), transientEnabled: $('transientEnabled'), transientAttack: $('transientAttack'), transientSustain: $('transientSustain'), wavefolderEnabled: $('wavefolderEnabled'), wavefolderFold: $('wavefolderFold'), wavefolderBias: $('wavefolderBias'), wavefolderOutput: $('wavefolderOutput'), crusherEnabled: $('crusherEnabled'), bitEnabled: $('bitEnabled'), rateEnabled: $('rateEnabled'), bitDepth: $('bitDepth'), rateReduction: $('rateReduction'), compressorEnabled: $('compressorEnabled'), compressorThreshold: $('compressorThreshold'), compressorRatio: $('compressorRatio'), compressorAttack: $('compressorAttack'), compressorRelease: $('compressorRelease'), compressorMakeup: $('compressorMakeup'), widthEnabled: $('widthEnabled'), width: $('width'), widthMonoBass: $('widthMonoBass'), widthMonoBassFrequency: $('widthMonoBassFrequency'), freezeEnabled: $('freezeEnabled'), freezeMode: $('freezeMode'), freezeFreeLength: $('freezeFreeLength'), freezeSyncLength: $('freezeSyncLength'), freezeFreeControl: $('freezeFreeControl'), freezeSyncControl: $('freezeSyncControl'), freezeTempoControl: $('freezeTempoControl'), clipperEnabled: $('clipperEnabled'), clipperMode: $('clipperMode'), clipperThreshold: $('clipperThreshold'), clipperAmount: $('clipperAmount'), clipperCeiling: $('clipperCeiling'), clipperRelease: $('clipperRelease'),
      cutoffValue: $('cutoffValue'), filterTypeValue: $('filterTypeValue'), filterPrimaryLabel: $('filterPrimaryLabel'), filterResonanceLabel: $('filterResonanceLabel'), primaryMinLabel: $('primaryMinLabel'), primaryMaxLabel: $('primaryMaxLabel'), resonanceValue: $('resonanceValue'), filterPeakGainValue: $('filterPeakGainValue'), peakGainControl: $('filterPeakGainControl'), dryWetValue: $('dryWetValue'), wetGainValue: $('wetGainValue'), autoGainValue: $('autoGainValue'), inputGainValue: $('inputGainValue'), outputGainValue: $('outputGainValue'), driveAmountValue: $('driveAmountValue'), characterValue: $('characterValue'), gateThresholdValue: $('gateThresholdValue'), gateRangeValue: $('gateRangeValue'), gateAttackValue: $('gateAttackValue'), gateReleaseValue: $('gateReleaseValue'), transientAttackValue: $('transientAttackValue'), transientSustainValue: $('transientSustainValue'), wavefolderFoldValue: $('wavefolderFoldValue'), wavefolderBiasValue: $('wavefolderBiasValue'), wavefolderOutputValue: $('wavefolderOutputValue'), bitDepthValue: $('bitDepthValue'), rateReductionValue: $('rateReductionValue'), compressorThresholdValue: $('compressorThresholdValue'), compressorRatioValue: $('compressorRatioValue'), compressorAttackValue: $('compressorAttackValue'), compressorReleaseValue: $('compressorReleaseValue'), compressorMakeupValue: $('compressorMakeupValue'), widthValue: $('widthValue'), freezeFreeLengthValue: $('freezeFreeLengthValue'), freezeSyncLengthValue: $('freezeSyncLengthValue'), freezeTempoValue: $('freezeTempoValue'), freezeStatusValue: $('freezeStatusValue'), clipperThresholdValue: $('clipperThresholdValue'), clipperAmountValue: $('clipperAmountValue'), clipperCeilingValue: $('clipperCeilingValue'), clipperReleaseValue: $('clipperReleaseValue'), clipperActivityValue: $('clipperActivityValue'), eqType: $('eqType'), eqLow: $('eqLow'), eqMid: $('eqMid'), eqHigh: $('eqHigh'), eqTilt: $('eqTilt'), eqGraphic: [0, 1, 2, 3, 4].map(index => $(`eqGraphic${index}`)), eqLowControl: $('eqLowControl'), eqMidControl: $('eqMidControl'), eqHighControl: $('eqHighControl'), eqTiltControl: $('eqTiltControl'), eqGraphicControls: [0, 1, 2, 3, 4].map(index => $(`eqGraphicControl${index}`)), eqLowValue: $('eqLowValue'), eqMidValue: $('eqMidValue'), eqHighValue: $('eqHighValue'), eqTiltValue: $('eqTiltValue'), eqGraphicValues: [0, 1, 2, 3, 4].map(index => $(`eqGraphicValue${index}`)),
      inputMeter: $('inputMeter'), outputMeter: $('outputMeter'), inputMeterValue: $('inputMeterValue'), outputMeterValue: $('outputMeterValue'), outputPeak: $('outputPeak'), compressorReductionValue: $('compressorReductionValue'), widthMonoBassFrequencyValue: $('widthMonoBassFrequencyValue'),
      filterExplanation: $('filterExplanation'), filterTooltip: $('filterTooltip'), filterResponseCanvas: $('filterResponseCanvas'), eqExplanation: $('eqExplanation'), eqTooltip: $('eqTooltip'), eqResponseCanvas: $('eqResponseCanvas'), eqHeaderStatus: $('eqHeaderStatus'),
      visualizationPanel: $('visualizationPanel'), visualizationHandle: $('visualizationHandle'), visualizationCanvas: $('visualizationCanvas'), visualizationType: $('visualizationType'), visualizationDescription: $('visualizationDescription'), openAnalyzer: $('openAnalyzer'), openAnalyzer2: $('openAnalyzer2'), closeAnalyzer: $('closeAnalyzer'), minimizeAnalyzer: $('minimizeAnalyzer'), themeSelect: $('themeSelect')
    };
  }

  fillDevices(select, devices, selectedId) {
    select.replaceChildren();
    devices.forEach(device => {
      const option = new Option(device.label || `${device.kind === 'audioinput' ? 'Audio-Eingang' : 'Audio-Ausgang'} (${device.deviceId.slice(0, 8)})`, device.deviceId);
      option.selected = device.deviceId === selectedId;
      select.add(option);
    });
  }

  readSettings() { return viewSettings(this.store.state.parameters); }

  render() {
    for (const p of Object.values(PARAMETERS)) {
      const control = $(p.control);
      if (!control) continue;
      const value = this.store.state.parameters[p.id];
      if (p.type === 'boolean') {
        if (control.type === 'checkbox') control.checked = value;
        else { control.setAttribute('aria-pressed', String(value)); control.classList.toggle('active', value); }
      } else if (control.type !== 'number' || document.activeElement !== control) control.value = toControl(p, value);
    }
    return this.updateValues();
  }

  updateValues() {
    const s = this.readSettings();
    const filterUi = FILTER_UI[s.filterType] || FILTER_UI.lowpass;
    this.elements.filterTypeValue.value = filterUi.label;
    this.elements.filterPrimaryLabel.textContent = filterUi.primary;
    this.elements.filterResonanceLabel.textContent = filterUi.resonance;
    this.elements.primaryMinLabel.textContent = filterUi.min;
    this.elements.primaryMaxLabel.textContent = filterUi.max;
    this.elements.filterExplanation.textContent = filterUi.short;
    this.elements.filterTooltip.textContent = filterUi.detail;
    this.elements.peakGainControl.hidden = s.filterType !== 'peak';
    if (s.filterType === 'formant') {
      const position = Number(this.elements.cutoff.value) / 1000;
      const vowels = ['A', 'E', 'I', 'O', 'U'];
      const location = position * (vowels.length - 1);
      const left = Math.min(vowels.length - 2, Math.floor(location));
      const blend = Math.round((location - left) * 100);
      this.elements.cutoffValue.value = `${vowels[left]} → ${vowels[left + 1]} ${blend}%`;
    } else {
      this.elements.cutoffValue.value = s.cutoff >= 1000 ? `${(s.cutoff / 1000).toFixed(2)} kHz` : `${Math.round(s.cutoff)} Hz`;
    }
    this.elements.resonanceValue.value = s.resonance.toFixed(2);
    this.elements.filterPeakGainValue.value = `${s.filterPeakGain >= 0 ? '+' : ''}${s.filterPeakGain.toFixed(1)} dB`;
    this.elements.dryWetValue.value = `${Math.round(s.dryWet * 100)} %`;
    this.elements.wetGainValue.value = `${s.wetGain >= 0 ? '+' : ''}${s.wetGain.toFixed(1)} dB`;
    this.elements.inputGainValue.value = `${s.inputGain.toFixed(1)} dB`;
    this.elements.outputGainValue.value = `${s.outputGain.toFixed(1)} dB`;
    this.elements.driveAmountValue.value = `${Math.round(s.driveAmount * 100)} %`;
    $('driveToneValue').value = `${Math.round(s.driveTone * 100)} %`;
    $('driveBiasValue').value = `${Math.round(s.driveBias * 100)} %`;
    $('driveShapeValue').value = `${Math.round(s.driveShape * 100)} %`;
    this.elements.gateThresholdValue.value = `${s.gateThreshold.toFixed(1)} dBFS`;
    this.elements.gateRangeValue.value = `${s.gateRange.toFixed(1)} dB`;
    this.elements.gateAttackValue.value = `${s.gateAttack.toFixed(0)} ms`;
    this.elements.gateReleaseValue.value = `${s.gateRelease.toFixed(0)} ms`;
    this.elements.transientAttackValue.value = `${s.transientAttack.toFixed(0)} %`;
    this.elements.transientSustainValue.value = `${s.transientSustain.toFixed(0)} %`;
    this.elements.wavefolderFoldValue.value = `${s.wavefolderFold.toFixed(0)} %`;
    this.elements.wavefolderBiasValue.value = `${s.wavefolderBias.toFixed(0)} %`;
    this.elements.wavefolderOutputValue.value = `${s.wavefolderOutput >= 0 ? '+' : ''}${s.wavefolderOutput.toFixed(1)} dB`;
    this.elements.bitDepthValue.value = `${s.bitDepth.toFixed(0)} bit`;
    this.elements.rateReductionValue.value = `${Math.round(s.rateReduction * 100)} %`;
    this.elements.compressorThresholdValue.value = `${s.compressorThreshold.toFixed(1)} dBFS`;
    this.elements.compressorRatioValue.value = `${s.compressorRatio.toFixed(1)}:1`;
    this.elements.compressorAttackValue.value = `${s.compressorAttack.toFixed(0)} ms`;
    this.elements.compressorReleaseValue.value = `${s.compressorRelease.toFixed(0)} ms`;
    this.elements.compressorMakeupValue.value = `${s.compressorMakeup >= 0 ? '+' : ''}${s.compressorMakeup.toFixed(1)} dB`;
    this.elements.widthValue.value = `${s.width.toFixed(0)} %`;
    this.elements.widthMonoBassFrequencyValue.value = `${s.widthMonoBassFrequency.toFixed(0)} Hz`;
    this.elements.widthMonoBassFrequency.disabled = !s.widthMonoBass;
    const freeLengthMs = Number(this.elements.freezeFreeLength.value);
    this.elements.freezeFreeLengthValue.value = formatFreezeLength(freeLengthMs);
    this.elements.freezeSyncLengthValue.value = this.elements.freezeSyncLength.options[this.elements.freezeSyncLength.selectedIndex]?.text || '1 Bar';
    this.elements.freezeFreeControl.hidden = s.freezeMode !== 'free';
    this.elements.freezeSyncControl.hidden = s.freezeMode !== 'sync';
    this.elements.freezeTempoControl.hidden = s.freezeMode !== 'sync';
    this.elements.clipperThresholdValue.value = `${s.clipperThreshold.toFixed(1)} dBFS`;
    this.elements.clipperAmountValue.value = `${Math.round(s.clipperAmount * 100)} %`;
    this.elements.clipperCeilingValue.value = `${s.clipperCeiling.toFixed(1)} dBFS`;
    this.elements.clipperReleaseValue.value = `${s.clipperRelease.toFixed(0)} ms`;
    this.elements.clipperAmount.closest('label').hidden = s.clipperMode !== 'softclip';
    this.elements.clipperRelease.closest('label').hidden = s.clipperMode !== 'limiter';
    this.elements.characterValue.value = this.elements.character.options[this.elements.character.selectedIndex]?.text || 'Saturation';
    this.elements.eqLowValue.value = `${s.eqLow >= 0 ? '+' : ''}${s.eqLow.toFixed(1)} dB`;
    this.elements.eqHighValue.value = `${s.eqHigh >= 0 ? '+' : ''}${s.eqHigh.toFixed(1)} dB`;
    const eqUi = EQ_UI[s.eqType] || EQ_UI.tone3;
    this.elements.eqExplanation.textContent = eqUi.short;
    this.elements.eqTooltip.textContent = eqUi.detail;
    this.elements.eqHeaderStatus.textContent = eqUi.label;
    const visible = new Set(s.eqType === 'shelf2' ? ['low', 'high'] : s.eqType === 'tone3' ? ['low', 'mid', 'high'] : s.eqType === 'tilt' ? ['tilt'] : ['graphic']);
    this.elements.eqLowControl.hidden = !visible.has('low');
    this.elements.eqMidControl.hidden = !visible.has('mid');
    this.elements.eqHighControl.hidden = !visible.has('high');
    this.elements.eqTiltControl.hidden = !visible.has('tilt');
    this.elements.eqGraphicControls.forEach(control => { control.hidden = !visible.has('graphic'); });
    this.elements.eqMidValue.value = `${s.eqMid >= 0 ? '+' : ''}${s.eqMid.toFixed(1)} dB`;
    this.elements.eqTiltValue.value = `${s.eqTilt >= 0 ? '+' : ''}${s.eqTilt.toFixed(1)} dB`;
    this.elements.eqGraphicValues.forEach((value, index) => { const gain = s.eqGraphic[index] || 0; value.value = `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`; });
    this.updateModulePowerLabels();
    return s;
  }

  updateModulePowerLabels() {
    for (const id of ['gateEnabled', 'transientEnabled', 'driveEnabled', 'wavefolderEnabled', 'crusherEnabled', 'filterEnabled', 'eqEnabled', 'compressorEnabled', 'widthEnabled', 'freezeEnabled', 'clipperEnabled']) {
      const control = this.elements[id];
      if (!control) continue;
      const module = control.closest('[data-collapsible]');
      const status = module?.querySelector('.module-power-state');
      // Sync Freeze has a richer runtime status (ARMED/ON/OFF) rendered by FreezeSyncPanel.
      if (status && !(id === 'freezeEnabled' && this.store.state.parameters.freezeMode === 'sync')) status.textContent = control.checked ? 'ON' : 'OFF';
      module?.classList.toggle('module-active', control.checked);
    }
  }

  setAutoGainCorrection(value) {
    const correction = Number.isFinite(value) ? value : 0;
    this.elements.autoGainValue.value = `AG: ${correction >= 0 ? '+' : ''}${correction.toFixed(1)} dB`;
  }

  setClipperActivity(value) {
    this.elements.clipperActivityValue.value = `Activity: ${Number.isFinite(value) ? value.toFixed(1) : '0.0'} dB`;
  }

  setFreezeTempo(info) {
    const tempo = info || { bpm: 120, status: 'Detecting…' };
    this.elements.freezeTempoValue.textContent = tempo.valid && Number.isFinite(tempo.bpm) ? `${tempo.bpm.toFixed(2)} BPM` : '— BPM';
    this.elements.freezeStatusValue.textContent = (tempo.status || 'Detecting') + (tempo.held ? ' · letzter stabiler Wert' : '');
  }

  setStatus(active, contextState) {
    this.elements.audioState.textContent = active ? 'Aktiv' : 'Gestoppt';
    this.elements.audioState.className = `state-badge ${active ? 'active' : 'stopped'}`;
    if (contextState) this.elements.contextState.textContent = contextState;
    this.elements.startAudio.disabled = active && contextState !== 'suspended';
    this.elements.stopAudio.disabled = !active;
  }

  setMessage(message, error = false) { this.elements.message.textContent = message; this.elements.message.className = `message ${error ? 'error' : ''}`; }

  setInputPeak(value) {
    const peak = Number.isFinite(value) && value > 0.00001 ? 20 * Math.log10(value) : -60;
    const headroom = Math.max(0, -peak);
    this.elements.inputPeak.textContent = `Peak: ${peak.toFixed(1)} dBFS | HR: ${headroom.toFixed(1)} dB`;
  }

  setMeters(levels) {
    for (const [key, value] of Object.entries(levels)) {
      const db = value > 0.00001 ? 20 * Math.log10(value) : -60;
      const percent = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
      this.elements[`${key}Meter`].style.width = `${percent}%`;
      this.elements[`${key}MeterValue`].value = `${db.toFixed(1)} dBFS`;
      if (key === 'input') this.setInputPeak(value);
      if (key === 'output') this.setOutputPeak(value);
    }
  }

  setOutputPeak(value) {
    const peak = Number.isFinite(value) && value > 0.00001 ? 20 * Math.log10(value) : -60;
    const headroom = Math.max(0, -peak);
    this.elements.outputPeak.textContent = `Peak: ${peak.toFixed(1)} dBFS | HR: ${headroom.toFixed(1)} dB`;
  }
}
