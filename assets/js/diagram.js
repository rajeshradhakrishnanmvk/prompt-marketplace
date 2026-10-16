import { prepare, sample } from "./runtime.js";
import { projectPolygons } from "./project.js";

export function drawStepDiagram(svg, model, stepIndex) {
  const prep = prepare(model);
  const step = prep.steps[stepIndex];
  if (!step) return;
  const sampled = sample(prep, Math.max(0, step.end - 0.0001));
  const camera = {
    rx: (model.camera && model.camera.rx) || -56,
    ry: (model.camera && model.camera.ry) || -28,
    rz: (model.camera && model.camera.rz) || 0,
    flip: sampled.flip || 0,
    perspective: (model.camera && model.camera.perspective) || 980,
  };
  const polys = projectPolygons(model, prep, sampled.angles, camera, 100);
  const moving = new Set((step.moves || []).map((m) => m.flap));
  const ns = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", "-28 -28 156 156");
  svg.replaceChildren();
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("x", "-28");
  bg.setAttribute("y", "-28");
  bg.setAttribute("width", "156");
  bg.setAttribute("height", "156");
  bg.setAttribute("fill", "#f7f1e6");
  svg.append(bg);
  for (const poly of polys) {
    const node = document.createElementNS(ns, "polygon");
    node.setAttribute("points", poly.pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));
    node.setAttribute("fill", moving.has(poly.flapId) ? "#f3c1b8" : "#fffaf3");
    node.setAttribute("stroke", moving.has(poly.flapId) ? "#9f2a1c" : "#1d1a16");
    node.setAttribute("stroke-width", moving.has(poly.flapId) ? "1.4" : "0.6");
    svg.append(node);
  }
}
