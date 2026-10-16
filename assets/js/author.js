import { createFoldView, blankPaper } from "./fold-view.js";
import { prepare, sample } from "./runtime.js";
import { paintProjection } from "./project.js";

const models = JSON.parse(document.getElementById("foldly-models").textContent);
const select = document.getElementById("author-model");
const host = document.getElementById("author-stage");
const sliders = document.getElementById("sliders");
const dump = document.getElementById("dump");
const overlay = document.getElementById("overlay");
let view = null;
let model = null;

function boot(id) {
  model = models[id];
  if (view) view.destroy();
  view = createFoldView(host, model, { autoplay: false });
  view.setTextures(blankPaper("front"), blankPaper("back"));
  view.setDebug(document.getElementById("debug").checked);
  sliders.replaceChildren();
  const zeros = {};
  model.flaps.forEach((flap, i) => {
    zeros[flap.id] = 0;
    if (!flap.poly || flap.poly.length < 3) return;
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = flap.id;
    name.style.color = ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#5c6bc0", "#ef9a9a", "#80cbc4"][i % 7];
    const input = document.createElement("input");
    input.type = "range";
    input.min = "-180";
    input.max = "180";
    input.value = "0";
    input.dataset.flap = flap.id;
    const out = document.createElement("span");
    out.textContent = "0";
    input.addEventListener("input", () => {
      out.textContent = input.value;
      const angles = {};
      sliders.querySelectorAll("input").forEach((el) => {
        angles[el.dataset.flap] = Number(el.value);
      });
      view.setAngles(angles);
      paintOverlay();
    });
    label.append(name, input, out);
    sliders.append(label);
  });
  view.setAngles(zeros);
  paintOverlay();
}

function readAngles() {
  const angles = {};
  sliders.querySelectorAll("input").forEach((el) => {
    angles[el.dataset.flap] = Number(el.value);
  });
  return angles;
}

function paintOverlay() {
  if (!document.getElementById("show-proj").checked) {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  const rect = host.querySelector(".stage").getBoundingClientRect();
  overlay.width = Math.round(rect.width);
  overlay.height = Math.round(rect.height);
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const state = view.getState();
  paintProjection(ctx, model, prepare(model), readAngles(), state.camera, blankPaper("front"), blankPaper("back"), overlay.width);
}

document.getElementById("play").addEventListener("click", () => view.play());
document.getElementById("debug").addEventListener("change", (e) => view.setDebug(e.target.checked));
document.getElementById("show-proj").addEventListener("change", paintOverlay);
document.getElementById("copy").addEventListener("click", () => {
  dump.value = JSON.stringify(readAngles(), null, 2);
  dump.focus();
  dump.select();
});
select.addEventListener("change", () => boot(select.value));
document.getElementById("steps").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-end]");
  if (!btn || !view) return;
  const prep = prepare(model);
  const time = Number(btn.dataset.end);
  const sampled = sample(prep, time);
  sliders.querySelectorAll("input").forEach((el) => {
    const value = Math.round(sampled.angles[el.dataset.flap] || 0);
    el.value = String(value);
    el.nextElementSibling.textContent = String(value);
  });
  view.setAngles(sampled.angles);
  paintOverlay();
});

for (const id of Object.keys(models)) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = models[id].name;
  select.append(opt);
}
const stepBox = document.getElementById("steps");
select.addEventListener("change", () => {
  stepBox.replaceChildren();
  const m = models[select.value];
  let acc = 0;
  m.steps.forEach((s, i) => {
    acc += s.dur;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.dataset.end = String(acc - 0.001);
    b.textContent = `${i + 1}. ${s.label.slice(0, 42)}`;
    stepBox.append(b);
  });
});
boot("paper-cup");
select.dispatchEvent(new Event("change"));
