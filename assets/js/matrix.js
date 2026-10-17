/**
 * Column-major 4×4 matrices that match CSS transforms
 * (x right, y down, z toward the viewer, clockwise-positive).
 * This module is the source of truth for both the CSS fold and the
 * canvas re-render.
 */

export function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function translate(x, y, z) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** CSS rotate3d(). Angle is degrees. Axis is normalised. */
export function rotate3d(x, y, z, deg) {
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  const m11 = t * x * x + c;
  const m12 = t * x * y - s * z;
  const m13 = t * x * z + s * y;
  const m21 = t * x * y + s * z;
  const m22 = t * y * y + c;
  const m23 = t * y * z - s * x;
  const m31 = t * x * z - s * y;
  const m32 = t * y * z + s * x;
  const m33 = t * z * z + c;
  return [m11, m21, m31, 0, m12, m22, m32, 0, m13, m23, m33, 0, 0, 0, 0, 1];
}

export function rotateX(deg) {
  return rotate3d(1, 0, 0, deg);
}
export function rotateY(deg) {
  return rotate3d(0, 1, 0, deg);
}
export function rotateZ(deg) {
  return rotate3d(0, 0, 1, deg);
}

/** Hinge fold matching `transform-origin` + `translateZ` + `rotate3d`. */
export function hingeMatrix(hinge, angleDeg, zUnit) {
  if (!hinge) return translate(0, 0, zUnit);
  const ox = hinge.p[0];
  const oy = hinge.p[1];
  const r = rotate3d(hinge.axis[0], hinge.axis[1], 0, angleDeg);
  return multiply(translate(ox, oy, zUnit), multiply(r, translate(-ox, -oy, 0)));
}

export function transformPoint(m, x, y, z = 0) {
  const x1 = m[0] * x + m[4] * y + m[8] * z + m[12];
  const y1 = m[1] * x + m[5] * y + m[9] * z + m[13];
  const z1 = m[2] * x + m[6] * y + m[10] * z + m[14];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  const iw = w === 0 ? 1 : 1 / w;
  return [x1 * iw, y1 * iw, z1 * iw];
}

export function cssMatrix3d(m) {
  return `matrix3d(${m.map((n) => +n.toFixed(6)).join(",")})`;
}
