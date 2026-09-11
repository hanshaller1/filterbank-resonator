import { ANALYZER_SOURCE_NAMES } from './AnalyzerSources.js';

export class Metering {
  constructor(audioContext) {
    this.context = audioContext;
    this.taps = {};
    for (const name of ANALYZER_SOURCE_NAMES) this.ensureTap(name);
    this.inputAnalyser = this.taps.input.analyser;
    this.outputAnalyser = this.taps.output.analyser;
    this.inputData = this.taps.input.timeData;
    this.outputData = this.taps.output.timeData;
    this.inputFrequencyData = this.taps.input.frequencyData;
    this.outputFrequencyData = this.taps.output.frequencyData;
  }

  ensureTap(name) {
    if (this.taps[name]) return this.taps[name];
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    this.taps[name] = { analyser, timeData: new Float32Array(analyser.fftSize), frequencyData: new Float32Array(analyser.frequencyBinCount) };
    return this.taps[name];
  }

  connectTap(name, source) {
    const tap = this.taps[name];
    if (tap) source.connect(tap.analyser);
  }

  capture(name, frequency = true) {
    const tap = this.taps[name] || this.taps.output;
    tap.analyser.getFloatTimeDomainData(tap.timeData);
    if (frequency) tap.analyser.getFloatFrequencyData(tap.frequencyData);
    return tap;
  }

  read(analyser, data) {
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }

  readLevels() {
    const input = this.capture('input', false);
    const output = this.capture('output', false);
    return {
      input: this.read(input.analyser, input.timeData),
      output: this.read(output.analyser, output.timeData)
    };
  }

  sourceNames() { return Object.keys(this.taps); }

  readAnalysis(sources = ['output']) {
    const selected = Array.isArray(sources) ? sources : [sources];
    const names = new Set(['input', 'output', ...selected]);
    const captured = Object.fromEntries([...names].map(name => [name, this.capture(name, selected.includes(name))]));
    const sourceData = selected.map(source => {
      const tap = captured[source] || captured.output;
      return { source: this.taps[source] ? source : 'output', level: this.peak(tap.timeData), time: tap.timeData, frequency: tap.frequencyData };
    });
    const primary = sourceData[0] || { source: 'output', level: 0, time: captured.output.timeData, frequency: captured.output.frequencyData };
    return {
      levels: {
        input: this.peak(captured.input.timeData),
        output: this.peak(captured.output.timeData)
      },
      primaryLevel: primary.level,
      selectedTime: primary.time,
      selectedFrequency: primary.frequency,
      compareTime: sourceData[1]?.time || primary.time,
      compareFrequency: sourceData[1]?.frequency || primary.frequency,
      source: primary.source,
      secondarySource: sourceData[1]?.source || primary.source,
      sources: sourceData,
      sampleRate: this.context.sampleRate
    };
  }

  disconnect() {
    for (const tap of Object.values(this.taps)) tap.analyser.disconnect();
  }

  peak(data) {
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }
}
