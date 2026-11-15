import { acnIndex, BASIS_MATRICES, channelCount } from './constants.js';

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectFiniteVector(vector, label) {
  if (!Array.isArray(vector) || vector.length !== 3 ||
      !vector.every(isFiniteNumber)) {
    throw new TypeError(`${label} must be an array of three finite numbers`);
  }
}

// Accept either a unit quaternion [x, y, z, w] or a 3x3 rotation matrix.
export function normalizeRotation(rotation) {
  if (rotation == null) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }

  if (Array.isArray(rotation) && rotation.length === 4 &&
      rotation.every(isFiniteNumber)) {
    const [qx, qy, qz, qw] = rotation;
    const norm = Math.hypot(qx, qy, qz, qw);
    if (norm === 0) {
      throw new RangeError('quaternion rotation must not be zero length');
    }
    const x = qx / norm;
    const y = qy / norm;
    const z = qz / norm;
    const w = qw / norm;
    const x2 = x * x;
    const y2 = y * y;
    const z2 = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;
    return [
      [1 - 2 * (y2 + z2), 2 * (xy - wz), 2 * (xz + wy)],
      [2 * (xy + wz), 1 - 2 * (x2 + z2), 2 * (yz - wx)],
      [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (x2 + y2)],
    ];
  }

  if (Array.isArray(rotation) && rotation.length === 3 &&
      rotation.every((row) => Array.isArray(row) && row.length === 3 &&
        row.every(isFiniteNumber))) {
    return rotation.map((row) => [...row]);
  }

  throw new TypeError(
    'rotation must be a quaternion [x, y, z, w] or a 3x3 matrix');
}

function multiplyVector(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] +
      matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] +
      matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] +
      matrix[2][2] * vector[2],
  ];
}

// Degree 1 follows ACN [Y_1,-1, Y_1,0, Y_1,+1] = [y, z, x].
const DEGREE1_ACN = [
  acnIndex(1, -1),
  acnIndex(1, 0),
  acnIndex(1, 1),
];
const CARTESIAN_AXIS = [1, 2, 0]; // ACN slot -> x/y/z component index.

function degree1Rotation(matrix) {
  const result = Array.from({ length: 3 }, () => new Array(3).fill(0));
  for (let out = 0; out < 3; out += 1) {
    for (let input = 0; input < 3; input += 1) {
      result[out][input] =
        matrix[CARTESIAN_AXIS[out]][CARTESIAN_AXIS[input]];
    }
  }
  return result;
}

function frobeniusSquared(matrix) {
  let total = 0;
  for (const row of matrix) {
    for (const value of row) {
      total += value * value;
    }
  }
  return total;
}

// Project every rotated basis polynomial onto the original basis. Rotating
// vectors by R sends M to R M R^T because p(R^T v) = v^T (R M R^T) v.
function degree2Rotation(matrix) {
  const acnList = Object.keys(BASIS_MATRICES[2])
    .map(Number)
    .sort((a, b) => a - b);
  const transpose = [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];

  function rotateMatrix(basis) {
    const temp = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        let sum = 0;
        for (let k = 0; k < 3; k += 1) {
          sum += basis[row][k] * transpose[k][col];
        }
        temp[row][col] = sum;
      }
    }
    const rotated = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        let sum = 0;
        for (let k = 0; k < 3; k += 1) {
          sum += matrix[row][k] * temp[k][col];
        }
        rotated[row][col] = sum;
      }
    }
    return rotated;
  }

  const result = Array.from({ length: 5 }, () => new Array(5).fill(0));
  for (let input = 0; input < 5; input += 1) {
    const inputAcn = acnList[input];
    const rotated = rotateMatrix(BASIS_MATRICES[2][inputAcn]);
    for (let out = 0; out < 5; out += 1) {
      const target = BASIS_MATRICES[2][acnList[out]];
      let dot = 0;
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          dot += rotated[row][col] * target[row][col];
        }
      }
      result[out][input] = dot / frobeniusSquared(target);
    }
  }
  return result;
}

// Block-diagonal ACN rotation matrix for orders 0..`order`.
// Rotation mixes only channels of the same degree.
export function rotationMatrix(order, rotation) {
  const matrix = normalizeRotation(rotation);
  const size = channelCount(order);
  const block = Array.from({ length: size }, () => new Array(size).fill(0));
  block[0][0] = 1;

  if (order >= 1) {
    const degree1 = degree1Rotation(matrix);
    for (let out = 0; out < 3; out += 1) {
      for (let input = 0; input < 3; input += 1) {
        block[DEGREE1_ACN[out]][DEGREE1_ACN[input]] = degree1[out][input];
      }
    }
  }

  if (order >= 2) {
    const degree2 = degree2Rotation(matrix);
    const base = acnIndex(2, -2);
    for (let out = 0; out < 5; out += 1) {
      for (let input = 0; input < 5; input += 1) {
        block[base + out][base + input] = degree2[out][input];
      }
    }
  }

  return block;
}

// Apply a rotation to encoded B-format channels (planar ACN arrays).
export function rotateAmbisonics(channels, rotation) {
  const block = rotationMatrix(
    Math.round(Math.sqrt(channels.length)) - 1,
    rotation);
  const frameCount = channels[0].length;
  return channels.map((_, out) => {
    const output = new Float64Array(frameCount);
    for (let input = 0; input < channels.length; input += 1) {
      const weight = block[out][input];
      if (weight === 0) continue;
      const inputChannel = channels[input];
      for (let frame = 0; frame < frameCount; frame += 1) {
        output[frame] += weight * inputChannel[frame];
      }
    }
    return output;
  });
}

export { multiplyVector, expectFiniteVector };
