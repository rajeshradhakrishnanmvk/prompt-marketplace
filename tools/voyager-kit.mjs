/**
 * Build the Voyager assembly model and the printable sheet SVGs
 * from tools/voyager-geom.json. Geometry and matrix3d values are copied,
 * not retuned. The power-boom clearance is applied later, in assembly.js.
 */
import { readFileSync, writeFileSync } from "fs";
import { transformPoint } from "../assets/js/matrix.js";
import { prepareAssembly, sampleAssembly, hingeMatrices, assemblyPoint, dockMatrix } from "../assets/js/assembly.js";

const geom = JSON.parse(readFileSync(new URL("./voyager-geom.json", import.meta.url), "utf8"));

const CREDIT = "Inspired by NASA/JPL-Caltech's Voyager. Not endorsed by NASA.";

const FOLD = {
  "voyager-bus": {
    1: ["Fold the first five body walls up.", 2],
    2: ["Fold the other five body walls up.", 2],
    3: ["Fold the top of the body shut.", 2],
  },
  "voyager-dish": {
    1: ["Close the dish into a shallow cone.", 2.2],
  },
  "voyager-sci-boom": {
    1: ["Fold two walls of the science boom up.", 2],
    2: ["Fold the last boom wall and the end plate.", 2],
    3: ["Fold the scan platform.", 2],
  },
  "voyager-rtg-boom": {
    1: ["Fold the power strut into a square tube.", 2],
    2: ["Fold the power unit into a six-sided tube.", 2],
    3: ["Cap the ends of the power unit.", 2],
  },
};

const NAMES = { bus: "Body", dish: "Dish", sci: "Science boom", rtg: "Power boom" };
const BLURBS = {
  bus: "Decagonal body. Fold the walls up, then the top. The dashed circle is where the stylised Golden Record disc goes. This sheet has no glue tabs: every edge meets another face.",
  dish: "Eight triangles close into a shallow cone. Shaded tabs are only on the rim, which stays open.",
  sci: "Square tube, end plate, and scan platform. Shaded tabs are only on the mouth, which glues to the body.",
  rtg: "Square strut and a six-sided power unit. Shaded tabs are only on the strut mouth, which glues to the body. Paint three bands on the long tube.",
};

function hingeOf(hinge) {
  if (!hinge) return null;
  return {
    p: [hinge[0][0], hinge[0][1]],
    axis: [hinge[1][0] - hinge[0][0], hinge[1][1] - hinge[0][1]],
  };
}

function stepsFor(sheetId, flaps) {
  const groups = new Map();
  for (const flap of flaps) {
    if (!flap.step) continue;
    if (!groups.has(flap.step)) groups.set(flap.step, []);
    groups.get(flap.step).push(flap);
  }
  return [...groups.keys()].sort((a, b) => a - b).map((step) => {
    const [label, dur] = FOLD[sheetId][step];
    return {
      label,
      dur,
      moves: groups.get(step).map((flap) => ({ flap: flap.id, angle: flap.angle })),
    };
  });
}

function fitUv(flaps, pad = 0.07) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const flap of flaps) {
    for (const [x, y] of flap.poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const s = (1 - 2 * pad) / span;
  return {
    s,
    ox: 0.5 - ((minX + maxX) / 2) * s,
    oy: 0.5 - ((minY + maxY) / 2) * s,
  };
}

const bmin = geom.derived.assembly.bboxMin;
const bmax = geom.derived.assembly.bboxMax;
const span = Math.max(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]);

const parts = geom.parts.map((part) => {
  const sheet = geom.sheets[part.sheet];
  const flaps = sheet.flapsData.map((flap) => ({
    id: flap.id,
    parent: flap.parent,
    poly: flap.poly.map((p) => [p[0], p[1]]),
    hinge: hingeOf(flap.hinge),
    angle: flap.angle,
    step: flap.step,
  }));
  return {
    id: part.id,
    name: NAMES[part.id],
    sheet: part.sheet,
    order: part.order,
    clearance: part.id === "rtg" ? 3.5 : 0,
    dock: {
      translate: part.dock.translate.slice(),
      rotate: part.dock.rotate.slice(),
      matrix3d: part.dock.matrix3d.slice(),
    },
    uv: fitUv(flaps),
    flaps,
    steps: stepsFor(part.sheet, flaps),
  };
});

const assemblySteps = [
  { part: "bus", ms: 0, label: "Body ready" },
  { part: "dish", from: { translate: [0, 0, 300] }, ms: 800, label: "Attach the big dish" },
  { part: "sci", from: { translate: [400, 0, 0] }, ms: 800, label: "Slide in the science boom" },
  { part: "rtg", from: { translate: [-400, 0, 0] }, ms: 800, label: "Plug in the power boom" },
];

const model = {
  id: "voyager",
  name: "Voyager",
  type: "assembly",
  shape: "assembly",
  difficulty: 3,
  note: "Four sheets, not a square fold. Paint each one, then the parts fold and dock.",
  exterior: "painted",
  credit: CREDIT,
  camera: { rx: -36, ry: 32, rz: 0, perspective: 1100 },
  scene: {
    rotateX: 90,
    scale: 1.05 / span,
    frame: geom.conventions,
  },
  bbox: { min: bmin, max: bmax },
  parts,
  assemblySteps,
};

const prep = prepareAssembly(model);
const foldSteps = prep.steps.filter((step) => step.kind === "fold");
if (foldSteps.length !== 10) throw new Error(`expected 10 fold steps, got ${foldSteps.length}`);
const flapCount = parts.reduce((sum, part) => sum + part.flaps.filter((flap) => flap.parent).length, 0);
if (flapCount !== 37) throw new Error(`expected 37 flaps, got ${flapCount}`);
if (parts.length !== 4) throw new Error("expected 4 sheets");

function fullAngles(part) {
  const sampled = sampleAssembly(prep, part.foldEnd - 1e-6);
  return sampled.angles;
}

function distPointSeg(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const denom = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denom;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function faceGap(point, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) best = Math.min(best, distPointSeg(point, poly[i], poly[(i + 1) % poly.length]));
  const a = poly[0];
  const b = poly[1];
  const c = poly[2];
  const n = [
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
  ];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  n[0] /= nl;
  n[1] /= nl;
  n[2] /= nl;
  const dz = Math.abs((point[0] - a[0]) * n[0] + (point[1] - a[1]) * n[1] + (point[2] - a[2]) * n[2]);
  return Math.min(best, dz);
}

function sheetGaps(part) {
  const angles = fullAngles(part);
  const hinges = hingeMatrices(part, angles);
  const faces = {};
  for (const flap of part.flaps) {
    faces[flap.id] = flap.poly.map(([x, y]) => transformPoint(hinges[flap.id], x, y, 0));
  }
  const open = new Set((geom.checks[part.sheet].openEdgeList || []).map(([id, index]) => `${id}:${index}`));
  let worst = 0;
  for (const flap of part.flaps) {
    const poly = faces[flap.id];
    for (let i = 0; i < poly.length; i += 1) {
      if (open.has(`${flap.id}:${i}`)) continue;
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      let edgeBest = Infinity;
      for (const t of [0, 0.5, 1]) {
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        let near = Infinity;
        for (const [id, other] of Object.entries(faces)) {
          if (id === flap.id) continue;
          near = Math.min(near, faceGap(q, other));
        }
        edgeBest = Math.min(edgeBest, near);
      }
      worst = Math.max(worst, edgeBest);
    }
  }
  return worst;
}

for (const part of prep.parts) {
  const gap = sheetGaps(part);
  console.log(part.id, "closed-edge gap cm", gap.toExponential(2));
  if (gap > 0.2) throw new Error(`${part.id} seam gap ${gap} cm`);
}

const end = sampleAssembly(prep, prep.duration);
const bus = prep.parts[0];
const dish = prep.parts.find((part) => part.id === "dish");
const rtg = prep.parts.find((part) => part.id === "rtg");
const busH = hingeMatrices(bus, end.angles);
const dishH = hingeMatrices(dish, end.angles);
const rtgH = hingeMatrices(rtg, end.angles);
const apex = assemblyPoint(dishH.g0, dockMatrix(dish), 0, 0);
console.log("dish apex", apex.map((n) => +n.toFixed(3)));
if (Math.hypot(apex[0], apex[1], apex[2] - 23.5) > 0.05) throw new Error("dish apex missed the body top");

function mouthCenter(part, hinges) {
  const open = geom.checks[part.sheet].openEdgeList;
  const pts = [];
  for (const [id, index] of open) {
    const flap = part.flaps.find((item) => item.id === id);
    const a = flap.poly[index];
    const b = flap.poly[(index + 1) % flap.poly.length];
    const pa = assemblyPoint(hinges[id], dockMatrix(part), a[0], a[1]);
    const pb = assemblyPoint(hinges[id], dockMatrix(part), b[0], b[1]);
    pts.push([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
  }
  const c = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return c.map((n) => n / pts.length);
}

if (geom.checks["voyager-rtg-boom"].openEdgeList.length) {
  const mouth = mouthCenter(rtg, rtgH);
  console.log("rtg mouth", mouth.map((n) => +n.toFixed(3)));
  if (mouth[0] > -91) throw new Error("power boom still clips the bus");
}
const bottom = assemblyPoint(busH.bottom, dockMatrix(bus), 0, 0);
console.log("bus origin z", +bottom[2].toFixed(3));
if (Math.abs(bottom[2] + 23.5) > 0.05) throw new Error("bus dock z");

const num = (v) => String(Math.round(v * 1000) / 1000);

function edgeKey(a, b) {
  const r = (p) => `${num(p[0])},${num(p[1])}`;
  const pa = r(a);
  const pb = r(b);
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

function tabFor(poly, index) {
  const a = poly[index];
  const b = poly[(index + 1) % poly.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  let nx = -uy;
  let ny = ux;
  const c = centroid(poly);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((c[0] - mid[0]) * nx + (c[1] - mid[1]) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const inset = Math.min(len * 0.16, Math.max(1.5, len * 0.08));
  const depth = Math.min(9, Math.max(4.5, len * 0.16));
  const a2 = [a[0] + ux * inset, a[1] + uy * inset];
  const b2 = [b[0] - ux * inset, b[1] - uy * inset];
  return [a2, b2, [b2[0] + nx * depth, b2[1] + ny * depth], [a2[0] + nx * depth, a2[1] + ny * depth]];
}

function pointsAttr(poly) {
  return poly.map((p) => `${num(p[0])},${num(p[1])}`).join(" ");
}

function sheetSvg(part, index) {
  const open = new Map((geom.checks[part.sheet].openEdgeList || []).map(([id, edge]) => [`${id}:${edge}`, true]));
  const hingeKeys = new Set();
  for (const flap of part.flaps) {
    if (!flap.hinge) continue;
    const a = flap.hinge.p;
    const b = [a[0] + flap.hinge.axis[0], a[1] + flap.hinge.axis[1]];
    hingeKeys.add(edgeKey(a, b));
  }
  const tabs = [];
  for (const flap of part.flaps) {
    flap.poly.forEach((_, edge) => {
      if (open.has(`${flap.id}:${edge}`)) tabs.push(tabFor(flap.poly, edge));
    });
  }
  const marks = [];
  if (part.id === "bus") marks.push({ cx: 0, cy: 0, r: 18 });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const flap of part.flaps) flap.poly.forEach(([x, y]) => consider(x, y));
  for (const tab of tabs) tab.forEach(([x, y]) => consider(x, y));
  for (const mark of marks) {
    consider(mark.cx - mark.r, mark.cy - mark.r);
    consider(mark.cx + mark.r, mark.cy + mark.r);
  }
  let disc = null;
  if (part.id === "bus") {
    const r = 22;
    disc = { cx: maxX + r + 16, cy: (minY + maxY) / 2, r };
    consider(disc.cx - r - 2, disc.cy - r - 2);
    consider(disc.cx + r + 2, disc.cy + r + 2);
  }
  const pad = 8;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const vbW = maxX - minX;
  const vbH = maxY - minY;
  // Leave room for the heading and legends inside A4 and Letter with 8mm margins.
  let mmW = 170;
  let mmH = mmW * (vbH / vbW);
  if (mmH > 200) {
    mmH = 200;
    mmW = mmH * (vbW / vbH);
  }
  const stroke = Math.max(vbW, vbH) * 0.0035;
  const thin = stroke * 0.55;
  const lines = [];
  const seen = new Set();
  for (const flap of part.flaps) {
    for (let edge = 0; edge < flap.poly.length; edge += 1) {
      const a = flap.poly[edge];
      const b = flap.poly[(edge + 1) % flap.poly.length];
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      const hinge = hingeKeys.has(key);
      const tabbed = open.has(`${flap.id}:${edge}`);
      const dash = hinge || tabbed;
      lines.push(
        `<line x1="${num(a[0])}" y1="${num(a[1])}" x2="${num(b[0])}" y2="${num(b[1])}" fill="none" stroke="#1c1915" stroke-width="${num(dash ? thin : stroke)}" ${dash ? `stroke-dasharray="${num(stroke * 2.2)} ${num(stroke * 1.4)}"` : ""}/>`
      );
    }
  }
  const faces = part.flaps
    .map((flap) => `<polygon points="${pointsAttr(flap.poly)}" fill="#fffdf8" stroke="none"/>`)
    .join("");
  const tabShapes = tabs
    .map((tab) => `<polygon points="${pointsAttr(tab)}" fill="#f6e2b0" stroke="#1c1915" stroke-width="${num(stroke)}" stroke-linejoin="miter"/>`)
    .join("");
  const markSvg = marks
    .map((mark) => `<circle cx="${num(mark.cx)}" cy="${num(mark.cy)}" r="${num(mark.r)}" fill="none" stroke="#1c1915" stroke-width="${num(thin)}" stroke-dasharray="${num(stroke * 1.6)} ${num(stroke)}"/>`)
    .join("");
  const discSvg = disc
    ? `<g aria-hidden="true">
        <circle cx="${num(disc.cx)}" cy="${num(disc.cy)}" r="${num(disc.r)}" fill="#e4b24a" stroke="#1c1915" stroke-width="${num(stroke)}"/>
        <circle cx="${num(disc.cx)}" cy="${num(disc.cy)}" r="${num(disc.r * 0.72)}" fill="none" stroke="#8d5a34" stroke-width="${num(thin)}"/>
        <circle cx="${num(disc.cx)}" cy="${num(disc.cy)}" r="${num(disc.r * 0.38)}" fill="none" stroke="#8d5a34" stroke-width="${num(thin)}"/>
        <circle cx="${num(disc.cx)}" cy="${num(disc.cy)}" r="${num(disc.r * 0.08)}" fill="#1c1915"/>
      </g>`
    : "";
  return { mmW, mmH, disc: Boolean(disc), svg: `<svg class="kit-net" viewBox="${num(minX)} ${num(minY)} ${num(vbW)} ${num(vbH)}" width="${num(mmW)}mm" role="img" aria-label="${part.name} net, sheet ${index + 1} of 4">
  ${tabShapes}
  ${faces}
  ${lines.join("\n  ")}
  ${markSvg}
  ${discSvg}
</svg>` };
}

const sheetsHtml = parts
  .map((part, index) => {
    const drawn = sheetSvg(part, index);
    const discNote = drawn.disc
      ? `<p class="legend">The gold circle is a stylised Golden Record disc to cut out and glue on the dashed circle. It is a plain disc, not a copy of the record's cover.</p>`
      : "";
    return `<section class="kit-sheet" id="sheet-${part.id}">
  <h2>Sheet ${index + 1} of 4 — ${part.name}</h2>
  <p>${BLURBS[part.id]}</p>
  ${drawn.svg}
  ${discNote}
  <p class="legend">Cut on the solid lines. Fold on the dashed lines. Glue only the shaded tabs. Print at 100% scale. This drawing fits A4 and US Letter with margins.</p>
</section>`;
  })
  .join("\n");

writeFileSync("_data/models/voyager.json", `${JSON.stringify(model, null, 2)}\n`);
writeFileSync("_includes/voyager-sheets.html", `${sheetsHtml}\n`);
console.log("steps", prep.steps.length, "duration", prep.duration.toFixed(1), "scale", model.scene.scale);
console.log("wrote voyager model and kit sheets");
