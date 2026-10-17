import { mkdirSync, writeFileSync } from "fs";
import { prepare, worldMatrices } from "../assets/js/runtime.js";
import { transformPoint } from "../assets/js/matrix.js";

const r = (n) => Math.round(n * 10000) / 10000;
const P = (x, y) => [r(x), r(y)];

function hinge(a, b) {
  return { p: P(a[0], a[1]), axis: [r(b[0] - a[0]), r(b[1] - a[1])] };
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

function inset(poly, f = 0.005) {
  const [cx, cy] = centroid(poly);
  return poly.map(([x, y]) => P(cx + (x - cx) * (1 - f), cy + (y - cy) * (1 - f)));
}

function rect(x0, y0, x1, y1) {
  return [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
}

function pointAt(model, angles, id) {
  const prep = prepare(model);
  const worlds = worldMatrices(model, prep, angles, 500);
  const flap = model.flaps.find((f) => f.id === id);
  const [cx, cy] = centroid(flap.poly);
  return transformPoint(worlds[id], cx, cy, 0);
}

const bwU = 24.3 / 11.8;
const blU = 36.6 / 11.8;
const wingU = 1.65;
const heightU = 1 + blU + 1 + blU;
const s = 0.9 / heightU;
const h = s;
const bw = s * bwU;
const bl = s * blU;
const wing = s * wingU;
const totalW = wing + h + bw + h + wing;
const ox = (1 - totalW) / 2;
const oy = (1 - 0.9) / 2;

const x0 = ox;
const x1 = x0 + wing;
const x2 = x1 + h;
const x3 = x2 + bw;
const x4 = x3 + h;
const x5 = x4 + wing;
const y0 = oy;
const y1 = y0 + h;
const y2 = y1 + bl;
const y3 = y2 + h;
const y4 = y3 + bl;

const full = {
  bottom: rect(x2, y1, x3, y2),
  front: rect(x2, y0, x3, y1),
  back: rect(x2, y2, x3, y3),
  lid: rect(x2, y3, x3, y4),
  left: rect(x1, y1, x2, y2),
  right: rect(x3, y1, x4, y2),
  "wing-l": rect(x0, y1, x1, y2),
  "wing-r": rect(x4, y1, x5, y2),
};

const flaps = [
  { id: "bottom", parent: null, poly: inset(full.bottom), hinge: null },
  { id: "front", parent: "bottom", poly: inset(full.front), hinge: hinge(P(x2, y1), P(x3, y1)) },
  { id: "back", parent: "bottom", poly: inset(full.back), hinge: hinge(P(x2, y2), P(x3, y2)) },
  { id: "lid", parent: "back", poly: inset(full.lid), hinge: hinge(P(x2, y3), P(x3, y3)) },
  { id: "left", parent: "bottom", poly: inset(full.left), hinge: hinge(P(x2, y1), P(x2, y2)) },
  { id: "wing-l", parent: "left", poly: inset(full["wing-l"]), hinge: hinge(P(x1, y1), P(x1, y2)) },
  { id: "right", parent: "bottom", poly: inset(full.right), hinge: hinge(P(x3, y1), P(x3, y2)) },
  { id: "wing-r", parent: "right", poly: inset(full["wing-r"]), hinge: hinge(P(x4, y1), P(x4, y2)) },
];

const sheet = [
  P(x2, y0), P(x3, y0), P(x3, y1), P(x5, y1), P(x5, y2), P(x3, y2),
  P(x3, y4), P(x2, y4), P(x2, y2), P(x0, y2), P(x0, y1), P(x2, y1),
];

function tab(a, b, dir, depth = 0.048) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const insetEdge = Math.min(0.012, len * 0.18);
  const a2 = [a[0] + ux * insetEdge, a[1] + uy * insetEdge];
  const b2 = [b[0] - ux * insetEdge, b[1] - uy * insetEdge];
  return [
    P(a2[0], a2[1]),
    P(b2[0], b2[1]),
    P(b2[0] + dir[0] * depth, b2[1] + dir[1] * depth),
    P(a2[0] + dir[0] * depth, a2[1] + dir[1] * depth),
  ];
}

const tabs = [
  tab(P(x1, y1), P(x2, y1), [0, -1]),
  tab(P(x2, y2), P(x1, y2), [0, 1]),
  tab(P(x4, y1), P(x3, y1), [0, -1]),
  tab(P(x3, y2), P(x4, y2), [0, 1]),
];

function printView(polys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const pad = 0.012;
  return [r((minX - pad) * 100), r((minY - pad) * 100), r((maxX - minX + pad * 2) * 100), r((maxY - minY + pad * 2) * 100)];
}

const model = { flaps, steps: [] };

function report(angles) {
  const ids = ["bottom", "front", "back", "lid", "left", "right", "wing-l", "wing-r"];
  for (const id of ids) {
    const p = pointAt(model, angles, id);
    console.log(id, p.map((n) => n.toFixed(3)).join(" "));
  }
}

const candidates = [-90, 90];
let best = null;
for (const front of candidates) {
  for (const back of candidates) {
    for (const left of candidates) {
      for (const right of candidates) {
        for (const lid of candidates) {
          const angles = { front, back, left, right, lid, "wing-l": 0, "wing-r": 0 };
          const pf = pointAt(model, angles, "front");
          const pb = pointAt(model, angles, "back");
          const pl = pointAt(model, angles, "left");
          const pr = pointAt(model, angles, "right");
          const pd = pointAt(model, angles, "lid");
          const bottom = pointAt(model, angles, "bottom");
          const upright = pf[2] > 0.03 && pb[2] > 0.03 && pl[2] > 0.03 && pr[2] > 0.03;
          const lidUp = pd[2] > pf[2] * 0.6;
          const lidOver = Math.abs(pd[0] - bottom[0]) < bw * 0.35 && Math.abs(pd[1] - bottom[1]) < bl * 0.35;
          const score = (upright ? 0 : 10) + (lidUp ? 0 : 5) + (lidOver ? 0 : 5)
            + Math.abs(Math.abs(pf[2]) - h / 2)
            + Math.abs(Math.abs(pl[2]) - h / 2);
          if (!best || score < best.score) best = { score, angles, lidOver, upright, lidUp };
        }
      }
    }
  }
}
console.log("best walls", best);

const wingChoices = [-90, 90];
let wings = null;
for (const wl of wingChoices) {
  for (const wr of wingChoices) {
    const angles = { ...best.angles, "wing-l": wl, "wing-r": wr };
    const left = pointAt(model, angles, "left");
    const right = pointAt(model, angles, "right");
    const lwing = pointAt(model, angles, "wing-l");
    const rwing = pointAt(model, angles, "wing-r");
    const out = lwing[0] < left[0] - 0.01 && rwing[0] > right[0] + 0.01;
    const flat = Math.abs(lwing[2] - left[2]) < h && Math.abs(rwing[2] - right[2]) < h;
    const score = (out ? 0 : 5) + (flat ? 0 : 3) + Math.abs(lwing[2] - left[2]) + Math.abs(rwing[2] - right[2]);
    if (!wings || score < wings.score) wings = { score, wl, wr, out, flat, lwing, rwing, left, right };
  }
}
console.log("best wings", wings);
console.log("deployed");
report({ ...best.angles, "wing-l": wings.wl, "wing-r": wings.wr });

const angles = { ...best.angles, "wing-l": wings.wl, "wing-r": wings.wr };
const creases = [
  [P(x2, y1), P(x3, y1), "valley"],
  [P(x2, y2), P(x3, y2), "valley"],
  [P(x2, y3), P(x3, y3), "valley"],
  [P(x2, y1), P(x2, y2), "valley"],
  [P(x3, y1), P(x3, y2), "valley"],
  [P(x1, y1), P(x1, y2), "valley"],
  [P(x4, y1), P(x4, y2), "valley"],
];

const out = {
  id: "marco",
  name: "MarCO",
  shape: "net",
  difficulty: 2,
  note: "A 6U CubeSat net, not a square fold. The wings stand in for the solar panels.",
  exterior: "painted",
  credit: "Reference: NASA/JPL-Caltech. This drawing is Foldly's own. NASA and JPL have not endorsed it.",
  camera: { rx: -38, ry: 32, rz: 0, perspective: 1200 },
  sheet: sheet.map((p) => P(p[0], p[1])),
  print_view: printView([sheet, ...tabs]),
  tabs,
  flaps,
  creases,
  steps: [
    {
      label: "Fold the four walls up so they stand around the floor.",
      dur: 2.2,
      moves: [
        { flap: "front", angle: angles.front },
        { flap: "back", angle: angles.back },
        { flap: "left", angle: angles.left },
        { flap: "right", angle: angles.right },
      ],
    },
    {
      label: "Fold the lid over the top. The lid stands in for the flat high-gain antenna.",
      dur: 1.8,
      moves: [{ flap: "lid", angle: angles.lid }],
    },
    {
      label: "Swing the two wings out. On the real spacecraft, these are the solar panels.",
      dur: 1.8,
      moves: [
        { flap: "wing-l", angle: angles["wing-l"] },
        { flap: "wing-r", angle: angles["wing-r"] },
      ],
    },
    {
      label: "Turn the finished paper model.",
      dur: 2.4,
      flip: 28,
      moves: [],
    },
  ],
};

mkdirSync("_data/models", { recursive: true });
writeFileSync("_data/models/marco.json", `${JSON.stringify(out, null, 2)}\n`);
console.log("wrote marco", "size", { h: r(h), bw: r(bw), bl: r(bl), wing: r(wing) });
