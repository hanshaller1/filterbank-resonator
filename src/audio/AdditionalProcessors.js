const dbToGain = db => Math.pow(10, db / 20);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class CrossfadeProcessor {
  constructor(context) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();
    this.dryGain = context.createGain();
    this.wetGain = context.createGain();
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);
    this.enabled = false;
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
  }

  connect(destination) { this.output.connect(destination); }

  setEnabled(enabled, timeConstant = 0.025) {
    this.enabled = Boolean(enabled);
    const now = this.context.currentTime;
    this.dryGain.gain.setTargetAtTime(this.enabled ? 0 : 1, now, timeConstant);
    this.wetGain.gain.setTargetAtTime(this.enabled ? 1 : 0, now, timeConstant);
  }

  connectProcessed(node) {
    node.connect(this.wetGain);
  }

  disconnect() {
    const nodes = [this.input, this.output, this.dryGain, this.wetGain, ...(this.internalNodes || [])];
    for (const node of nodes) { try { node.disconnect(); } catch {} }
  }
}

function wavefold(value, fold, bias) {
  const amount = 1 + fold * 8;
  const shifted = value * amount + bias * fold * 1.2;
  const wrapped = ((shifted + 1) % 4 + 4) % 4 - 1;
  const triangle = wrapped <= 1 ? wrapped : 2 - wrapped;
  return clamp(triangle, -1, 1);
}

export class WavefolderProcessor extends CrossfadeProcessor {
  constructor(context) {
    super(context);
    this.preGain = context.createGain();
    this.shaper = context.createWaveShaper();
    this.dcBlock = context.createBiquadFilter();
    this.dcBlock.type = 'highpass'; this.dcBlock.frequency.value = 5; this.dcBlock.Q.value = .707;
    this.postGain = context.createGain();
    this.input.connect(this.preGain);
    this.preGain.connect(this.shaper);
    this.shaper.connect(this.dcBlock); this.dcBlock.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.shaper.oversample = '4x';
    this.internalNodes = [this.preGain, this.shaper, this.dcBlock, this.postGain];
    this.settings = { fold: 25, bias: 0, output: 0 };
    this.update();
  }

  update(settings = {}) {
    Object.assign(this.settings, settings);
    const fold = clamp(Number(this.settings.fold), 0, 100) / 100;
    const bias = clamp(Number(this.settings.bias), -100, 100) / 100;
    const output = clamp(Number(this.settings.output), -12, 6);
    const curveKey = `${fold}:${bias}`;
    if (curveKey !== this.curveKey) {
      const curve = new Float32Array(2049), zero = wavefold(0, fold, bias);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = fold < 0.001 ? x : (wavefold(x, fold, bias) - zero) / (1 + Math.abs(zero));
      }
      this.shaper.curve = curve; this.curveKey = curveKey;
    }
    this.preGain.gain.setTargetAtTime(1 + fold * 1.5, this.context.currentTime, 0.03);
    this.postGain.gain.setTargetAtTime(dbToGain(output), this.context.currentTime, 0.03);
    this.setEnabled(settings.enabled ?? this.enabled, 0.03);
  }
}

export class CompressorProcessor extends CrossfadeProcessor {
  constructor(context) {
    super(context);
    this.compressor = context.createDynamicsCompressor();
    this.makeup = context.createGain();
    this.input.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.wetGain);
    this.internalNodes = [this.compressor, this.makeup];
    this.settings = { threshold: -18, ratio: 4, attack: 10, release: 120, makeup: 0 };
    this.update();
  }

  update(settings = {}) {
    Object.assign(this.settings, settings);
    const now = this.context.currentTime;
    const ramp = 0.03;
    this.compressor.threshold.setTargetAtTime(clamp(Number(this.settings.threshold), -60, 0), now, ramp);
    this.compressor.ratio.setTargetAtTime(clamp(Number(this.settings.ratio), 1, 20), now, ramp);
    this.compressor.attack.setTargetAtTime(clamp(Number(this.settings.attack), 1, 100) / 1000, now, ramp);
    this.compressor.release.setTargetAtTime(clamp(Number(this.settings.release), 20, 1000) / 1000, now, ramp);
    this.makeup.gain.setTargetAtTime(dbToGain(clamp(Number(this.settings.makeup), -12, 12)), now, ramp);
    this.setEnabled(settings.enabled ?? this.enabled, ramp);
  }

  getReduction() { return this.enabled ? this.compressor.reduction : 0; }
}

export class StereoWidthProcessor extends CrossfadeProcessor {
  constructor(context) {
    super(context);
    this.splitter = context.createChannelSplitter(2);
    this.merger = context.createChannelMerger(2);
    this.midL = context.createGain();
    this.midR = context.createGain();
    this.sideL = context.createGain();
    this.sideR = context.createGain();
    this.mid = context.createGain();
    this.side = context.createGain();
    this.midOutL = context.createGain();
    this.midOutR = context.createGain();
    this.sideOutL = context.createGain();
    this.sideOutR = context.createGain();
    this.input.connect(this.splitter);
    this.splitter.connect(this.midL, 0); this.splitter.connect(this.sideL, 0);
    this.splitter.connect(this.midR, 1); this.splitter.connect(this.sideR, 1);
    this.midL.connect(this.mid); this.midR.connect(this.mid);
    this.sideL.connect(this.side); this.sideR.connect(this.side);
    this.mid.connect(this.midOutL); this.mid.connect(this.midOutR);
    this.side.connect(this.sideOutL); this.side.connect(this.sideOutR);
    this.midOutL.connect(this.merger, 0, 0); this.sideOutL.connect(this.merger, 0, 0);
    this.midOutR.connect(this.merger, 0, 1); this.sideOutR.connect(this.merger, 0, 1);
    this.merger.connect(this.wetGain);
    this.midL.gain.value = 0.5; this.midR.gain.value = 0.5;
    this.sideL.gain.value = 0.5; this.sideR.gain.value = -0.5;
    this.midOutL.gain.value = 1; this.midOutR.gain.value = 1;
    this.sideOutL.gain.value = 1; this.sideOutR.gain.value = -1;
    this.internalNodes = [this.splitter, this.merger, this.midL, this.midR, this.sideL, this.sideR, this.mid, this.side, this.midOutL, this.midOutR, this.sideOutL, this.sideOutR];
    this.settings = { width: 100 };
    this.update();
  }

  update(settings = {}) {
    Object.assign(this.settings, settings);
    const width = clamp(Number(this.settings.width), 0, 200) / 100;
    this.sideOutL.gain.setTargetAtTime(width, this.context.currentTime, 0.03);
    this.sideOutR.gain.setTargetAtTime(-width, this.context.currentTime, 0.03);
    this.setEnabled(settings.enabled ?? this.enabled, 0.03);
  }
}
