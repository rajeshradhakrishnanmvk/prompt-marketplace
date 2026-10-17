import { multiply, rotateX, rotateY, rotateZ, transformPoint } from "./matrix.js";
import { sample, worldMatrices } from "./runtime.js";
import { dockMatrix, hingeMatrices, renderMatrix } from "./assembly.js";

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
  if (model.type === "assembly") return buildAssembly(model, prep, angles, camera, size).polys;
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
  if (model.type === "assembly") return buildAssembly(model, prep, angles, camera, size).tris;
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

function samplePixel(image, u, v) {
  if (!image || typeof image.getContext !== "function" || !image.width || !image.height) return null;
  const x = Math.max(0, Math.min(image.width - 1, Math.round(u * (image.width - 1))));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(v * (image.height - 1))));
  const px = image.getContext("2d").getImageData(x, y, 1, 1).data;
  if (px[3] < 8) return null;
  return `${px[0]},${px[1]},${px[2]}`;
}

/** Colour of a fan diagonal when the whole triangle is one solid paint colour. */
function solidSeamColor(image, tri) {
  const at = (u, v) => samplePixel(image, tri.facing >= 0 ? u : 1 - u, v);
  const mid = at((tri.p0.u + tri.p2.u) / 2, (tri.p0.v + tri.p2.v) / 2);
  const colors = [at(tri.p0.u, tri.p0.v), at(tri.p1.u, tri.p1.v), at(tri.p2.u, tri.p2.v), mid];
  if (colors.some((c) => !c || c !== colors[0])) return null;
  return `rgba(${colors[0]},1)`;
}

function movePoint(p, fit) {
  if (!fit) return p;
  return { ...p, x: p.x * fit.scale + fit.dx, y: p.y * fit.scale + fit.dy };
}

/**
 * Scale that keeps every pose in the timeline inside the frame.
 * baseCamera.ry is the resting yaw; each step's flip is added on top.
 */
function fitBox(minX, minY, maxX, maxY, size, margin) {
  if (!Number.isFinite(minX)) return { scale: 1, dx: 0, dy: 0 };
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const pad = size * margin;
  const inner = Math.max(1, size - pad * 2);
  const scale = Math.min(inner / bw, inner / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, dx: size / 2 - cx * scale, dy: size / 2 - cy * scale };
}

/** Fit one pose. Used by nets, whose flat sheet is much larger than the folded body. */
export function poseFit(model, prep, angles, camera, size, margin = 0.08) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const tris = projectFlaps(model, prep, angles, camera, size);
  for (const tri of tris) {
    for (const p of [tri.p0, tri.p1, tri.p2]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return fitBox(minX, minY, maxX, maxY, size, margin);
}

export function frameFit(model, prep, baseCamera, size, margin = 0.06) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const sampled = sample(prep, (i / steps) * prep.duration);
    const camera = {
      rx: baseCamera.rx || 0,
      ry: (baseCamera.ry || 0) + (sampled.flip || 0),
      rz: baseCamera.rz || 0,
      perspective: baseCamera.perspective,
      flip: 0,
    };
    const tris = projectFlaps(model, prep, sampled.angles, camera, size);
    for (const tri of tris) {
      for (const p of [tri.p0, tri.p1, tri.p2]) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!Number.isFinite(minX)) return { scale: 1, dx: 0, dy: 0 };
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const pad = size * margin;
  const inner = Math.max(1, size - pad * 2);
  const scale = Math.min(inner / bw, inner / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { scale, dx: size / 2 - cx * scale, dy: size / 2 - cy * scale };
}

export function paintProjection(ctx, model, prep, angles, camera, front, back, size, fit, textures) {
  if (model.type === "assembly") {
    paintAssembly(ctx, model, prep, angles, camera, front, back, size, fit, textures);
    return;
  }
  const tris = projectFlaps(model, prep, angles, camera, size).map((tri) => ({
    ...tri,
    p0: movePoint(tri.p0, fit),
    p1: movePoint(tri.p1, fit),
    p2: movePoint(tri.p2, fit),
  }));
  const w = front.width || 1024;
  const h = front.height || 1024;
  const drawTri = (tri) => {
    const image = tri.facing >= 0 ? front : back;
    const uv = (p) => ({
      x: (tri.facing >= 0 ? p.u : 1 - p.u) * w,
      y: p.v * h,
    });
    drawTexturedTriangle(ctx, image, uv(tri.p0), uv(tri.p1), uv(tri.p2), tri.p0, tri.p1, tri.p2);
  };
  ctx.save();
  ctx.strokeStyle = "rgba(28, 24, 18, 0.45)";
  ctx.lineWidth = Math.max(1, size / 280);
  ctx.lineJoin = "round";
  if (model.shape !== "net") {
    for (const tri of tris) drawTri(tri);
    for (const tri of tris) {
      ctx.beginPath();
      ctx.moveTo(tri.p0.x, tri.p0.y);
      ctx.lineTo(tri.p1.x, tri.p1.y);
      ctx.lineTo(tri.p2.x, tri.p2.y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const faces = projectPolygons(model, prep, angles, camera, size).map((poly) => ({
    ...poly,
    pts: poly.pts.map((p) => movePoint(p, fit)),
  }));
  const byFlap = new Map();
  for (const tri of tris) {
    if (!byFlap.has(tri.flapId)) byFlap.set(tri.flapId, []);
    byFlap.get(tri.flapId).push(tri);
  }
  for (const face of faces) {
    const faceTris = byFlap.get(face.flapId) || [];
    for (const tri of faceTris) drawTri(tri);
    if (faceTris.length > 1) {
      const seam = Math.max(1.5, size / 200);
      for (const tri of faceTris) {
        const color = solidSeamColor(tri.facing >= 0 ? front : back, tri);
        if (!color) continue;
        ctx.beginPath();
        ctx.moveTo(tri.p0.x, tri.p0.y);
        ctx.lineTo(tri.p2.x, tri.p2.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = seam;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(28, 24, 18, 0.45)";
      ctx.lineWidth = Math.max(1, size / 280);
    }
    if (face.pts.length < 2) continue;
    ctx.beginPath();
    face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function projectVertex(m, u, v, uv, rig, persp, size) {
  const [x, y, z] = transformPoint(m, u, v, 0);
  const [rx, ry, rz] = transformPoint(rig, x - 0.5, y - 0.5, z);
  const zpx = rz * size;
  const denom = persp - zpx;
  const k = Math.abs(denom) < 0.001 ? 1 : persp / denom;
  return {
    u: u * uv.s + uv.ox,
    v: v * uv.s + uv.oy,
    x: size / 2 + rx * size * k,
    y: size / 2 + ry * size * k,
    z: zpx,
  };
}

function buildAssembly(model, prep, angles, camera, size) {
  const state = (angles && angles.assembly) || { phase: "assembly", visible: null, docks: null, pulse: null };
  const scale = (model.scene && model.scene.scale) || 1 / 700;
  const rotateDeg = model.scene && model.scene.rotateX != null ? model.scene.rotateX : 90;
  const rig = rigMatrix(camera);
  const persp = camera.perspective || 900;
  const tris = [];
  const polys = [];
  for (const part of prep.parts) {
    if (state.visible && !state.visible[part.id]) continue;
    const hinges = hingeMatrices(part, angles || {});
    const folding = state.phase === "fold";
    const dockM = folding ? null : (state.docks && state.docks[part.id]) || dockMatrix(part);
    const pulseScale = state.pulse && state.pulse.part === part.id ? 1 + 0.045 * Math.sin(state.pulse.u * Math.PI) : 1;
    for (const flap of part.flaps) {
      if (!flap.poly || flap.poly.length < 3 || !hinges[flap.id]) continue;
      const M = renderMatrix(hinges[flap.id], dockM, scale, rotateDeg, pulseScale);
      const cam = flap.poly.map(([u, v]) => projectVertex(M, u, v, part.uv, rig, persp, size));
      const z = cam.reduce((sum, p) => sum + p.z, 0) / cam.length;
      polys.push({ flapId: flap.id, partId: part.id, pts: cam, z });
      for (let i = 1; i < cam.length - 1; i += 1) {
        const p0 = cam[0];
        const p1 = cam[i];
        const p2 = cam[i + 1];
        const facing = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
        tris.push({ flapId: flap.id, partId: part.id, p0, p1, p2, facing, z: (p0.z + p1.z + p2.z) / 3 });
      }
    }
  }
  tris.sort((a, b) => a.z - b.z);
  polys.sort((a, b) => a.z - b.z);
  return { tris, polys };
}

function paintAssembly(ctx, model, prep, angles, camera, front, back, size, fit, textures) {
  const built = buildAssembly(model, prep, angles, camera, size);
  const faces = built.polys.map((poly) => ({ ...poly, pts: poly.pts.map((p) => movePoint(p, fit)) }));
  const tris = built.tris.map((tri) => ({
    ...tri,
    p0: movePoint(tri.p0, fit),
    p1: movePoint(tri.p1, fit),
    p2: movePoint(tri.p2, fit),
  }));
  const byFlap = new Map();
  for (const tri of tris) {
    const key = `${tri.partId}:${tri.flapId}`;
    if (!byFlap.has(key)) byFlap.set(key, []);
    byFlap.get(key).push(tri);
  }
  const pair = (partId) => {
    if (textures && textures[partId]) return textures[partId];
    return { front, back };
  };
  ctx.save();
  ctx.lineJoin = "round";
  for (const face of faces) {
    const images = pair(face.partId);
    const faceTris = byFlap.get(`${face.partId}:${face.flapId}`) || [];
    for (const tri of faceTris) {
      const image = tri.facing >= 0 ? images.front : images.back;
      const w = image.width || 1024;
      const h = image.height || 1024;
      const uv = (p) => ({ x: (tri.facing >= 0 ? p.u : 1 - p.u) * w, y: p.v * h });
      drawTexturedTriangle(ctx, image, uv(tri.p0), uv(tri.p1), uv(tri.p2), tri.p0, tri.p1, tri.p2);
    }
    if (faceTris.length > 1) {
      const seam = Math.max(1.5, size / 200);
      for (const tri of faceTris) {
        const image = tri.facing >= 0 ? images.front : images.back;
        const color = solidSeamColor(image, tri);
        if (!color) continue;
        ctx.beginPath();
        ctx.moveTo(tri.p0.x, tri.p0.y);
        ctx.lineTo(tri.p2.x, tri.p2.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = seam;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
    if (face.pts.length < 2) continue;
    ctx.beginPath();
    face.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(28, 24, 18, 0.45)";
    ctx.lineWidth = Math.max(1, size / 280);
    ctx.stroke();
  }
  ctx.restore();
}
