import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeAmbisonics, localDirection } from '../lib/encoder.js';
import { normalizeRotation } from '../lib/rotation.js';

describe('stable edge behavior', () => {
  it('encodes a source at the listener origin as silent channels', () => {
    const pcm = Float64Array.from([1, 2, 3]);
    for (const order of [1, 2]) {
      const channels = encodeAmbisonics([0, 0, 0], pcm, { order });
      assert.equal(channels.length, (order + 1) ** 2);
      for (const channel of channels) {
        assert.equal(channel.length, pcm.length);
        assert.ok(channel.every((value) => value === 0));
      }
    }
  });

  it('encodes a source at any explicit listener position as silent', () => {
    const pcm = [2, -2];
    const channels = encodeAmbisonics([3, -1, 0.5], pcm, {
      order: 1,
      listenerPosition: [3, -1, 0.5],
    });
    for (const channel of channels) {
      assert.ok(channel.every((value) => value === 0));
    }
  });

  it('normalizes non-unit direction vectors', () => {
    const pcm = [1];
    const near = encodeAmbisonics([2, 0, 0], pcm, { order: 1 });
    const far = encodeAmbisonics([2000, 0, 0], pcm, { order: 1 });
    for (let acn = 0; acn < 4; acn += 1) {
      assert.ok(Math.abs(near[acn][0] - far[acn][0]) < 1e-14);
    }
  });

  it('applies listener offsets before computing the direction', () => {
    const pcm = [1];
    const channels = encodeAmbisonics([1, 1, 0], pcm, {
      order: 1,
      listenerPosition: [1, 0, 0],
    });
    assert.ok(Math.abs(channels[1][0] - 1) < 1e-12); // local +Y
    assert.ok(Math.abs(channels[3][0]) < 1e-12);
  });

  it('rejects non-finite source positions', () => {
    assert.throws(() => encodeAmbisonics([1, NaN, 0], [1], { order: 1 }),
      TypeError);
    assert.throws(() => encodeAmbisonics([1, Infinity, 0], [1],
      { order: 1 }), TypeError);
    assert.throws(() => localDirection([1], [0, 0, 0]), TypeError);
  });

  it('rejects non-finite PCM samples', () => {
    assert.throws(
      () => encodeAmbisonics([1, 0, 0], [1, NaN, 2], { order: 1 }),
      TypeError);
    assert.throws(
      () => encodeAmbisonics([1, 0, 0], [1, Infinity], { order: 1 }),
      TypeError);
  });

  it('rejects unsupported order and normalization values', () => {
    assert.throws(() => encodeAmbisonics([1, 0, 0], [1], { order: 0 }),
      RangeError);
    assert.throws(
      () => encodeAmbisonics([1, 0, 0], [1], { normalization: 'FuMa' }),
      RangeError);
  });

  it('rejects malformed rotations and zero quaternions', () => {
    assert.throws(() => normalizeRotation([1, 0, 0]), TypeError);
    assert.throws(() => normalizeRotation([0, 0, 0, 0]), RangeError);
    assert.throws(() => normalizeRotation([[1, 0], [0, 1], [0, 0]]),
      TypeError);
    assert.throws(
      () => encodeAmbisonics([1, 0, 0], [1], {
        order: 1,
        sceneRotation: [1, 2, 3],
      }),
      TypeError);
  });

  it('treats a null/undefined scene rotation as identity', () => {
    const pcm = [0.5];
    const a = encodeAmbisonics([1, 0, 0], pcm, { order: 1 });
    const b = encodeAmbisonics([1, 0, 0], pcm, {
      order: 1,
      sceneRotation: undefined,
    });
    for (let acn = 0; acn < 4; acn += 1) {
      assert.equal(a[acn][0], b[acn][0]);
    }
  });
});
