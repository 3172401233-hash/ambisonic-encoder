import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { binauralEnergy, decodeBinaural } from '../lib/binaural.js';
import { encodeAmbisonics } from '../lib/encoder.js';

function approx(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) < epsilon,
    `${actual} !~ ${expected}`);
}

const LATERAL_AXES = [
  { name: 'left', position: [0, 1, 0], sign: 1 },
  { name: 'right', position: [0, -1, 0], sign: -1 },
];

const SIX_AXES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

describe('binaural direction and power', () => {
  const pcm = Float64Array.from([0.6, -1.2, 0.4, 1.7]);
  const inputEnergy = pcm.reduce((sum, value) => sum + value * value, 0);

  for (const normalization of ['SN3D', 'N3D']) {
    describe(normalization, () => {
      for (const axis of LATERAL_AXES) {
        it(`places ${axis.name} with matching polarity in both ear signals`, () => {
          const encoded = encodeAmbisonics(axis.position, pcm, {
            order: 1,
            normalization,
          });
          const ears = decodeBinaural(encoded, normalization);
          for (const [frame, sample] of pcm.entries()) {
            approx(ears.left[frame], 0.5 * axis.sign * sample);
            approx(ears.right[frame], 0.5 * axis.sign * sample);
          }
        });
      }

      it('silences the binaural pair for non-lateral axes', () => {
        for (const position of SIX_AXES.slice(0, 2).concat(SIX_AXES.slice(4))) {
          const ears = decodeBinaural(
            encodeAmbisonics(position, pcm, { order: 1, normalization }),
            normalization);
          for (const value of ears.left) approx(value, 0);
          for (const value of ears.right) approx(value, 0);
        }
      });

      it('keeps summed binaural energy equal to the lateral input power on every axis', () => {
        const expected = SIX_AXES.map((position) => {
          const lateralGain = position[1];
          return (lateralGain * lateralGain * inputEnergy) / 2;
        });
        const energies = SIX_AXES.map((position) => {
          const encoded = encodeAmbisonics(position, pcm, {
            order: 1,
            normalization,
          });
          return binauralEnergy(decodeBinaural(encoded, normalization));
        });
        for (const [index, value] of energies.entries()) {
          approx(value, expected[index], 1e-10);
        }
      });

      it('tracks the lateral component y^2 for arbitrary directions', () => {
        const directions = [];
        for (let k = 0; k < 12; k += 1) {
          const azimuth = (k / 12) * Math.PI * 2;
          const elevation = ((k % 4) - 1.5) * 0.35;
          directions.push([
            Math.cos(elevation) * Math.cos(azimuth),
            Math.cos(elevation) * Math.sin(azimuth),
            Math.sin(elevation),
          ]);
        }
        for (const position of directions) {
          const encoded = encodeAmbisonics(position, pcm, {
            order: 1,
            normalization,
          });
          const value = binauralEnergy(decodeBinaural(encoded, normalization));
          approx(value, position[1] * position[1] * inputEnergy / 2, 1e-10);
        }
      });

      it('gives the same binaural output at order 2', () => {
        for (const position of SIX_AXES) {
          const first = decodeBinaural(
            encodeAmbisonics(position, pcm, {
              order: 1,
              normalization,
            }),
            normalization);
          const second = decodeBinaural(
            encodeAmbisonics(position, pcm, {
              order: 2,
              normalization,
            }),
            normalization);
          for (let frame = 0; frame < pcm.length; frame += 1) {
            approx(second.left[frame], first.left[frame]);
            approx(second.right[frame], first.right[frame]);
          }
        }
      });
    });
  }
});
