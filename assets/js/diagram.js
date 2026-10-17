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
  if (model.shape === "net") fitDiagram(polys);
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

function fitDiagram(polys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return;
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const scale = Math.min(84 / bw, 84 / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (const poly of polys) {
    for (const p of poly.pts) {
      p.x = 50 + (p.x - cx) * scale;
      p.y = 50 + (p.y - cy) * scale;
    }
  }
}
