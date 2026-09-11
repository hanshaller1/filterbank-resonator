// Analysis, correction and gain smoothing all run on the audio clock.
export class AutoGainProcessor {
  constructor(context) {
    this.context = context; this.enabled = false; this.correctionDb = 0;
    this.input = new AudioWorkletNode(context, 'syntakt-auto-gain', { numberOfInputs: 3, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
    this.output = this.input;
    this.input.port.onmessage = ({data}) => { if(data.type === 'correction' && Number.isFinite(data.value)) this.correctionDb = data.value; };
  }
  connect(destination) { this.output.connect(destination); }
  setAnalysisSources(drySource, wetSource) { drySource.connect(this.input,0,1); wetSource.connect(this.input,0,2); }
  update({enabled=false}={}) { this.enabled=Boolean(enabled); this.input.parameters.get('enabled').setValueAtTime(Number(this.enabled),this.context.currentTime); }
  updateAnalysis() { return this.correctionDb; }
  dispose() { this.input.port.postMessage({type:'dispose'}); }
  disconnect() { this.input.disconnect(); }
}
