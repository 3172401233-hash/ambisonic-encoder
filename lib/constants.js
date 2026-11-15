// ACN channel ordering, SN3D real spherical harmonics and the symmetric
// matrices used to derive rotation matrices.
//
// Coordinate system (AmbiX convention, right handed):
//   +X = front, +Y = left, +Z = up, and front x left = up.

export const SQRT3 = Math.sqrt(3);

export function channelCount(order) {
  return (order + 1) * (order + 1);
}

// ACN index n = l * (l + 1) + m.
export function acnIndex(degree, order) {
  return degree * (degree + 1) + order;
}

export function degreeOf(acn) {
  return Math.floor(Math.sqrt(acn));
}

export function orderOf(acn) {
  const degree = degreeOf(acn);
  return acn - degree * (degree + 1);
}

// N3D channels are sqrt(2l + 1) times the SN3D channels of the same degree.
export function n3dFactor(degree) {
  return Math.sqrt(2 * degree + 1);
}

// SN3D real spherical harmonics Y_n for a unit direction vector.
// Returned array follows ACN and covers orders 0..`order`.
export function sn3dHarmonics(order, [x, y, z]) {
  const channels = new Array(channelCount(order)).fill(0);

  // Degree 0: W = 1.
  channels[0] = 1;

  if (order >= 1) {
    // ACN 1..3: Y_1,-1 = y, Y_1,0 = z, Y_1,+1 = x.
    channels[1] = y;
    channels[2] = z;
    channels[3] = x;
  }

  if (order >= 2) {
    const x2 = x * x;
    const y2 = y * y;
    const z2 = z * z;
    // ACN 4..8.
    channels[4] = SQRT3 * x * y;
    channels[5] = SQRT3 * y * z;
    channels[6] = (2 * z2 - x2 - y2) / 2;
    channels[7] = SQRT3 * z * x;
    channels[8] = (SQRT3 / 2) * (x2 - y2);
  }

  return channels;
}

function symmetric(entries) {
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const [row, col, value] of entries) {
    matrix[row][col] = value;
    matrix[col][row] = value;
  }
  return matrix;
}

// Degree-2 SN3D harmonics are homogeneous polynomials p(v) = v^T M v.
// The symmetric matrices are keyed by ACN index and let the degree-2
// rotation D matrix be derived generically instead of hand coding signs.
// Degree 1 is a plain vector rotation and is handled in rotation.js.
export const BASIS_MATRICES = {
  2: {
    [acnIndex(2, -2)]: symmetric([[0, 1, SQRT3 / 2]]), // sqrt(3) xy
    [acnIndex(2, -1)]: symmetric([[1, 2, SQRT3 / 2]]), // sqrt(3) yz
    [acnIndex(2, 0)]: symmetric([
      [0, 0, -0.5],
      [1, 1, -0.5],
      [2, 2, 1],
    ]), // (2z^2 - x^2 - y^2) / 2
    [acnIndex(2, 1)]: symmetric([[0, 2, SQRT3 / 2]]), // sqrt(3) zx
    [acnIndex(2, 2)]: symmetric([
      [0, 0, SQRT3 / 2],
      [1, 1, -SQRT3 / 2],
    ]), // sqrt(3)/2 (x^2 - y^2)
  },
};
