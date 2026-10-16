/**
 * Timeline + flap world matrices. Pure: no DOM.
 * Angles are absolute degrees at the end of each move.
 * A move may set `from` and `to` (0–1 of the step) so one labelled
 * step can play two beats, such as the frog's zigzag spring.
 */
import { identity, multiply, hingeMatrix } from "./matrix.js";

export function easeInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

export function prepare(model) {
  const ids = model.flaps.map((f) => f.id);
  const byId = Object.fromEntries(model.flaps.map((f) => [f.id, f]));
  const children = { "": [] };
  for (const f of model.flaps) {
    const key = f.parent || "";
    if (!children[key]) children[key] = [];
    children[key].push(f);
  }
  let duration = 0;
  const steps = model.steps.map((s) => {
    const start = duration;
    duration += s.dur;
    return { ...s, start, end: duration };
  });
  return { ids, byId, children, steps, duration: duration || 1 };
}

function applyMoves(angles, moves, raw) {
  for (const m of moves || []) {
    const from = m.from ?? 0;
    const to = m.to ?? 1;
    let u;
    if (raw <= from) u = 0;
    else if (raw >= to) u = 1;
    else u = easeInOut((raw - from) / (to - from));
    const base = angles[m.flap] ?? 0;
    angles[m.flap] = base + (m.angle - base) * u;
  }
}

function track(steps, time, key) {
  let value = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i];
    if (s[key] == null) continue;
    const inside = time < s.end || i === steps.length - 1;
    const raw = s.dur <= 0 ? 1 : clamp((time - s.start) / s.dur, 0, 1);
    const u = inside ? easeInOut(clamp(raw, 0, 1)) : 1;
    value += (s[key] - value) * (time >= s.start ? u : 0);
    if (time < s.end) break;
  }
  return value;
}

export function sample(prep, time) {
  const angles = {};
  for (const id of prep.ids) angles[id] = 0;
  const t = clamp(time, 0, prep.duration);
  let stepIndex = Math.max(0, prep.steps.length - 1);
  for (let i = 0; i < prep.steps.length; i += 1) {
    const s = prep.steps[i];
    const inside = t < s.end || i === prep.steps.length - 1;
    const raw = s.dur <= 0 ? 1 : clamp((t - s.start) / s.dur, 0, 1);
    applyMoves(angles, s.moves, inside ? raw : 1);
    if (inside) {
      stepIndex = i;
      break;
    }
  }
  const step = prep.steps[stepIndex];
  return {
    angles,
    stepIndex,
    label: step ? step.label : "",
    flip: track(prep.steps, t, "flip"),
    t,
  };
}

/** World matrix per flap in unit-square space. z is in the same units. */
export function worldMatrices(model, prep, angles, stagePx) {
  const map = {};
  const zUnit = 0.1 / (stagePx || 500);
  function walk(flap, parentM) {
    const layer = model.flaps.indexOf(flap);
    const local = hingeMatrix(flap.hinge, angles[flap.id] || 0, layer * zUnit);
    const world = multiply(parentM, local);
    map[flap.id] = world;
    for (const child of prep.children[flap.id] || []) walk(child, world);
  }
  for (const root of prep.children[""] || []) walk(root, identity());
  return map;
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Step boundary times in 0–1, for the reduced-motion Next button. */
export function stepMarks(prep) {
  return prep.steps.map((s) => s.end / prep.duration);
}
