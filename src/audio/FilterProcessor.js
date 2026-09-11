import { BiquadFilterProcessor } from './BiquadFilterProcessor.js';
import { CombFilterProcessor } from './CombFilterProcessor.js';
import { FormantFilterProcessor } from './FormantFilterProcessor.js';

const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const CROSSFADE_SECONDS = 0.03;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const FILTER_TYPES = Object.freeze([
  'lowpass', 'highpass', 'bandpass', 'notch', 'peak', 'allpass',
  'feedforwardComb', 'feedbackComb', 'formant'
]);

const positionFromFrequency = frequency => clamp(
  Math.log(Math.max(MIN_FREQUENCY, frequency) / MIN_FREQUENCY) / Math.log(MAX_FREQUENCY / MIN_FREQUENCY),
  0,
  1
);

export class FilterProcessor {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = audioContext.createGain();
    this.output = audioContext.createGain();
    this.filter = this.input;
    this.bypassGain = audioContext.createGain();
    this.paths = new Map();
    this.settings = { type: 'lowpass', frequency: MAX_FREQUENCY, resonance: 0.7, peakGain: 0, bypass: false };
    this.levels = { lowpass: 1, highpass: 0, bandpass: 0, notch: 0, peak: 0, allpass: 0, feedforwardComb: 0, feedbackComb: 0, formant: 0, bypass: 0 };

    this.input.connect(this.bypassGain);
    this.bypassGain.connect(this.output);
    this.bypassGain.gain.value = 0;

    this.addPath('lowpass', new BiquadFilterProcessor(audioContext, 'lowpass'));
    this.addPath('highpass', new BiquadFilterProcessor(audioContext, 'highpass'));
    this.addPath('bandpass', new BiquadFilterProcessor(audioContext, 'bandpass'));
    this.addPath('notch', new BiquadFilterProcessor(audioContext, 'notch'));
    this.addPath('peak', new BiquadFilterProcessor(audioContext, 'peaking'));
    this.addPath('allpass', new BiquadFilterProcessor(audioContext, 'allpass'));
    this.addPath('feedforwardComb', new CombFilterProcessor(audioContext, 'feedforwardComb'));
    this.addPath('feedbackComb', new CombFilterProcessor(audioContext, 'feedbackComb'));
    this.addPath('formant', new FormantFilterProcessor(audioContext));
    this.update(this.settings);
  }

  addPath(type, processor) {
    const pathGain = this.audioContext.createGain();
    pathGain.gain.value = this.levels[type];
    this.input.connect(processor.input);
    processor.output.connect(pathGain);
    pathGain.connect(this.output);
    this.paths.set(type, { processor, pathGain });
  }

  rampGain(parameter, target) {
    const now = this.audioContext.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(target, now + CROSSFADE_SECONDS);
  }

  update({ type = this.settings.type, frequency = this.settings.frequency, resonance = this.settings.resonance, peakGain = this.settings.peakGain, bypass = this.settings.bypass } = {}) {
    const nextType = FILTER_TYPES.includes(type) ? type : 'lowpass';
    const previousType = this.settings.type;
    this.settings = { type: nextType, frequency: clamp(frequency, MIN_FREQUENCY, MAX_FREQUENCY), resonance: clamp(resonance, 0.1, 12), peakGain: clamp(peakGain, -12, 12), bypass: Boolean(bypass) };

    for (const [mode, { processor }] of this.paths) {
      if (processor instanceof BiquadFilterProcessor) processor.update(this.settings);
      else if (processor instanceof CombFilterProcessor) processor.update(this.settings);
      else processor.update({ position: positionFromFrequency(this.settings.frequency), resonance: this.settings.resonance });
    }

    if (previousType !== nextType) {
      if (!this.settings.bypass) {
        this.rampGain(this.paths.get(previousType).pathGain.gain, 0);
        this.rampGain(this.paths.get(nextType).pathGain.gain, 1);
      }
      this.levels[previousType] = 0;
      this.levels[nextType] = this.settings.bypass ? 0 : 1;
    }

    if (Boolean(bypass) !== (this.levels.bypass === 1)) {
      this.rampGain(this.bypassGain.gain, bypass ? 1 : 0);
      this.levels.bypass = bypass ? 1 : 0;
      this.rampGain(this.paths.get(nextType).pathGain.gain, bypass ? 0 : 1);
      this.levels[nextType] = bypass ? 0 : 1;
    }
  }

  setCutoff(frequency) { this.update({ frequency }); }
  setResonance(resonance) { this.update({ resonance }); }
  setType(type) { this.update({ type }); }
  setPeakGain(peakGain) { this.update({ peakGain }); }
  setBypass(bypass) { this.update({ bypass }); }

  connect(destination) { this.output.connect(destination); }

  disconnect() {
    for (const node of [this.input, this.output, this.bypassGain]) {
      try { node.disconnect(); } catch {}
    }
    for (const { processor, pathGain } of this.paths.values()) {
      try { pathGain.disconnect(); } catch {}
      processor.disconnect();
    }
  }
}
