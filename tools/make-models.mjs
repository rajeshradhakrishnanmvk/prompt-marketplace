import { mkdirSync, writeFileSync } from "fs";
import { prepare, worldMatrices } from "../assets/js/runtime.js";
import { transformPoint } from "../assets/js/matrix.js";

const r = (n) => Math.round(n * 10000) / 10000;
const P = (x, y) => [r(x), r(y)];
const Rpt = ([x, y]) => P(1 - y, 1 - x);
const RP = (poly) => poly.map(Rpt);

function hinge(a, b) {
  return { p: P(a[0], a[1]), axis: [r(b[0] - a[0]), r(b[1] - a[1])] };
}
function hingeR(a, b) {
  return hinge(Rpt(a), Rpt(b));
}
function flap(id, parent, poly, h) {
  return { id, parent, poly, hinge: h };
}
function anchor(id, parent, h) {
  return { id, parent, poly: [], hinge: h };
}

function pointAt(model, angles, id, uv) {
  const prep = prepare(model);
  const worlds = worldMatrices(model, prep, angles, 400);
  return transformPoint(worlds[id], uv[0], uv[1], 0);
}

function pickOn(model, base, id, child, uv, target) {
  let best = null;
  for (const ang of [180, -180]) {
    const p = pointAt(model, { ...base, [id]: ang }, child, uv);
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (!best || d < best.d) best = { ang, d, p };
  }
  if (best.d > 0.08) console.warn(id, "via", child, "flat miss", best.d.toFixed(3), best.p.map((n) => n.toFixed(2)));
  return best.ang;
}

function pickFlat(model, base, id, uv, target) {
  let best = null;
  for (const ang of [180, -180]) {
    const p = pointAt(model, { ...base, [id]: ang }, id, uv);
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (!best || d < best.d) best = { ang, d, p };
  }
  if (best.d > 0.08) console.warn(id, "flat miss", best.d.toFixed(3), best.p.map((n) => n.toFixed(2)));
  return best.ang;
}

function pickZ(model, base, id, uv, sign) {
  let best = null;
  for (const ang of [168, -168]) {
    const p = pointAt(model, { ...base, [id]: ang }, id, uv);
    const score = sign * p[2];
    if (!best || score < best.score) best = { ang, score, p };
  }
  return best.ang;
}

function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

const Q = r(Math.SQRT2 - 1);
const IQ = r(1 - Q);

function paperCup() {
  const tip = [P(0, 0), P(Q, 0), P(0, Q)];
  const right = [P(Q, 0), P(1, 0), P(IQ, Q)];
  const left = [P(0, Q), P(0, 1), P(Q, IQ)];
  const center = [P(Q, 0), P(IQ, Q), P(Q, IQ), P(0, Q)];
  const flaps = [
    flap("back-main", null, center, null),
    flap("back-right", "back-main", right, hinge(P(Q, 0), P(IQ, Q))),
    flap("back-left", "back-main", left, hinge(P(0, Q), P(Q, IQ))),
    flap("back-tip", "back-main", tip, hinge(P(Q, 0), P(0, Q))),
    flap("front-main", null, RP(center), hinge(P(1, 0), P(0, 1))),
    flap("front-right", "front-main", RP(right), hingeR(P(Q, 0), P(IQ, Q))),
    flap("front-left", "front-main", RP(left), hingeR(P(0, Q), P(Q, IQ))),
    flap("front-tip", "front-main", RP(tip), hingeR(P(Q, 0), P(0, Q))),
  ];
  const model = { flaps, steps: [] };
  const base = { "front-main": 180 };
  const backRight = pickFlat(model, {}, "back-right", P(1, 0), P(0, Q));
  const backLeft = pickFlat(model, {}, "back-left", P(0, 1), P(Q, 0));
  const rightAng = pickFlat(model, base, "front-right", Rpt(P(1, 0)), P(0, Q));
  const leftAng = pickFlat(model, base, "front-left", Rpt(P(0, 1)), P(Q, 0));
  const tipAng = pickFlat(model, { ...base, "front-right": rightAng, "front-left": leftAng }, "front-tip", Rpt(P(0, 0)), P(Q, Q));
  const backAng = -180;
  return {
    id: "paper-cup",
    name: "Paper Cup",
    difficulty: 1,
    note: "",
    camera: { rx: -68, ry: 24, rz: 45, perspective: 980 },
    flaps,
    creases: [
      [P(1, 0), P(0, 1), "valley"],
      [P(Q, 0), P(IQ, Q), "mountain"],
      [P(0, Q), P(Q, IQ), "mountain"],
      [P(Q, 0), P(0, Q), "valley"],
    ],
    steps: [
      { label: "Fold the square in half corner to corner to make a triangle.", dur: 1.5, moves: [{ flap: "front-main", angle: 180 }] },
      {
        label: "Fold the right corner over to touch the left edge.",
        dur: 1.4,
        moves: [
          { flap: "front-right", angle: rightAng },
          { flap: "back-right", angle: backRight },
        ],
      },
      {
        label: "Fold the left corner over to touch the right side.",
        dur: 1.4,
        moves: [
          { flap: "front-left", angle: leftAng },
          { flap: "back-left", angle: backLeft },
        ],
      },
      { label: "Fold the front layer of the top point down into the pocket in front.", dur: 1.5, moves: [{ flap: "front-tip", angle: tipAng }] },
      {
        label: "Turn it over and fold the other top point down the other way.",
        dur: 1.5,
        flip: 180,
        moves: [{ flap: "back-tip", angle: backAng }],
      },
      {
        label: "Gently squeeze the sides to open the cup.",
        dur: 1.7,
        flip: 0,
        moves: [{ flap: "front-main", angle: 132 }],
      },
    ],
  };
}

/** Point-down triangle models (camera rz 225): (0,0) is the bottom point. */
function animalFlaps({ ears, brim, topFold, tuck }) {
  const sideL = [P(0.5, 0), P(0.5, 0.5), P(0.75, 0.25)];
  const upL = [P(1, 0), P(0.5, 0), P(0.75, 0.25)];
  const hornL = [P(1, 0), P(0.78, 0), P(0.86, 0.14)];
  const upLRest = [P(0.78, 0), P(0.5, 0), P(0.75, 0.25)];
  const sideR = [P(0, 0.5), P(0.5, 0.5), P(0.25, 0.75)];
  const upR = [P(0, 1), P(0, 0.5), P(0.25, 0.75)];
  const hornR = [P(0, 1), P(0, 0.78), P(0.14, 0.86)];
  const upRRest = [P(0, 0.78), P(0, 0.5), P(0.25, 0.75)];
  // Side-flap point (1,0) reflects across this crease to about (0.82, 0.29),
  // above the diamond (s≈1.11), so the ears stand up and out.
  const earL = [P(1, 0), P(0.54, 0), P(0.66, 0.34)];
  const earLRest = [P(0.54, 0), P(0.5, 0), P(0.5, 0.5), P(0.66, 0.34)];
  const earR = [P(0, 1), P(0, 0.54), P(0.34, 0.66)];
  const earRRest = [P(0, 0.54), P(0, 0.5), P(0.5, 0.5), P(0.34, 0.66)];
  const top = [P(0.5, 0.5), P(0.34, 0.5), P(0.5, 0.34)];
  const nose = [P(0.5, 0.5), P(0.43, 0.5), P(0.5, 0.43)];
  const topRest = [P(0.43, 0.5), P(0.34, 0.5), P(0.5, 0.34), P(0.5, 0.43)];
  // Brim creases are chosen so the tip first lands at s≈0.9, then the
  // doubled edge lies on the horn-base line (0.50,0.28)–(0.36,0.36).
  const brimTip = [P(0, 0), P(0.141, 0), P(0, 0.249)];
  const brimBody = [P(0.141, 0), P(0.45, 0), P(0, 0.45), P(0, 0.249)];

  let center;
  if (brim) center = [P(0.45, 0), P(0.5, 0), P(0.5, 0.5), P(0, 0.5), P(0, 0.45)];
  else if (topFold) center = [P(0, 0), P(0.5, 0), P(0.5, 0.34), P(0.34, 0.5), P(0, 0.5)];
  else center = [P(0, 0), P(0.5, 0), P(0.5, 0.5), P(0, 0.5)];

  const backRight = [P(0.5, 0), P(1, 0), P(0.5, 0.5)];
  const backLeft = [P(0, 0.5), P(0, 1), P(0.5, 0.5)];
  let backMain;
  let backTip;
  let tuckPoly = null;
  if (tuck) {
    const B = 0.26;
    const A = 0.55;
    tuckPoly = [P(0, 0), P(B, 0), P(0, B)];
    backTip = [P(B, 0), P(0.5, 0), P(0.5, A - 0.5), P(A - 0.5, 0.5), P(0, 0.5), P(0, B)];
    backMain = [P(0.5, A - 0.5), P(0.5, 0.5), P(A - 0.5, 0.5)];
  } else {
    backTip = [P(0, 0), P(0.42, 0), P(0, 0.42)];
    backMain = [P(0.42, 0), P(0.5, 0), P(0.5, 0.5), P(0, 0.5), P(0, 0.42)];
  }
  const flaps = [
    flap("back-main", null, backMain, null),
    flap("back-right", "back-main", backRight, hinge(P(0.5, 0), P(0.5, 0.5))),
    flap("back-left", "back-main", backLeft, hinge(P(0, 0.5), P(0.5, 0.5))),
    flap("back-tip", "back-main", backTip, tuck ? hinge(P(0.5, 0.05), P(0.05, 0.5)) : hinge(P(0.42, 0), P(0, 0.42))),
  ];
  if (tuckPoly) flaps.push(flap("tuck", "back-tip", tuckPoly, hinge(P(0.26, 0), P(0, 0.26))));
  flaps.push(flap("front-main", null, RP(center), hinge(P(1, 0), P(0, 1))));
  if (ears === "horns") {
    const upLBody = [P(0.78, 0), P(0.5, 0), P(0.75, 0.25), P(0.86, 0.14)];
    const upRBody = [P(0, 0.78), P(0, 0.5), P(0.25, 0.75), P(0.14, 0.86)];
    flaps.push(
      flap("side-l", "front-main", RP(sideL), hingeR(P(0.5, 0), P(0.5, 0.5))),
      flap("up-l", "side-l", RP(upLBody), hingeR(P(0.5, 0), P(0.75, 0.25))),
      flap("horn-l", "up-l", RP(hornL), hingeR(P(0.78, 0), P(0.86, 0.14))),
      flap("side-r", "front-main", RP(sideR), hingeR(P(0, 0.5), P(0.5, 0.5))),
      flap("up-r", "side-r", RP(upRBody), hingeR(P(0, 0.5), P(0.25, 0.75))),
      flap("horn-r", "up-r", RP(hornR), hingeR(P(0, 0.78), P(0.14, 0.86)))
    );
  } else if (ears === "cat") {
    flaps.push(
      flap("side-l", "front-main", RP(earLRest), hingeR(P(0.5, 0), P(0.5, 0.5))),
      flap("ear-l", "side-l", RP(earL), hingeR(P(0.54, 0), P(0.66, 0.34))),
      flap("side-r", "front-main", RP(earRRest), hingeR(P(0, 0.5), P(0.5, 0.5))),
      flap("ear-r", "side-r", RP(earR), hingeR(P(0, 0.54), P(0.34, 0.66)))
    );
  }
  if (topFold) {
    flaps.push(flap("top", "front-main", RP(topRest), hingeR(P(0.34, 0.5), P(0.5, 0.34))));
    flaps.push(flap("nose", "top", RP(nose), hingeR(P(0.43, 0.5), P(0.5, 0.43))));
  }
  if (brim) {
    flaps.push(flap("brim", "front-main", RP(brimBody), hingeR(P(0.45, 0), P(0, 0.45))));
    flaps.push(flap("brim-tip", "brim", RP(brimTip), hingeR(P(0.141, 0), P(0, 0.249))));
  }
  return flaps;
}

function cat() {
  const flaps = animalFlaps({ ears: "cat", topFold: true, tuck: true });
  const model = { flaps, steps: [] };
  const base = { "front-main": 180 };
  const leftAng = pickFlat(model, base, "side-l", Rpt(P(1, 0)), P(0, 0));
  const rightAng = pickFlat(model, base, "side-r", Rpt(P(0, 1)), P(0, 0));
  return {
    id: "cat-face",
    name: "Cat Face",
    difficulty: 1,
    note: "",
    camera: { rx: -8, ry: -6, rz: 225, perspective: 1600 },
    flaps,
    creases: [
      [P(1, 0), P(0, 1), "valley"],
      [P(0.5, 0), P(0.5, 0.5), "valley"],
      [P(0, 0.5), P(0.5, 0.5), "valley"],
      [P(0.54, 0), P(0.66, 0.34), "mountain"],
      [P(0, 0.54), P(0.34, 0.66), "mountain"],
      [P(0.34, 0.5), P(0.5, 0.34), "valley"],
      [P(0.42, 0), P(0, 0.42), "mountain"],
    ],
    steps: [
      { label: "Fold the square in half corner to corner to make a triangle.", dur: 1.15, moves: [{ flap: "front-main", angle: 180 }] },
      {
        label: "Fold the left and right corners down to the bottom corner.",
        dur: 1.15,
        moves: [
          { flap: "side-l", angle: leftAng },
          { flap: "side-r", angle: rightAng },
          { flap: "back-right", angle: 180 },
          { flap: "back-left", angle: 180 },
        ],
      },
      {
        label: "Fold the two top flaps up and out to make the ears.",
        dur: 1.2,
        moves: [
          { flap: "ear-l", angle: 180 },
          { flap: "ear-r", angle: -180 },
        ],
      },
      { label: "Fold the top corner down.", dur: 1.05, moves: [{ flap: "top", angle: 180 }] },
      {
        label: "Turn it over and fold the bottom layer up.",
        dur: 1.05,
        flip: 180,
        moves: [{ flap: "back-tip", angle: 180 }],
      },
      {
        label: "Fold the tip of the top layer down to make the nose.",
        dur: 1.05,
        flip: 0,
        moves: [{ flap: "nose", angle: 180 }],
      },
      { label: "Tuck the bottom corner inside the model.", dur: 1.1, moves: [{ flap: "tuck", angle: -180 }] },
      { label: "Draw on the eyes and whiskers.", dur: 1.25, moves: [] },
    ],
  };
}

function dog() {
  // Side corners fold down the cheeks. (1,0) reflects to about (0.30, 0.20).
  const earL = [P(1, 0), P(0.62, 0), P(0.72, 0.28)];
  const nose = [P(0, 0), P(0.16, 0), P(0.08, 0.08)];
  const faceLRest = [P(0.16, 0), P(0.62, 0), P(0.72, 0.28), P(0.5, 0.5), P(0.08, 0.08)];
  const earR = [P(0, 1), P(0, 0.62), P(0.28, 0.72)];
  const faceR = [P(0, 0), P(0, 0.62), P(0.28, 0.72), P(0.5, 0.5)];
  const backTop = [P(0.92, 0), P(1, 0), P(0, 1), P(0, 0.92)];
  const backRest = [P(0, 0), P(0.92, 0), P(0, 0.92)];
  const flaps = [
    flap("back-main", null, backRest, null),
    flap("back-top", "back-main", backTop, hinge(P(0.92, 0), P(0, 0.92))),
    anchor("front", null, hinge(P(1, 0), P(0, 1))),
    flap("face-l", "front", RP(faceLRest), null),
    flap("nose", "face-l", RP(nose), hingeR(P(0.16, 0), P(0.08, 0.08))),
    flap("ear-l", "face-l", RP(earL), hingeR(P(0.62, 0), P(0.72, 0.28))),
    flap("face-r", "front", RP(faceR), hingeR(P(0, 0), P(0.5, 0.5))),
    flap("ear-r", "face-r", RP(earR), hingeR(P(0, 0.62), P(0.28, 0.72))),
  ];
  const model = { flaps, steps: [] };
  const base = { front: 180 };
  const half = pickFlat(model, base, "face-r", Rpt(P(0, 0.8)), P(0.8, 0));
  const earLA = pickFlat(model, base, "ear-l", Rpt(P(1, 0)), P(0.3, 0.2));
  const earRA = pickFlat(model, base, "ear-r", Rpt(P(0, 1)), P(0.2, 0.3));
  const backAng = 180;
  return {
    id: "dog-face",
    name: "Dog Face",
    difficulty: 1,
    note: "",
    camera: { rx: -10, ry: 8, rz: 225, perspective: 1600 },
    flaps,
    creases: [
      [P(1, 0), P(0, 1), "valley"],
      [P(0, 0), P(0.5, 0.5), "valley"],
      [P(0.62, 0), P(0.72, 0.28), "valley"],
      [P(0, 0.62), P(0.28, 0.72), "valley"],
      [P(0.16, 0), P(0.08, 0.08), "mountain"],
      [P(0.92, 0), P(0, 0.92), "mountain"],
    ],
    steps: [
      {
        label: "Turn the square so it looks like a diamond. Fold the top corner down to the bottom corner to make a triangle.",
        dur: 1.5,
        moves: [{ flap: "front", angle: 180 }],
      },
      {
        label: "Fold the triangle in half side to side, then unfold it.",
        dur: 1.55,
        moves: [
          { flap: "face-r", angle: half, from: 0, to: 0.42 },
          { flap: "face-r", angle: 0, from: 0.58, to: 1 },
        ],
      },
      {
        label: "Fold both side corners down to make the floppy ears.",
        dur: 1.5,
        moves: [
          { flap: "ear-l", angle: earLA },
          { flap: "ear-r", angle: earRA },
        ],
      },
      { label: "Fold the bottom point of the top layer up a little to make the nose.", dur: 1.3, moves: [{ flap: "nose", angle: 62 }] },
      { label: "Fold the top edge back behind the head.", dur: 1.4, moves: [{ flap: "back-top", angle: backAng }] },
      { label: "Draw on the eyes and mouth.", dur: 1.75, moves: [] },
    ],
  };
}

function tulip() {
  const petalR = [P(0, 1), P(0, 0.375), P(0.208, 0.792)];
  const petalL = [P(1, 0), P(0.375, 0), P(0.792, 0.208)];
  const centerL = [P(0, 0), P(0.375, 0), P(0.792, 0.208), P(0.5, 0.5)];
  const centerR = [P(0, 0), P(0.5, 0.5), P(0.208, 0.792), P(0, 0.375)];
  const flaps = [
    anchor("front", null, hinge(P(1, 0), P(0, 1))),
    flap("center-l", "front", RP(centerL), null),
    flap("petal-l", "center-l", RP(petalL), hingeR(P(0.375, 0), P(0.792, 0.208))),
    flap("center-r", "front", RP(centerR), hinge(P(0, 0), P(0.5, 0.5))),
    flap("petal-r", "center-r", RP(petalR), hingeR(P(0, 0.375), P(0.208, 0.792))),
    flap("back", null, [P(0, 0), P(1, 0), P(0, 1)], null),
  ];
  const model = { flaps, steps: [] };
  const half = pickFlat(model, { front: 180 }, "center-r", Rpt(P(0, 0.7)), P(0.7, 0));
  const petL = pickFlat(model, { front: 180 }, "petal-l", Rpt(P(1, 0)), P(0.75, 0.5));
  const petR = pickFlat(model, { front: 180 }, "petal-r", Rpt(P(0, 1)), P(0.5, 0.75));
  return {
    id: "tulip",
    name: "Tulip",
    difficulty: 1,
    note: "This tulip is the flat flower head, with no stem.",
    camera: { rx: -12, ry: -8, rz: 225, perspective: 1600 },
    flaps,
    creases: [
      [P(1, 0), P(0, 1), "valley"],
      [P(0, 0), P(0.5, 0.5), "valley"],
      [P(0.375, 0), P(0.792, 0.208), "valley"],
      [P(0, 0.375), P(0.208, 0.792), "valley"],
    ],
    steps: [
      {
        label: "Turn the square so it looks like a diamond. Fold the top corner down to the bottom corner to make a triangle.",
        dur: 1.7,
        moves: [{ flap: "front", angle: 180 }],
      },
      {
        label: "Fold the triangle in half side to side, then unfold it.",
        dur: 1.5,
        moves: [
          { flap: "center-r", angle: half, from: 0, to: 0.42 },
          { flap: "center-r", angle: 0, from: 0.58, to: 1 },
        ],
      },
      { label: "Fold the right corner up at an angle so its tip sticks up above the top edge.", dur: 1.85, moves: [{ flap: "petal-r", angle: petR }] },
      { label: "Do the same with the left corner.", dur: 1.85, moves: [{ flap: "petal-l", angle: petL }] },
      {
        label: "Turn it over.",
        dur: 2.1,
        flip: 180,
        moves: [],
      },
    ],
  };
}

const builders = [paperCup, cat, dog, tulip];
mkdirSync("_data/models", { recursive: true });
for (const build of builders) {
  const m = build();
  const dur = m.steps.reduce((s, step) => s + step.dur, 0);
  if (dur < 8 || dur > 10.2) console.warn(m.id, "duration", dur.toFixed(2));
  const ids = new Set(m.flaps.map((f) => f.id));
  let cover = 0;
  for (const f of m.flaps) {
    if (f.parent && !ids.has(f.parent)) console.warn(m.id, "missing parent", f.parent);
    if (f.poly && f.poly.length >= 3) cover += area(f.poly);
    else if (f.poly && f.poly.length > 0 && f.poly.length < 3) console.warn(m.id, f.id, "short poly");
  }
  const expect = 1;
  if (Math.abs(cover - expect) > 0.04) console.warn(m.id, "coverage", cover.toFixed(3), "expected", expect);
  writeFileSync(`_data/models/${m.id}.json`, `${JSON.stringify(m, null, 2)}\n`);
  console.log(m.id, m.steps.length, "steps", dur.toFixed(2), "s", m.flaps.length, "flaps", "cover", cover.toFixed(3));
}
