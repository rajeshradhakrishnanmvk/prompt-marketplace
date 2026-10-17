import { createFoldView, blankPaper, reducedMotion } from "./fold-view.js";
import { createPaint, PALETTE } from "./paint.js";
import { encodePayload, decodePayload, rasterCanvases } from "./codec.js";
import { renderCard, recordFold } from "./export.js";

const base = document.documentElement.dataset.base || "";
const models = JSON.parse(document.getElementById("foldly-models").textContent);
const params = new URLSearchParams(location.hash.replace(/^#/, ""));
const reduced = reducedMotion();

const paper = document.getElementById("paper");
const frontCanvas = document.getElementById("front-canvas");
const backCanvas = document.getElementById("back-canvas");
const creaseSvg = document.getElementById("creases");
const foldHost = document.getElementById("fold-host");
const paintUi = document.getElementById("paint-ui");
const foldUi = document.getElementById("fold-ui");
const titleEl = document.getElementById("model-title");
const noteEl = document.getElementById("model-note");
const stepLabel = document.getElementById("step-label");
const stepCount = document.getElementById("step-count");
const scrub = document.getElementById("scrub");
const playBtn = document.getElementById("play-btn");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const shareDialog = document.getElementById("share-dialog");
const shareStatus = document.getElementById("share-status");
const shareUrl = document.getElementById("share-url");
const remixBanner = document.getElementById("remix-banner");
const choices = [...document.querySelectorAll(".model-choice")];

const paint = createPaint(frontCanvas, backCanvas);
let modelId = params.get("m") && models[params.get("m")] ? params.get("m") : "paper-cup";
let view = null;
let mode = "paint";
let raster = null;

function choiceData(id) {
  return choices.find((b) => b.dataset.model === id);
}

function foldTextures() {
  if (models[modelId] && models[modelId].exterior === "painted") return [frontCanvas, frontCanvas];
  return [frontCanvas, backCanvas];
}

function exportTextures() {
  const [front, back] = foldTextures();
  if (back !== front) return [front, back];
  const copy = document.createElement("canvas");
  copy.width = front.width;
  copy.height = front.height;
  const g = copy.getContext("2d");
  g.translate(copy.width, 0);
  g.scale(-1, 1);
  g.drawImage(front, 0, 0);
  return [front, copy];
}

function showCreases() {
  const model = models[modelId];
  const ns = "http://www.w3.org/2000/svg";
  creaseSvg.replaceChildren();
  creaseSvg.setAttribute("viewBox", "0 0 100 100");
  for (const c of model.creases || []) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", c[0][0] * 100);
    line.setAttribute("y1", c[0][1] * 100);
    line.setAttribute("x2", c[1][0] * 100);
    line.setAttribute("y2", c[1][1] * 100);
    line.setAttribute("class", c[2] === "mountain" ? "mountain" : "valley");
    creaseSvg.append(line);
  }
  if (paint.tool.symmetry !== "none") {
    const mid = document.createElementNS(ns, "line");
    mid.setAttribute("x1", 50);
    mid.setAttribute("y1", 2);
    mid.setAttribute("x2", 50);
    mid.setAttribute("y2", 98);
    mid.setAttribute("class", "guide");
    creaseSvg.append(mid);
  }
  if (paint.tool.symmetry === "four") {
    const mid = document.createElementNS(ns, "line");
    mid.setAttribute("x1", 2);
    mid.setAttribute("y1", 50);
    mid.setAttribute("x2", 98);
    mid.setAttribute("y2", 50);
    mid.setAttribute("class", "guide");
    creaseSvg.append(mid);
  }
  if (model && model.sheet && model.sheet.length >= 3) {
    const outline = document.createElementNS(ns, "polygon");
    outline.setAttribute("points", model.sheet.map(([x, y]) => `${x * 100},${y * 100}`).join(" "));
    outline.setAttribute("class", "net-outline");
    creaseSvg.append(outline);
  }
  creaseSvg.classList.toggle("is-off", !paint.tool.creases);
}

function syncTools() {
  const hiddenBack = Boolean(models[modelId] && models[modelId].exterior === "painted");
  if (hiddenBack && paint.tool.side === "back") paint.tool.side = "front";
  const backBtn = document.getElementById("side-back");
  backBtn.disabled = hiddenBack;
  document.getElementById("side-note").hidden = !hiddenBack;
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.tool === paint.tool.tool));
  });
  document.querySelectorAll("[data-size]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.size) === paint.tool.size));
  });
  document.querySelectorAll("[data-sym]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.sym === paint.tool.symmetry));
  });
  document.querySelectorAll("[data-swatch]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.swatch) === paint.tool.color));
  });
  document.getElementById("side-front").setAttribute("aria-pressed", String(paint.tool.side === "front"));
  document.getElementById("side-back").setAttribute("aria-pressed", String(paint.tool.side === "back"));
  document.getElementById("creases-btn").setAttribute("aria-pressed", String(paint.tool.creases));
  document.getElementById("custom-color").value = paint.tool.custom;
  frontCanvas.classList.toggle("is-active", paint.tool.side === "front");
  backCanvas.classList.toggle("is-active", paint.tool.side === "back");
  paper.dataset.side = paint.tool.side;
  document.getElementById("undo-btn").disabled = !paint.canUndo();
  document.getElementById("redo-btn").disabled = !paint.canRedo();
  const drawn = paint.getStrokes().filter((s) => s.tool !== "clear").length;
  document.getElementById("stroke-warn").hidden = drawn < 20;
  showCreases();
}

function selectModel(id, { push = true } = {}) {
  if (!models[id]) return;
  modelId = id;
  const data = choiceData(id);
  titleEl.textContent = (data && data.dataset.name) || models[id].name;
  noteEl.textContent = (data && data.dataset.note) || models[id].note || "";
  noteEl.hidden = !noteEl.textContent;
  const net = models[id].shape === "net";
  paper.classList.toggle("is-net", net);
  paint.setSheet(net ? models[id].sheet : null);
  choices.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === id)));
  showCreases();
  syncTools();
  if (push) writeHash(false, null, true);
  if (mode === "fold") mountFold(false);
}

function writeHash(includePayload, token, push) {
  const hash = includePayload && token ? `#m=${encodeURIComponent(modelId)}&d=${token}` : `#m=${encodeURIComponent(modelId)}`;
  const url = `${location.pathname}${location.search}${hash}`;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

function routeFromLocation() {
  const next = new URLSearchParams(location.hash.replace(/^#/, ""));
  const id = next.get("m");
  if (!id || !models[id]) {
    if (modelId !== "paper-cup") selectModel("paper-cup", { push: false });
    return;
  }
  if (id !== modelId) selectModel(id, { push: false });
}

let shareTooDetailed = false;

async function ensureToken() {
  shareTooDetailed = false;
  if (raster) return raster.token;
  const strokes = paint.getStrokes();
  const packed = await encodePayload(strokes);
  if (packed.tooDetailed || !packed.token) {
    shareTooDetailed = true;
    return null;
  }
  return packed.token;
}

function shareMessage(copied) {
  if (shareTooDetailed) {
    return "This painting is too detailed to share as a link. Download a picture or a video instead.";
  }
  const drawn = paint.getStrokes().filter((s) => s.tool !== "clear").length;
  if (!copied && drawn >= 20) return "About 20 strokes in. A link holds about 25.";
  return copied ? "Link copied! Paste it anywhere to share." : "";
}

function syncShareActions() {
  document.getElementById("copy-link").hidden = shareTooDetailed;
  if (shareTooDetailed) nativeBtn.hidden = true;
  else if (navigator.share) nativeBtn.hidden = false;
}

function mountFold(autoplay) {
  if (view) view.destroy();
  foldHost.hidden = false;
  paper.hidden = true;
  paintUi.hidden = true;
  foldUi.hidden = false;
  mode = "fold";
  view = createFoldView(foldHost, models[modelId], { autoplay: autoplay && !reduced, start: 0 });
  const papers = foldTextures();
  view.setTextures(papers[0], papers[1]);
  const reflect = () => {
    const s = view.getState();
    scrub.value = String(Math.round(s.t * 1000));
    const flatWord = models[modelId].shape === "net" ? "Flat net" : "Flat square";
    stepLabel.textContent = s.label || flatWord;
    stepCount.textContent = `Step ${Math.min(s.stepCount, s.stepIndex + 1)} of ${s.stepCount}`;
    playBtn.setAttribute("aria-pressed", String(s.playing));
    playBtn.textContent = s.playing ? "Pause" : "Play";
    scrub.setAttribute("aria-valuetext", stepLabel.textContent);
  };
  view.onChange(reflect);
  reflect();
  playBtn.hidden = reduced;
  nextBtn.hidden = !reduced;
  prevBtn.hidden = !reduced;
}

function showPaint() {
  if (view) {
    view.destroy();
    view = null;
  }
  mode = "paint";
  foldHost.hidden = true;
  paper.hidden = false;
  paintUi.hidden = false;
  foldUi.hidden = true;
  remixBanner.hidden = true;
  syncTools();
}

document.getElementById("fold-btn").addEventListener("click", () => {
  remixBanner.hidden = true;
  mountFold(true);
});
document.getElementById("repaint-btn").addEventListener("click", () => showPaint());
document.getElementById("remix-btn").addEventListener("click", () => showPaint());

playBtn.addEventListener("click", () => {
  if (!view) return;
  const s = view.getState();
  if (s.playing) view.pause();
  else view.play();
});
scrub.addEventListener("input", () => {
  if (!view) return;
  const unit = Number(scrub.value) / 1000;
  view.pause();
  view.setTime(unit);
});
nextBtn.addEventListener("click", () => {
  if (!view) return;
  const s = view.getState();
  const marks = models[modelId].steps.map((_, i, arr) => (i + 1) / arr.length);
  const prepMarks = view.prep.steps.map((step) => step.end / view.prep.duration);
  const next = prepMarks.find((m) => m > s.t + 0.01);
  view.pause();
  view.setTime(next == null ? 1 : next);
});
prevBtn.addEventListener("click", () => {
  if (!view) return;
  const s = view.getState();
  const marks = view.prep.steps.map((step) => step.end / view.prep.duration);
  const prev = [...marks].reverse().find((m) => m < s.t - 0.02);
  view.pause();
  view.setTime(prev == null ? 0 : prev);
});

choices.forEach((btn) => btn.addEventListener("click", () => selectModel(btn.dataset.model)));

document.querySelectorAll("[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    paint.tool.tool = btn.dataset.tool;
    syncTools();
  });
});
document.querySelectorAll("[data-size]").forEach((btn) => {
  btn.addEventListener("click", () => {
    paint.tool.size = Number(btn.dataset.size);
    paint.tool.tool = "brush";
    syncTools();
  });
});
document.querySelectorAll("[data-sym]").forEach((btn) => {
  btn.addEventListener("click", () => {
    paint.tool.symmetry = btn.dataset.sym;
    syncTools();
  });
});
document.querySelectorAll("[data-swatch]").forEach((btn) => {
  btn.addEventListener("click", () => {
    paint.tool.color = Number(btn.dataset.swatch);
    if (paint.tool.tool === "eraser") paint.tool.tool = "brush";
    syncTools();
  });
});
document.getElementById("custom-color").addEventListener("input", (e) => {
  paint.tool.custom = e.target.value;
  paint.tool.color = e.target.value;
  if (paint.tool.tool === "eraser") paint.tool.tool = "brush";
  syncTools();
});
document.getElementById("side-front").addEventListener("click", () => {
  paint.tool.side = "front";
  syncTools();
});
document.getElementById("side-back").addEventListener("click", () => {
  paint.tool.side = "back";
  syncTools();
});
document.getElementById("creases-btn").addEventListener("click", () => {
  paint.tool.creases = !paint.tool.creases;
  syncTools();
});
document.getElementById("undo-btn").addEventListener("click", () => {
  paint.undo();
  syncTools();
});
document.getElementById("redo-btn").addEventListener("click", () => {
  paint.redo();
  syncTools();
});
document.getElementById("clear-btn").addEventListener("click", () => {
  paint.clear();
  raster = null;
  syncTools();
});
document.getElementById("surprise-btn").addEventListener("click", () => {
  paint.surprise();
  raster = null;
  syncTools();
});

window.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea");
  if (typing) return;
  if (mode === "fold" && e.key === " ") {
    e.preventDefault();
    playBtn.click();
    return;
  }
  if (mode !== "paint") return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === "z") {
    e.preventDefault();
    if (e.shiftKey) paint.redo();
    else paint.undo();
    syncTools();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && key === "y") {
    e.preventDefault();
    paint.redo();
    syncTools();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (key === "b") paint.tool.tool = "brush";
  if (key === "f") paint.tool.tool = "fill";
  if (key === "e") paint.tool.tool = "eraser";
  if ("bfe".includes(key)) syncTools();
});

function setStatus(text) {
  shareStatus.textContent = text;
}

document.getElementById("share-btn").addEventListener("click", async () => {
  setStatus("");
  shareDialog.showModal();
  try {
    const token = await ensureToken();
    syncShareActions();
    if (!token) {
      shareUrl.value = "";
      setStatus(shareMessage(false));
      return;
    }
    writeHash(true, token);
    shareUrl.value = location.href;
    setStatus(shareMessage(false));
  } catch (err) {
    shareUrl.value = location.href;
    setStatus("Couldn't copy the link. Try again, or copy it from the box below.");
  }
});

document.getElementById("copy-link").addEventListener("click", async () => {
  try {
    const token = await ensureToken();
    syncShareActions();
    if (!token) {
      shareUrl.value = "";
      setStatus(shareMessage(false));
      return;
    }
    writeHash(true, token);
    shareUrl.value = location.href;
    await navigator.clipboard.writeText(shareUrl.value);
    setStatus(shareMessage(true));
  } catch (err) {
    shareUrl.focus();
    shareUrl.select();
    setStatus("Couldn't copy the link. Try again, or copy it from the box below.");
  }
});

document.getElementById("download-png").addEventListener("click", () => {
  try {
    const state = view ? view.getState() : null;
    const camera = state ? state.camera : { ...(models[modelId].camera || {}), flip: 0 };
    const angles = state ? state.angles : {};
    const papers = exportTextures();
    const card = renderCard(models[modelId], angles, camera, papers[0], papers[1]);
    const a = document.createElement("a");
    a.href = card.toDataURL("image/png");
    a.download = `foldly-${modelId}.png`;
    a.click();
    setStatus("Picture saved! Look in your downloads.");
  } catch (err) {
    setStatus("Couldn't make your picture. Please try again.");
  }
});

document.getElementById("download-video").addEventListener("click", async () => {
  const btn = document.getElementById("download-video");
  btn.disabled = true;
  setStatus("Making your folding video…");
  try {
    const state = view ? view.getState() : null;
    const camera = state
      ? { rx: state.camera.rx, ry: state.camera.ry, rz: state.camera.rz, perspective: state.camera.perspective }
      : { ...(models[modelId].camera || {}) };
    const papers = exportTextures();
    const { blob, ext } = await recordFold(models[modelId], camera, papers[0], papers[1]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `foldly-${modelId}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setStatus("Video ready! Look in your downloads.");
  } catch (err) {
    const unsupported = err && (err.message === "no-recorder" || err.message === "no-capture");
    setStatus(unsupported
      ? "This browser can't record a folding video. You can still copy the link or download a picture."
      : "Couldn't make your video. Please try again in a moment.");
  } finally {
    btn.disabled = false;
  }
});

const nativeBtn = document.getElementById("native-share");
if (navigator.share) nativeBtn.hidden = false;
nativeBtn.addEventListener("click", async () => {
  try {
    const token = await ensureToken();
    syncShareActions();
    if (!token) {
      shareUrl.value = "";
      setStatus(shareMessage(false));
      return;
    }
    writeHash(true, token);
    shareUrl.value = location.href;
    setStatus(shareMessage(false));
    await navigator.share({ title: `Foldly — ${models[modelId].name}`, text: "Paint a square. Watch it fold.", url: shareUrl.value });
  } catch (err) {
    if (err && err.name === "AbortError") return;
    setStatus("Couldn't copy the link. Try again, or copy it from the box below.");
  }
});

async function bootShared() {
  const d = params.get("d");
  if (!d) return false;
  try {
    const decoded = await decodePayload(d);
    if (decoded.type === "strokes") paint.loadStrokes(decoded.strokes);
    if (decoded.type === "raster") {
      const urls = rasterCanvases(decoded.token);
      raster = { token: d };
      await paint.loadRaster(urls.front, urls.back, urls.stacked);
    }
    remixBanner.hidden = false;
    mountFold(!reduced);
    return true;
  } catch (err) {
    return false;
  }
}

frontCanvas.addEventListener("pointerup", () => syncTools());
backCanvas.addEventListener("pointerup", () => syncTools());
frontCanvas.addEventListener("pointerdown", () => syncTools());
backCanvas.addEventListener("pointerdown", () => syncTools());

window.addEventListener("hashchange", routeFromLocation);
window.addEventListener("popstate", routeFromLocation);

selectModel(modelId, { push: false });
syncTools();
document.querySelectorAll("[data-swatch]").forEach((btn) => {
  btn.style.background = PALETTE[Number(btn.dataset.swatch)];
});

const shot = new URLSearchParams(location.search).get("shot");
bootShared().then(async (shared) => {
  if (!shared && shot === "mid") {
    paint.surprise();
    syncTools();
    mountFold(false);
    view.setTime(0.62);
  } else if (!shared && shot === "paint") {
    paint.surprise();
    syncTools();
  }
  document.getElementById("fold-page").dataset.ready = "1";
});
