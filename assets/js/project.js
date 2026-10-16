import { multiply, rotateX, rotateY, rotateZ, transformPoint } from "./matrix.js";
import { worldMatrices } from "./runtime.js";

/**
 * Project flap polygons with the same hinge matrices the CSS view uses.
 * Returns painter-sorted triangles in stage pixel space.
 */
function rigMatrix(camera) {
  return multiply(
    rotateX(camera.rx || 0),
    multiply(rotateY(camera.ry || 0), multiply(rotateY(camera.flip || 0), rotateZ(camera.rz || 0)))
  );
}

export function projectPolygons(model, prep, angles, camera, size) {
  const worlds = worldMatrices(model, prep, angles, size);
  const rig = rigMatrix(camera);
  const persp = camera.perspective || 900;
  const polys = [];
  for (const flap of model.flaps) {
    const world = worlds[flap.id];
    if (!world || !flap.poly || flap.poly.length < 3) continue;
    const pts = flap.poly.map(([u, v]) => {
      const [x, y, z] = transformPoint(world, u, v, 0);
      const [rx, ry, rz] = transformPoint(rig, x - 0.5, y - 0.5, z);
      const zpx = rz * size;
      const denom = persp - zpx;
      const scale = Math.abs(denom) < 0.001 ? 1 : persp / denom;
      return { x: size / 2 + rx * size * scale, y: size / 2 + ry * size * scale, z: zpx };
    });
    const z = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polys.push({ flapId: flap.id, pts, z });
  }
  polys.sort((a, b) => a.z - b.z);
  return polys;
}

export function projectFlaps(model, prep, angles, camera, size) {
  const worlds = worldMatrices(model, prep, angles, size);
  const rig = rigMatrix(camera);
  const persp = camera.perspective || 900;
  const tris = [];
  for (const flap of model.flaps) {
    const world = worlds[flap.id];
    if (!world || !flap.poly || flap.poly.length < 3) continue;
    const cam = flap.poly.map(([u, v]) => {
      const [x, y, z] = transformPoint(world, u, v, 0);
      const [rx, ry, rz] = transformPoint(rig, x - 0.5, y - 0.5, z);
      const zpx = rz * size;
      const denom = persp - zpx;
      const scale = Math.abs(denom) < 0.001 ? 1 : persp / denom;
      return {
        u,
        v,
        x: size / 2 + rx * size * scale,
        y: size / 2 + ry * size * scale,
        z: zpx,
      };
    });
    for (let i = 1; i < cam.length - 1; i += 1) {
      const p0 = cam[0];
      const p1 = cam[i];
      const p2 = cam[i + 1];
      const facing = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
      tris.push({
        flapId: flap.id,
        p0,
        p1,
        p2,
        facing,
        z: (p0.z + p1.z + p2.z) / 3,
      });
    }
  }
  tris.sort((a, b) => a.z - b.z);
  return tris;
}

export function drawTexturedTriangle(ctx, image, s0, s1, s2, d0, d1, d2) {
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 1e-6) return;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

export function paintProjection(ctx, model, prep, angles, camera, front, back, size) {
  const tris = projectFlaps(model, prep, angles, camera, size);
  const w = front.width || 1024;
  const h = front.height || 1024;
  for (const tri of tris) {
    const image = tri.facing >= 0 ? front : back;
    const uv = (p) => ({
      x: (tri.facing >= 0 ? p.u : 1 - p.u) * w,
      y: p.v * h,
    });
    drawTexturedTriangle(ctx, image, uv(tri.p0), uv(tri.p1), uv(tri.p2), tri.p0, tri.p1, tri.p2);
  }
  ctx.save();
  ctx.strokeStyle = "rgba(28, 24, 18, 0.45)";
  ctx.lineWidth = Math.max(1, size / 280);
  ctx.lineJoin = "round";
  const seen = new Set();
  for (const tri of tris) {
    if (seen.has(tri.flapId)) continue;
    seen.add(tri.flapId);
  }
  for (const tri of tris) {
    ctx.beginPath();
    ctx.moveTo(tri.p0.x, tri.p0.y);
    ctx.lineTo(tri.p1.x, tri.p1.y);
    ctx.lineTo(tri.p2.x, tri.p2.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
