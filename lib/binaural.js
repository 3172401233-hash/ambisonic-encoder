import { n3dFactor } from './constants.js';

// First-order energy-preserving virtual microphones steered at +Y (left
// ear) and -Y (right). With SN3D weights w_l = Y_l(+/-Y) / 2 the pair
// satisfies left^2 + right^2 = s^2 for every direction: it is a unitary
// split of the first-order lateral component. N3D inputs are converted per
// channel before decoding.
const SN3D_WEIGHTS = {
  left: {
    0: 0,
    1: 0.5,
    2: 0,
    3: 0,
  },
  right: {
    0: 0,
    1: 0.5,
    2: 0,
    3: 0,
  },
};

function asSn3d(channels, normalization) {
  if (normalization === 'SN3D') {
    return channels;
  }
  return channels.map((channel, acn) => {
    const degree = Math.floor(Math.sqrt(acn));
    const scale = 1 / n3dFactor(degree);
    const scaled = new Float64Array(channel.length);
    for (let frame = 0; frame < channel.length; frame += 1) {
      scaled[frame] = channel[frame] * scale;
    }
    return scaled;
  });
}

export function decodeBinaural(channels, normalization = 'SN3D') {
  if (normalization !== 'SN3D' && normalization !== 'N3D') {
    throw new RangeError("normalization must be 'SN3D' or 'N3D'");
  }
  const sn3d = asSn3d(channels, normalization);
  const frameCount = sn3d[0].length;
  const left = new Float64Array(frameCount);
  const right = new Float64Array(frameCount);

  for (const [acn, channel] of sn3d.entries()) {
    const leftWeight = SN3D_WEIGHTS.left[acn] ?? 0;
    const rightWeight = SN3D_WEIGHTS.right[acn] ?? 0;
    if (leftWeight === 0 && rightWeight === 0) continue;
    for (let frame = 0; frame < frameCount; frame += 1) {
      left[frame] += leftWeight * channel[frame];
      right[frame] += rightWeight * channel[frame];
    }
  }

  return { left, right };
}

// Sum of left and right signal energy across every frame.
export function binauralEnergy(binaural) {
  let total = 0;
  for (const value of binaural.left) {
    total += value * value;
  }
  for (const value of binaural.right) {
    total += value * value;
  }
  return total;
}
