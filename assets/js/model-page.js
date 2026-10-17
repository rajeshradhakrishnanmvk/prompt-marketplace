import { createFoldView, heroPapers, reducedMotion } from "./fold-view.js";
import { drawStepDiagram } from "./diagram.js";

const models = JSON.parse(document.getElementById("foldly-models").textContent);
const id = document.body.dataset.model;
const model = models[id];
const reduced = reducedMotion();
const papers = heroPapers();
const host = document.getElementById("mini-fold");
const view = createFoldView(host, model, { autoplay: !reduced, once: true, start: reduced ? 1 : 0 });
view.setTextures(papers.front, papers.back);
if (reduced) view.setTime(1);

const scrub = document.getElementById("mini-scrub");
const label = document.getElementById("mini-label");
const play = document.getElementById("mini-play");
const next = document.getElementById("mini-next");
if (reduced) {
  play.hidden = true;
  next.hidden = false;
}
view.onChange((s) => {
  scrub.value = String(Math.round(s.t * 1000));
  label.textContent = s.label || model.name;
  play.textContent = s.playing ? "Pause" : "Play";
  play.setAttribute("aria-pressed", String(s.playing));
});
play.addEventListener("click", () => {
  if (view.getState().playing) view.pause();
  else view.play();
});
scrub.addEventListener("input", () => {
  const unit = Number(scrub.value) / 1000;
  view.pause();
  view.setTime(unit);
});
next.addEventListener("click", () => {
  const s = view.getState();
  const marks = view.prep.steps.map((step) => step.end / view.prep.duration);
  const n = marks.find((m) => m > s.t + 0.01);
  view.pause();
  view.setTime(n == null ? 1 : n);
});

document.querySelectorAll(".step-diagram").forEach((svg) => {
  drawStepDiagram(svg, model, Number(svg.dataset.step));
});
