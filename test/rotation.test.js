import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { channelCount } from '../lib/constants.js';
import { encodeAmbisonics, localDirection } from '../lib/encoder.js';
import {
  normalizeRotation,
  rotateAmbisonics,
  rotationMatrix,
} from '../lib/rotation.js';

function approx(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) < epsilon,
    `${actual} !~ ${expected}`);
}

// 90 degree yaw to the listener's left: +X(front) -> +Y(left),
// +Y(left) -> -X(back), +Z(up) stays fixed.
const YAW_LEFT = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, 1],
];
const YAW_LEFT_QUATERNION = [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)];

describe('rotation matrices', () => {
  for (const order of [1, 2]) {
    it(`order ${order} block is orthogonal`, () => {
      const block = rotationMatrix(order, YAW_LEFT);
      const size = channelCount(order);
      assert.equal(block.length, size);
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          let dot = 0;
          for (let k = 0; k < size; k += 1) {
            dot += block[row][k] * block[col][k];
          }
          approx(dot, row === col ? 1 : 0, 1e-11);
        }
      }
    });
  }

  it('quaternion and matrix describe the same yaw', () => {
    const fromQuaternion = normalizeRotation(YAW_LEFT_QUATERNION);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        approx(fromQuaternion[row][col], YAW_LEFT[row][col]);
      }
    }
  });

  it('rotates first-order ACN [W,Y,Z,X] with the correct axis mapping', () => {
    const block = rotationMatrix(1, YAW_LEFT);
    approx(block[3][3], 0); // old X...
    approx(block[1][3], 1); // ...lands on the Y (left) channel
    approx(block[3][1], -1); // old Y lands on -X (back)
    approx(block[2][2], 1); // Z is unchanged
    approx(block[0][0], 1); // W is unchanged
  });

  it('inverts only the up/down Z channel under a 180 degree pitch flip', () => {
    const pitchFlip = [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
    const block = rotationMatrix(1, pitchFlip);
    approx(block[2][2], -1); // up (+Z) becomes down
    approx(block[1][1], 1); // left/right stay put
    approx(block[3][3], -1); // front/back also invert on this rotation
    approx(block[0][0], 1);

    const pcm = [1];
    const upSource = encodeAmbisonics([0, 0, 1], pcm, { order: 1 });
    const flippedUp = rotateAmbisonics(upSource, pitchFlip);
    const downSource = encodeAmbisonics([0, 0, -1], pcm, { order: 1 });
    for (let acn = 0; acn < 4; acn += 1) {
      approx(flippedUp[acn][0], downSource[acn][0]);
    }
  });
});

describe('rotation round trip', () => {
  const pcm = Float64Array.from([0.2, -0.7, 1.1, 0.9, -0.4]);
  const inverse = [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ];

  for (const order of [1, 2]) {
    it(`order ${order} returns to the original encode`, () => {
      const original = encodeAmbisonics([0.4, -0.6, 0.25], pcm, { order });
      const rotated = rotateAmbisonics(original, YAW_LEFT);
      const restored = rotateAmbisonics(rotated, inverse);
      for (let acn = 0; acn < channelCount(order); acn += 1) {
        for (let frame = 0; frame < pcm.length; frame += 1) {
          approx(restored[acn][frame], original[acn][frame], 1e-11);
        }
      }
    });
  }
});

describe('scene rotation semantics', () => {
  const rotateVector = (matrix, vector) => [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] +
      matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] +
      matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] +
      matrix[2][2] * vector[2],
  ];

  it('matches a direct encode of the rotated direction for arbitrary rotations', () => {
    const directions = [
      [0.3, -0.5, 0.8],
      [1, 2, 3].map((value) => value / Math.hypot(1, 2, 3)),
      [-0.7, 0.2, -0.4],
    ];
    const angle = 0.7;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotations = [
      YAW_LEFT,
      [
        [1, 0, 0],
        [0, cos, -sin],
        [0, sin, cos],
      ],
    ];
    for (const matrix of rotations) {
      const block = rotationMatrix(2, matrix);
      for (const direction of directions) {
        const original = encodeAmbisonics(direction, [1], { order: 2 });
        const direct = encodeAmbisonics(rotateVector(matrix, direction), [1],
          { order: 2 });
        for (let out = 0; out < 9; out += 1) {
          let value = 0;
          for (let input = 0; input < 9; input += 1) {
            value += block[out][input] * original[input][0];
          }
          approx(value, direct[out][0], 1e-12);
        }
      }
    }
  });

  it('moves a front source onto the left ACN channel under left yaw', () => {
    const pcm = [1];
    const rotated = encodeAmbisonics([1, 0, 0], pcm, {
      order: 1,
      sceneRotation: YAW_LEFT,
    });
    approx(rotated[0][0], 1); // W
    approx(rotated[1][0], 1); // Y = left
    approx(rotated[2][0], 0); // Z
    approx(rotated[3][0], 0); // X
  });

  it('equals a listener yaw in the opposite direction', () => {
    const pcm = Float64Array.from([0.3, -0.9, 0.5, 1.2]);
    const viaScene = encodeAmbisonics([1, 0, 0], pcm, {
      order: 2,
      sceneRotation: YAW_LEFT,
    });
    // The listener turns right, so the front world source arrives from local +Y.
    const viaOrientation = encodeAmbisonics([1, 0, 0], pcm, {
      order: 2,
      listenerOrientation: inverseYaw(),
    });
    for (let acn = 0; acn < 9; acn += 1) {
      for (let frame = 0; frame < pcm.length; frame += 1) {
        approx(viaScene[acn][frame], viaOrientation[acn][frame], 1e-12);
      }
    }
  });

  it('rotating source and listener together leaves the encode unchanged', () => {
    const pcm = Float64Array.from([0.4, 0.1, -0.6]);
    const source = [0.5, -0.3, 0.8];
    const rotatedSource = [
      YAW_LEFT[0][0] * source[0] + YAW_LEFT[0][1] * source[1] +
        YAW_LEFT[0][2] * source[2],
      YAW_LEFT[1][0] * source[0] + YAW_LEFT[1][1] * source[1] +
        YAW_LEFT[1][2] * source[2],
      YAW_LEFT[2][0] * source[0] + YAW_LEFT[2][1] * source[1] +
        YAW_LEFT[2][2] * source[2],
    ];
    const original = encodeAmbisonics(source, pcm, { order: 2 });
    const rigidlyRotated = encodeAmbisonics(rotatedSource, pcm, {
      order: 2,
      listenerOrientation: YAW_LEFT_QUATERNION,
    });
    for (let acn = 0; acn < 9; acn += 1) {
      for (let frame = 0; frame < pcm.length; frame += 1) {
        approx(rigidlyRotated[acn][frame], original[acn][frame], 1e-11);
      }
    }
  });
});

describe('local direction transform', () => {
  it('uses the inverse of the listener orientation frame', () => {
    const direction = localDirection(
      [0, 1, 0],
      [0, 0, 0],
      YAW_LEFT_QUATERNION);
    // After a left yaw the listener front points at world +Y.
    approx(direction[0], 1);
    approx(direction[1], 0);
    approx(direction[2], 0);
  });
});

function inverseYaw() {
  return [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ];
}
