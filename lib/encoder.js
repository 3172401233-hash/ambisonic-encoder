import {
  channelCount,
  n3dFactor,
  sn3dHarmonics,
} from './constants.js';
import {
  expectFiniteVector,
  isFiniteNumber,
  multiplyVector,
  normalizeRotation,
  rotateAmbisonics,
} from './rotation.js';

// Direction from the listener to the source expressed in the listener's
// local frame (+x front, +y left, +z up). Returns null when the source is
// exactly at the listener position.
export function localDirection(sourcePosition, listenerPosition, orientation) {
  expectFiniteVector(sourcePosition, 'sourcePosition');
  expectFiniteVector(listenerPosition, 'listenerPosition');

  const world = [
    sourcePosition[0] - listenerPosition[0],
    sourcePosition[1] - listenerPosition[1],
    sourcePosition[2] - listenerPosition[2],
  ];
  const distance = Math.hypot(world[0], world[1], world[2]);
  if (distance === 0) {
    return null;
  }

  const frame = normalizeRotation(orientation);
  const local = multiplyVector(
    [
      [frame[0][0], frame[1][0], frame[2][0]],
      [frame[0][1], frame[1][1], frame[2][1]],
      [frame[0][2], frame[1][2], frame[2][2]],
    ],
    world);
  const norm = Math.hypot(local[0], local[1], local[2]);
  return [local[0] / norm, local[1] / norm, local[2] / norm];
}

function validatePcm(pcm) {
  if (typeof pcm !== 'object' || pcm === null ||
    typeof pcm.length !== 'number' ||
    (pcm.length !== 0 && typeof pcm[0] === 'undefined')) {
    throw new TypeError('pcm must be an array or typed array of samples');
  }
  for (let index = 0; index < pcm.length; index += 1) {
    if (!isFiniteNumber(pcm[index])) {
      throw new TypeError(`pcm[${index}] must be a finite number`);
    }
  }
  return pcm.length;
}

// Encode one source into planar ACN B-format channels.
//
// options:
//   order: 1 (4 channels) or 2 (9 channels).
//   normalization: 'SN3D' (default) or 'N3D'.
//   listenerPosition: [x, y, z], defaults to the origin.
//   listenerOrientation: quaternion [x, y, z, w] or 3x3 matrix.
//   sceneRotation: quaternion or 3x3 matrix applied to the encoded scene.
//
// A source at the listener position produces silent channels rather than
// throwing, so zero-distance and silent blocks stay deterministic.
export function encodeAmbisonics(sourcePosition, pcm, options = {}) {
  const order = options.order ?? 1;
  if (order !== 1 && order !== 2) {
    throw new RangeError('order must be 1 or 2');
  }
  const normalization = options.normalization ?? 'SN3D';
  if (normalization !== 'SN3D' && normalization !== 'N3D') {
    throw new RangeError("normalization must be 'SN3D' or 'N3D'");
  }

  const frameCount = validatePcm(pcm);
  const listenerPosition = options.listenerPosition ?? [0, 0, 0];
  const direction = localDirection(
    sourcePosition,
    listenerPosition,
    options.listenerOrientation);

  const count = channelCount(order);
  const channels = Array.from(
    { length: count },
    () => new Float64Array(frameCount));

  if (direction === null || frameCount === 0) {
    return channels;
  }

  const gains = sn3dHarmonics(order, direction);
  if (normalization === 'N3D') {
    for (let acn = 0; acn < count; acn += 1) {
      const degree = Math.floor(Math.sqrt(acn));
      gains[acn] *= n3dFactor(degree);
    }
  }

  for (let acn = 0; acn < count; acn += 1) {
    const gain = gains[acn];
    if (gain === 0) continue;
    const output = channels[acn];
    for (let frame = 0; frame < frameCount; frame += 1) {
      output[frame] = gain * pcm[frame];
    }
  }

  if (options.sceneRotation != null) {
    return rotateAmbisonics(channels, options.sceneRotation);
  }
  return channels;
}
