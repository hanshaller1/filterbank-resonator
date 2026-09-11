import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from './audio-mock.mjs';
import { DriveProcessor, CHARACTER_PROFILES, driveIntensity } from '../src/audio/DriveProcessor.js';
import { PARAMETERS } from '../src/state/parameters.js';

const maxIdentityError = curve => {
  let error = 0;
  for (let i = 0; i < curve.length; i += 2) error = Math.max(error, Math.abs(curve[i + 1] - curve[i]));
  return error;
};

test('Drive is transparent at zero and low amounts remain deliberately fine', () => {
  const drive = new DriveProcessor(new Context());
  for (const character of Object.keys(CHARACTER_PROFILES)) {
    drive.update({ character, amount: 0, tone: 0, bias: 0, shape: .35 });
    assert.ok(maxIdentityError(drive.getTransferCurve(513).curve) < 1e-6, character + ' zero');
  }
  drive.update({ character: 'saturation', amount: .1 });
  assert.ok(maxIdentityError(drive.getTransferCurve(513).curve) < .025, '10% saturation is subtle');
  drive.update({ character: 'clean', amount: .25 });
  assert.ok(maxIdentityError(drive.getTransferCurve(513).curve) < .12, '25% clean boost stays controlled');
  assert.ok(driveIntensity(.1) < .02 && driveIntensity(.5) > .25 && driveIntensity(1) === 1);
  const saturation = drive.paths.get('saturation');
  drive.update({ character: 'saturation', amount: 0, tone: 1 });
  assert.ok(saturation.cleanGain.connections.some(([target]) => target === saturation.pathGain), 'Tone is outside the clean path');
  assert.ok(!saturation.cleanGain.connections.some(([target]) => target === saturation.userTone));
});

test('Characters, bias and shape alter real oversampled transfer curves without non-finite values', () => {
  const drive = new DriveProcessor(new Context()), signatures = new Set();
  for (const character of Object.keys(CHARACTER_PROFILES)) {
    drive.update({ character, amount: .75, bias: 0, shape: .35 });
    const curve = drive.getTransferCurve(65).curve;
    assert.ok([...curve].every(Number.isFinite), character);
    signatures.add([...curve].filter((_, i) => i % 8 === 1).map(v => v.toFixed(4)).join(','));
    assert.equal(drive.paths.get(character).waveshaper.oversample, '4x');
  }
  assert.equal(signatures.size, Object.keys(CHARACTER_PROFILES).length);
  drive.update({ character: 'saturation', amount: .7, bias: -1, shape: 0 }); const soft = drive.getTransferCurve(129).curve;
  drive.update({ bias: 1, shape: 1 }); const hard = drive.getTransferCurve(129).curve;
  assert.notDeepEqual([...soft], [...hard]);
  assert.ok(Math.abs(hard[129]) < .02, 'zero crossing stays DC-safe');
});

test('Curve-only modulation leaves smoothed amount and tone AudioParams untouched', () => {
  const drive = new DriveProcessor(new Context()), active = drive.paths.get('saturation'), inactive = drive.paths.get('highGain');
  assert.equal(inactive.waveshaper.curve, undefined, 'inactive curves are generated lazily');
  active.preGain.gain.value = 3.25; active.cleanGain.gain.value = .44; active.userTone.gain.value = -2;
  drive.updateTransfer({ bias: 1, shape: 1 });
  assert.equal(active.preGain.gain.value, 3.25); assert.equal(active.cleanGain.gain.value, .44); assert.equal(active.userTone.gain.value, -2);
  assert.ok(active.waveshaper.curve instanceof Float32Array);
});

test('Tone, bias and shape are persisted modulation targets', () => {
  for (const id of ['driveAmount', 'driveTone', 'driveBias', 'driveShape']) assert.equal(PARAMETERS[id].modulatable, true, id);
});
