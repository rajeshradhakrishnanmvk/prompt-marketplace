/**
 * Multi-sheet assembly. Each part is a normal hinge tree (see runtime.js).
 * After the folds, parts tween from their `from` translation to the dock
 * matrix3d. The scene is Z-up; rotateX(90deg) maps it into CSS y-down.
 * Flap math is unchanged. Existing single-sheet models never come through here.
 */
import { multiply, rotateX, translate, transformPoint } from "./matrix.js";
import { easeInOut, prepare, sample, worldMatrices } from "./runtime.js";

export function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

export function paintRegions(part) {
  const { s, ox, oy } = part.uv;
  return part.flaps.map((flap) => flap.poly.map(([x, y]) => [x * s + ox, y * s + oy]));
}

export function paintCreases(part) {
  const { s, ox, oy } = part.uv;
  const uv = (x, y) => [x * s + ox, y * s + oy];
  const lines = [];
  for (const flap of part.flaps) {
    if (!flap.hinge) continue;
    const [x, y] = flap.hinge.p;
    const [dx, dy] = flap.hinge.axis;
    lines.push([uv(x, y), uv(x + dx, y + dy), flap.angle < 0 ? "mountain" : "valley"]);
  }
  return lines;
}

export function paintSeeds(part) {
  const { s, ox, oy } = part.uv;
  return part.flaps.map((flap) => {
    const [x, y] = centroid(flap.poly);
    return [x * s + ox, y * s + oy];
  });
}

/**
 * Exact dock matrix from the geometry file, then the spec's clearance:
 * the 20° tilt pushes the power-boom mouth ~3.5 into the bus wall.
 * Shift the dock 3.5 units OUTWARD along the boom axis (sheet +X, the
 * first column of matrix3d) so the mouth backs out of wall5.
 */
export function dockMatrix(part) {
  const m = part.dock.matrix3d.slice();
  const clearance = part.clearance || 0;
  if (clearance) {
    m[12] += m[0] * clearance;
    m[13] += m[1] * clearance;
    m[14] += m[2] * clearance;
  }
  return m;
}

function lerpDock(part, u) {
  const end = dockMatrix(part);
  const from = part.from && part.from.translate;
  if (!from) return end;
  const m = end.slice();
  m[12] = from[0] + (end[12] - from[0]) * u;
  m[13] = from[1] + (end[13] - from[1]) * u;
  m[14] = from[2] + (end[14] - from[2]) * u;
  return m;
}

function easeOutCubic(u) {
  return 1 - (1 - u) ** 3;
}

export function prepareAssembly(model) {
  let cursor = 0;
  const built = model.parts.map((part) => {
    const prep = prepare({ flaps: part.flaps, steps: part.steps });
    const foldStart = cursor;
    cursor += prep.duration;
    return { part, prep, foldStart, foldEnd: cursor };
  });
  const asmStart = cursor;
  const fromById = {};
  const dockSteps = (model.assemblySteps || []).map((step) => {
    if (step.from) fromById[step.part] = step.from;
    const dur = (step.ms || 800) / 1000;
    const start = cursor;
    cursor += dur;
    return { ...step, kind: "dock", dur, start, end: cursor, moves: [] };
  });
  const turnDur = 2.4;
  const turn = {
    kind: "turn",
    label: "Turn the finished paper model.",
    dur: turnDur,
    flip: 28,
    start: cursor,
    end: cursor + turnDur,
    part: null,
    moves: [],
  };
  cursor += turnDur;
  const steps = [];
  for (const item of built) {
    for (const s of item.prep.steps) {
      steps.push({
        kind: "fold",
        part: item.part.id,
        label: s.label,
        dur: s.dur,
        start: item.foldStart + s.start,
        end: item.foldStart + s.end,
        moves: s.moves || [],
      });
    }
  }
  steps.push(...dockSteps, turn);
  return {
    assembly: true,
    parts: built.map((item) => ({
      ...item.part,
      prep: item.prep,
      foldStart: item.foldStart,
      foldEnd: item.foldEnd,
      from: fromById[item.part.id] || null,
    })),
    steps,
    duration: cursor || 1,
    asmStart,
    ids: built.flatMap((item) => item.part.flaps.map((flap) => `${item.part.id}:${flap.id}`)),
  };
}

export function sampleAssembly(prep, time) {
  const t = Math.max(0, Math.min(prep.duration, time));
  let stepIndex = prep.steps.length - 1;
  for (let i = 0; i < prep.steps.length; i += 1) {
    if (t < prep.steps[i].end || i === prep.steps.length - 1) {
      stepIndex = i;
      break;
    }
  }
  const step = prep.steps[stepIndex];
  const angles = {};
  const visible = {};
  const docks = {};
  let pulse = null;
  const phase = t < prep.asmStart ? "fold" : "assembly";

  if (phase === "fold") {
    const active = prep.parts.find((part) => part.id === step.part) || prep.parts[0];
    visible[active.id] = true;
    const sampled = sample(active.prep, t - active.foldStart);
    for (const [id, angle] of Object.entries(sampled.angles)) angles[`${active.id}:${id}`] = angle;
  } else {
    for (const part of prep.parts) {
      const sampled = sample(part.prep, part.prep.duration);
      for (const [id, angle] of Object.entries(sampled.angles)) angles[`${part.id}:${id}`] = angle;
      const dockStep = prep.steps.find((s) => s.kind === "dock" && s.part === part.id);
      if (!dockStep || t + 1e-9 < dockStep.start) continue;
      visible[part.id] = true;
      const raw = dockStep.dur <= 0 ? 1 : Math.max(0, Math.min(1, (t - dockStep.start) / dockStep.dur));
      docks[part.id] = lerpDock(part, easeOutCubic(raw));
      if (raw > 0.72 && t <= dockStep.end + 1e-9) pulse = { part: part.id, u: (raw - 0.72) / 0.28 };
    }
  }

  let flip = 0;
  const turn = prep.steps[prep.steps.length - 1];
  if (turn && turn.kind === "turn" && t >= turn.start) {
    const raw = Math.max(0, Math.min(1, (t - turn.start) / turn.dur));
    flip = (turn.flip || 0) * easeInOut(raw);
  }

  const assembly = { phase, visible, docks, pulse, active: step.part || null };
  angles.assembly = assembly;
  return {
    angles,
    assembly,
    stepIndex,
    label: step ? step.label : "",
    flip,
    t,
  };
}

export function renderMatrix(hingeM, dockM, scale, rotateDeg, pulseScale) {
  let placed = hingeM;
  if (dockM) {
    let dock = dockM;
    if (pulseScale && pulseScale !== 1) {
      dock = dock.slice();
      for (let i = 0; i < 12; i += 1) dock[i] *= pulseScale;
    }
    placed = multiply(rotateX(rotateDeg), multiply(dock, hingeM));
  }
  const S = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1];
  return multiply(translate(0.5, 0.5, 0), multiply(S, placed));
}

/** Hinge-tree matrices in sheet centimetres. */
export function hingeMatrices(part, angles) {
  const local = {};
  for (const flap of part.flaps) local[flap.id] = angles[`${part.id}:${flap.id}`] || 0;
  return worldMatrices({ flaps: part.flaps }, part.prep, local, 1e12);
}

/** Z-up centimetres, before the CSS rotateX and the scene scale. For checks. */
export function assemblyPoint(hingeM, dockM, x, y) {
  return transformPoint(multiply(dockM, hingeM), x, y, 0);
}
