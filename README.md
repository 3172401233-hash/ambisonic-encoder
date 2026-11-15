# ambisonic-encoder

Zero-dependency, ESM first- and second-order Ambisonic encoder for
JavaScript/Node.js. It turns a positioned mono PCM source into planar
ACN B-format channels in SN3D or N3D, relative to an oriented listener,
and can rotate the whole encoded scene.

## Conventions

### Coordinate system

The library uses the AmbiX right-handed coordinate system, which is where
"up/down flipped" and "left/right circled" bugs usually come from:

- `+X` = front, `-X` = back
- `+Y` = left, `-Y` = right
- `+Z` = up, `-Z` = down
- `front x left = up` (right handed)

All positions are `[x, y, z]` arrays in this frame. A source direction is
the normalized vector from the listener to the source, so only the
direction matters; distance does not change the encoding gains.

When importing assets from tools with other axes (for example `+Z` forward
or `+Y` up), convert positions before calling the encoder instead of
reordering channels afterward.

### Channel order (ACN)

Channels are always returned as planar arrays in ACN order
(`n = l(l+1) + m`), regardless of normalization:

| ACN | Degree `l` | Order `m` | First order | Second order |
| --- | ---------- | --------- | ----------- | ------------ |
| 0   | 0          | 0         | W           | W            |
| 1   | 1          | -1        | Y           | Y            |
| 2   | 1          | 0         | Z           | Z            |
| 3   | 1          | +1        | X           | X            |
| 4   | 2          | -2        |             | R            |
| 5   | 2          | -1        |             | S            |
| 6   | 2          | 0         |             | T            |
| 7   | 2          | +1        |             | U            |
| 8   | 2          | +2        |             | V            |

- First order: 4 channels (`[W, Y, Z, X]`).
- Second order: 9 channels (`[W, Y, Z, X, R, S, T, U, V]`).

This is the AmbiX ordering. FuMa (`[W, X, Y, Z]`, `[W, X, Y, Z, R, S, T, U, V]`)
is intentionally not emitted; convert ACN output explicitly when a legacy
tool expects FuMa.

### Normalization (SN3D / N3D)

The encoder emits real spherical harmonics:

- `SN3D` (default, AmbiX):
  - Degree 0: `W = 1`
  - Degree 1: `[Y, Z, X] = [y, z, x]`
  - Degree 2:
    `R = sqrt(3)xy`,
    `S = sqrt(3)yz`,
    `T = (2z^2 - x^2 - y^2) / 2`,
    `U = sqrt(3)zx`,
    `V = sqrt(3)/2 (x^2 - y^2)`
- `N3D` (orthonormal): each degree-`l` channel is `sqrt(2l + 1)` times its
  SN3D value, i.e. factors `1, sqrt(3), sqrt(5)` for degrees 0, 1, 2.

For a unit direction the total channel energy is:

- SN3D: `l + 1` times the input sample energy (2 for first order, 3 for
  second).
- N3D: `(l + 1)^2` times the input sample energy (4 for first order, 9 for
  second).

Rotation matrices are identical for SN3D and N3D because channels of the
same degree share one scaling factor.

### Rotation and listener orientation

Both `listenerOrientation` and `sceneRotation` accept either:

- a unit quaternion `[x, y, z, w]` (normalized internally; a zero
  quaternion throws), or
- a 3x3 rotation matrix as nested arrays.

- `listenerOrientation` rotates the listener frame. The world-space source
  direction is transformed by the inverse frame into local coordinates
  before encoding.
- `sceneRotation` applies the rotation to the encoded B-format signal with
  a block-diagonal ACN matrix: degree 0 is unchanged, degree 1 is a vector
  rotation, degree 2 is derived from the rotated quadratic basis matrices.
  Degrees are never mixed.
- A scene rotation by `R` is equivalent to rotating the listener by
  `R^-1`.

## API

```js
import {
  encodeAmbisonics,
  rotateAmbisonics,
  rotationMatrix,
  localDirection,
  decodeBinaural,
} from 'ambisonic-encoder';

const pcm = new Float64Array([0.1, 0.2, 0.3]);

const channels = encodeAmbisonics(
  [1, 0, 0],            // source position [x, y, z]
  pcm,                   // mono PCM, array or typed array
  {
    order: 2,                        // 1 or 2
    normalization: 'SN3D',           // 'SN3D' (default) or 'N3D'
    listenerPosition: [0, 0, 0],     // optional, defaults to the origin
    listenerOrientation: [0, 0, 0, 1], // optional quaternion or 3x3 matrix
    sceneRotation: [0, 0, 0, 1],     // optional quaternion or 3x3 matrix
  },
);
// channels: Float64Array[4] or Float64Array[9], one planar ACN channel each.
```

Helpers:

- `rotateAmbisonics(channels, rotation)` rotates already encoded blocks.
- `rotationMatrix(order, rotation)` returns the full ACN block matrix.
- `localDirection(source, listener, orientation)` returns the normalized
  local-frame unit vector, or `null` when the source is at the listener.
- `decodeBinaural(channels, normalization)` returns
  `{ left, right }` first-order virtual-mic signals; `binauralEnergy` sums
  their energy.

## Stable edge behavior

- Source at the listener (zero-length direction): all channels are silent
  rather than `NaN`; the function never throws for this case.
- Silent or empty PCM blocks: correctly sized all-zero channels.
- Chunked PCM: encoding is stateless per sample, so concatenating the
  planar outputs of consecutive blocks equals encoding the full block.
- Non-finite positions or PCM samples, bad order/normalization values, and
  malformed or zero rotations throw `TypeError` / `RangeError` with
  descriptive messages.
- All output channels are `Float64Array`, even for empty input.

## Tests

```sh
npm test        # node --test
```

The suite covers:

- all six axial sources (`+/-X`, `+/-Y`, `+/-Z`) at both orders and both
  normalizations, pinning every ACN coefficient including the up/down sign;
- total channel power invariance across axes for SN3D and N3D;
- rotation round trips, quaternion/matrix equivalence, block orthogonality,
  scene-rotation/listener-orientation equivalence, and rigid scene motion;
- binaural left/right polarity and summed energy for axial and arbitrary
  directions;
- zero-distance sources, silent/empty blocks, chunked input, and invalid
  arguments.
