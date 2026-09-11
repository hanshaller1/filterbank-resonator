import { TempoDetector } from './TempoDetector.js';
import { BeatTracker } from './BeatTracker.js';
const detector = new TempoDetector(), tracker = new BeatTracker();
let port, referenceBpm = null, lastAnalysis = -Infinity;
self.onmessage = event => {
  if (event.data.type !== 'connect') return;
  port = event.data.port;
  port.onmessage = ({ data }) => {
    if (data.type === 'reset') { detector.reset(); lastAnalysis = -Infinity; return; }
    if (data.type !== 'envelope') return;
    referenceBpm = data.referenceBpm;
    detector.ingest(data.batch);
    const now = data.batch.at(-3);
    if (now - lastAnalysis < .9) return;
    lastAnalysis = now;
    const tempo = detector.analyze(now);
    port.postMessage({ type: 'analysis', epoch: data.epoch, tempo, beat: tracker.analyze(detector.events, referenceBpm || tempo.stableBpm, now) });
  };
  port.start();
};
