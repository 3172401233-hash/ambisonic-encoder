import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  channelCount,
  n3dFactor,
} from '../lib/constants.js';
import { encodeAmbisonics } from '../lib/encoder.js';

const AXES = [
  { name: 'front (+X)', position: [1, 0, 0], sign: [0, 0, 1] },
  { name: 'back (-X)', position: [-1, 0, 0], sign: [0, 0, -1] },
  { name: 'left (+Y)', position: [0, 1, 0], sign: [0, 1, 0] },
  { name: 'right (-Y)', position: [0, -1, 0], sign: [0, -1, 0] },
  { name: 'up (+Z)', position: [0, 0, 1], sign: [0, 1, 0] },
  { name: 'down (-Z)', position: [0, 0, -1], sign: [0, -1, 0] },
];

// First-order ACN: [W=1, Y=y, Z=z, X=x].
const FIRST_ORDER_SIGNS = [
  [1, 0, 0, 1],
  [1, 0, 0, -1],
  [1, 1, 0, 0],
  [1, -1, 0, 0],
  [1, 0, 1, 0],
  [1, 0, -1, 0],
];

// Second-order ACN: [W, Y, Z, X, R, S, T, U, V].
const SECOND_ORDER_SIGNS = [
  [1, 0, 0, 1, 0, 0, -0.5, 0, Math.sqrt(3) / 2],
  [1, 0, 0, -1, 0, 0, -0.5, 0, Math.sqrt(3) / 2],
  [1, 1, 0, 0, 0, 0, -0.5, 0, -Math.sqrt(3) / 2],
  [1, -1, 0, 0, 0, 0, -0.5, 0, -Math.sqrt(3) / 2],
  [1, 0, 1, 0, 0, 0, 1, 0, 0],
  [1, 0, -1, 0, 0, 0, 1, 0, 0],
];

function energy(channels) {
  return channels.reduce(
    (total, channel) => total + channel.reduce((sum, value) => sum + value * value, 0),
    0);
}

describe('six axial sources', () => {
  const pcm = Float64Array.from([1, 2, 3, 4]);
  const inputEnergy = pcm.reduce((sum, value) => sum + value * value, 0);

  for (const normalization of ['SN3D', 'N3D']) {
    describe(normalization, () => {
      for (const [axisIndex, axis] of AXES.entries()) {
        it(`encodes ${axis.name} at order 1`, () => {
          const channels = encodeAmbisonics(axis.position, pcm, {
            order: 1,
            normalization,
          });
          assert.equal(channels.length, 4);
          for (let acn = 0; acn < 4; acn += 1) {
            const expected = FIRST_ORDER_SIGNS[axisIndex][acn];
            for (const [frame, sample] of pcm.entries()) {
              const factor = normalization === 'N3D' && acn > 0
                ? n3dFactor(1)
                : 1;
              assert.ok(
                Math.abs(channels[acn][frame] - expected * factor * sample) < 1e-12);
            }
          }
        });

        it(`encodes ${axis.name} at order 2`, () => {
          const channels = encodeAmbisonics(axis.position, pcm, {
            order: 2,
            normalization,
          });
          assert.equal(channels.length, 9);
          for (let acn = 0; acn < 9; acn += 1) {
            const expected = SECOND_ORDER_SIGNS[axisIndex][acn];
            const degree = Math.floor(Math.sqrt(acn));
            const factor = normalization === 'N3D'
              ? n3dFactor(degree)
              : 1;
            for (const [frame, sample] of pcm.entries()) {
              assert.ok(
                Math.abs(channels[acn][frame] - expected * factor * sample) < 1e-12);
            }
          }
        });
      }

      it('keeps total channel energy constant for every axis at order 1', () => {
        for (const axis of AXES) {
          const channels = encodeAmbisonics(axis.position, pcm, {
            order: 1,
            normalization,
          });
          const expected = normalization === 'N3D'
            ? 4 * inputEnergy
            : 2 * inputEnergy;
          assert.ok(Math.abs(energy(channels) - expected) < 1e-10);
        }
      });

      it('keeps total channel energy constant for every axis at order 2', () => {
        for (const axis of AXES) {
          const channels = encodeAmbisonics(axis.position, pcm, {
            order: 2,
            normalization,
          });
          const expected = normalization === 'N3D'
            ? 9 * inputEnergy
            : 3 * inputEnergy;
          assert.ok(Math.abs(energy(channels) - expected) < 1e-10);
        }
      });
    });
  }
});

describe('chunked input', () => {
  const pcm = Float64Array.from({ length: 37 }, (_, index) =>
    Math.sin(index * 0.4) * 0.8);

  for (const order of [1, 2]) {
    it(`order ${order} block chunks concatenate to the full encode`, () => {
      const full = encodeAmbisonics([0.3, -0.4, 0.5], pcm, { order });
      const chunks = [];
      for (let start = 0; start < pcm.length; start += 8) {
        chunks.push(
          encodeAmbisonics([0.3, -0.4, 0.5], pcm.subarray(start, start + 8),
            { order }));
      }
      for (let acn = 0; acn < channelCount(order); acn += 1) {
        const stitched = new Float64Array(pcm.length);
        let offset = 0;
        for (const chunk of chunks) {
          stitched.set(chunk[acn], offset);
          offset += chunk[acn].length;
        }
        for (let frame = 0; frame < pcm.length; frame += 1) {
          assert.ok(Math.abs(stitched[frame] - full[acn][frame]) < 1e-14);
        }
      }
    });
  }

  it('encodes silent and zero-length blocks as silent channels', () => {
    const silent = encodeAmbisonics([1, 0, 0], new Float64Array(8),
      { order: 2 });
    assert.equal(silent.length, 9);
    for (const channel of silent) {
      assert.equal(channel.length, 8);
      assert.ok(channel.every((value) => value === 0));
    }

    const empty = encodeAmbisonics([1, 0, 0], [], { order: 1 });
    assert.equal(empty.length, 4);
    for (const channel of empty) {
      assert.equal(channel.length, 0);
    }
  });
});

describe('normalization', () => {
  it('N3D channels are the scaled SN3D channels of the same degree', () => {
    const pcm = [0.5, -1.5, 2];
    const sn3d = encodeAmbisonics([0.2, 0.3, -0.4], pcm, {
      order: 2,
      normalization: 'SN3D',
    });
    const n3d = encodeAmbisonics([0.2, 0.3, -0.4], pcm, {
      order: 2,
      normalization: 'N3D',
    });
    for (let acn = 0; acn < 9; acn += 1) {
      const degree = Math.floor(Math.sqrt(acn));
      for (let frame = 0; frame < pcm.length; frame += 1) {
        assert.ok(
          Math.abs(n3d[acn][frame] - n3dFactor(degree) * sn3d[acn][frame]) <
            1e-14);
      }
    }
  });
});
