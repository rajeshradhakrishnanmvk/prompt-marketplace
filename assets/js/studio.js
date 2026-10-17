import { createFoldView, blankPaper, reducedMotion } from "./fold-view.js";
import { createPaint, PALETTE } from "./paint.js";
import { SHARE_LIMIT, encodePayload, encodeAssemblyPayload, decodePayload, rasterCanvases } from "./codec.js";
import { renderCard, recordFold } from "./export.js";
import { paintCreases, paintRegions, paintSeeds } from "./assembly.js";

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
const sheetTabs = document.getElementById("sheet-tabs");
const paintAllBtn = document.getElementById("paint-all-btn");
const creditEl = document.getElementById("model-credit");
const choices = [...document.querySelectorAll(".model-choice")];

const paint = createPaint(frontCanvas, backCanvas);
let modelId = params.get("m") && models[params.get("m")] ? params.get("m") : "paper-cup";
let view = null;
let mode = "paint";
let raster = null;
let assembly = null;
let squareSnapshot = null;
let heldDesktop = false;
let heldScrollY = 0;

function emptyStore() {
  return { strokes: [], undoStack: [], redoStack: [] };
}

function partById(id) {
  return models[modelId].parts.find((part) => part.id === id);
}

function rememberSheet() {
  if (!assembly || !assembly.active) return;
  assembly.stores[assembly.sheetId] = paint.capture();
}

function showSheet(id, { skipSave = false } = {}) {
  if (!assembly) return;
  if (!skipSave) rememberSheet();
  assembly.sheetId = id;
  const part = partById(id);
  paint.setRegions(paintRegions(part), { replay: false });
  paint.restore(assembly.stores[id] || emptyStore());
  sheetTabs.querySelectorAll("[data-sheet]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.sheet === id));
  });
  updateThumb(id);
  showCreases();
}

function updateThumb(id) {
  const thumb = sheetTabs.querySelector(`[data-sheet-thumb="${id}"]`);
  if (!thumb || !assembly || assembly.sheetId !== id) return;
  const g = thumb.getContext("2d");
  g.clearRect(0, 0, thumb.width, thumb.height);
  g.drawImage(frontCanvas, 0, 0, thumb.width, thumb.height);
}

function renderTabs(id) {
  sheetTabs.replaceChildren();
  for (const part of models[id].parts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sheet-tab";
    btn.dataset.sheet = part.id;
    btn.setAttribute("aria-pressed", String(part.id === assembly.sheetId));
    const thumb = document.createElement("canvas");
    thumb.width = 64;
    thumb.height = 64;
    thumb.dataset.sheetThumb = part.id;
    thumb.setAttribute("aria-hidden", "true");
    const g = thumb.getContext("2d");
    g.fillStyle = "#fffdf8";
    const regions = paintRegions(part);
    for (const poly of regions) {
      g.beginPath();
      poly.forEach(([x, y], i) => {
        const px = x * 64;
        const py = y * 64;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.closePath();
      g.fill();
    }
    g.strokeStyle = "#1c1915";
    g.lineWidth = 2;
    for (const poly of regions) {
      g.beginPath();
      poly.forEach(([x, y], i) => {
        const px = x * 64;
        const py = y * 64;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.closePath();
      g.stroke();
    }
    const label = document.createElement("span");
    label.textContent = part.name;
    btn.append(thumb, label);
    btn.addEventListener("click", () => showSheet(part.id));
    sheetTabs.append(btn);
  }
}

function resumeAssembly(id) {
  if (!assembly || assembly.modelId !== id) {
    if (!assembly) squareSnapshot = paint.capture();
    assembly = { modelId: id, sheetId: models[id].parts[0].id, stores: {}, active: true };
  } else if (!assembly.active) {
    squareSnapshot = paint.capture();
    assembly.active = true;
  }
  renderTabs(id);
  sheetTabs.hidden = false;
  paintAllBtn.hidden = false;
  showSheet(assembly.sheetId, { skipSave: true });
}

function suspendAssembly() {
  if (!assembly || !assembly.active) return;
  rememberSheet();
  assembly.active = false;
  paint.setRegions(null, { replay: false });
  paint.restore(squareSnapshot || emptyStore());
  sheetTabs.hidden = true;
  paintAllBtn.hidden = true;
}

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
  const creases = assembly && assembly.active
    ? paintCreases(partById(assembly.sheetId))
    : model.creases || [];
  for (const c of creases) {
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
  if (assembly && assembly.active) {
    for (const poly of paintRegions(partById(assembly.sheetId))) {
      const outline = document.createElementNS(ns, "polygon");
      outline.setAttribute("points", poly.map(([x, y]) => `${x * 100},${y * 100}`).join(" "));
      outline.setAttribute("class", "net-outline");
      creaseSvg.append(outline);
    }
  } else if (model && model.sheet && model.sheet.length >= 3) {
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
  showCreases();
  measureLink();
}

function selectModel(id, { push = true } = {}) {
  if (!models[id]) return;
  modelId = id;
  const data = choiceData(id);
  titleEl.textContent = (data && data.dataset.name) || models[id].name;
  noteEl.textContent = (data && data.dataset.note) || models[id].note || "";
  noteEl.hidden = !noteEl.textContent;
  const asm = models[id].type === "assembly";
  const net = models[id].shape === "net" || asm;
  paper.classList.toggle("is-net", net);
  if (asm) resumeAssembly(id);
  else {
    if (assembly && assembly.active) suspendAssembly();
    paint.setSheet(models[id].shape === "net" ? models[id].sheet : null);
    sheetTabs.hidden = true;
    paintAllBtn.hidden = true;
  }
  if (creditEl) {
    const credit = asm ? models[id].credit || "" : "";
    creditEl.textContent = credit;
    creditEl.hidden = !credit;
  }
  choices.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.model === id)));
  revealChoice(id);
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
let linkFill = 0;
let linkJump = 0;
let linkTicket = 0;
const LINK_WARN_AT = 0.7;
const LINK_JUMP_AT = 0.15;
const LINK_JUMP_FLOOR = 0.6;

function revealChoice(id) {
  const chosen = choices.find((b) => b.dataset.model === id);
  if (!chosen) return;
  const scroller = chosen.parentElement;
  if (!scroller) return;
  const left = chosen.offsetLeft;
  const right = left + chosen.offsetWidth;
  if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left - 8);
  else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth + 8;
}

function nearLinkLimit() {
  return linkFill >= LINK_WARN_AT || (linkJump > LINK_JUMP_AT && linkFill >= LINK_JUMP_FLOOR);
}

function updateLinkWarn() {
  const el = document.getElementById("stroke-warn");
  const over = linkFill > 1;
  el.hidden = !over && !nearLinkLimit();
  el.textContent = over
    ? "This painting is too detailed to share as a link. Download a picture or a video instead."
    : "This painting is getting close to the size limit for a share link.";
}

function applyLinkSize(packed, priorLength) {
  linkFill = packed.length / SHARE_LIMIT;
  linkJump = Math.max(0, packed.length - priorLength) / SHARE_LIMIT;
  updateLinkWarn();
}

function sheetEntries() {
  rememberSheet();
  return models[modelId].parts.map((part) => [part.id, (assembly.stores[part.id] && assembly.stores[part.id].strokes) || []]);
}

function measureLink() {
  const ticket = ++linkTicket;
  if (assembly && assembly.active) {
    const entries = sheetEntries();
    const flat = entries.flatMap(([, strokes]) => strokes);
    if (!flat.some((s) => s.tool !== "clear")) {
      linkFill = 0;
      linkJump = 0;
      updateLinkWarn();
      return;
    }
    encodeAssemblyPayload(entries).then((packed) => {
      if (ticket !== linkTicket) return;
      linkFill = packed.length / SHARE_LIMIT;
      linkJump = 0;
      updateLinkWarn();
    });
    return;
  }
  const strokes = paint.getStrokes();
  if (!strokes.some((s) => s.tool !== "clear")) {
    linkFill = 0;
    linkJump = 0;
    updateLinkWarn();
    return;
  }
  const prior = strokes.slice(0, -1);
  Promise.all([encodePayload(strokes), prior.length ? encodePayload(prior) : Promise.resolve({ length: 0 })]).then(
    ([packed, before]) => {
      if (ticket !== linkTicket) return;
      applyLinkSize(packed, before.length);
    }
  );
}

async function ensureToken() {
  shareTooDetailed = false;
  if (raster && !(assembly && assembly.active)) return raster.token;
  if (assembly && assembly.active) {
    const packed = await encodeAssemblyPayload(sheetEntries());
    linkFill = packed.length / SHARE_LIMIT;
    linkJump = 0;
    updateLinkWarn();
    if (packed.tooDetailed || !packed.token) {
      shareTooDetailed = true;
      return null;
    }
    return packed.token;
  }
  const strokes = paint.getStrokes();
  const prior = strokes.slice(0, -1);
  const [packed, before] = await Promise.all([
    encodePayload(strokes),
    prior.length ? encodePayload(prior) : Promise.resolve({ length: 0 }),
  ]);
  applyLinkSize(packed, before.length);
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
  if (!copied && nearLinkLimit()) return "This painting is getting close to the size limit for a share link.";
  return copied ? "Link copied! Paste it anywhere to share." : "";
}

function syncShareActions() {
  document.getElementById("copy-link").hidden = shareTooDetailed;
  if (shareTooDetailed) nativeBtn.hidden = true;
  else if (navigator.share) nativeBtn.hidden = false;
}

function holdDesktopPage() {
  if (window.matchMedia("(max-width: 879px)").matches) return;
  heldScrollY = window.scrollY;
  document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;
  document.documentElement.style.overflowAnchor = "none";
  heldDesktop = true;
}

function releaseDesktopPage() {
  if (!heldDesktop) return;
  document.body.style.minHeight = "";
  document.documentElement.style.overflowAnchor = "";
  heldDesktop = false;
}

function bakeAssemblyTextures() {
  rememberSheet();
  const savedId = assembly.sheetId;
  const saved = assembly.stores[savedId];
  const out = {};
  for (const part of models[modelId].parts) {
    paint.setRegions(paintRegions(part), { replay: false });
    paint.restore(assembly.stores[part.id] || emptyStore());
    const front = document.createElement("canvas");
    front.width = 1024;
    front.height = 1024;
    front.getContext("2d").drawImage(frontCanvas, 0, 0);
    out[part.id] = front;
  }
  paint.setRegions(paintRegions(partById(savedId)), { replay: false });
  paint.restore(saved);
  return out;
}

function mountFold(autoplay) {
  holdDesktopPage();
  if (view) view.destroy();
  foldHost.hidden = false;
  paper.hidden = true;
  paintUi.hidden = true;
  if (assembly && assembly.active) sheetTabs.hidden = true;
  foldUi.hidden = false;
  mode = "fold";
  view = createFoldView(foldHost, models[modelId], { autoplay: autoplay && !reduced, start: 0 });
  if (models[modelId].type === "assembly") view.setAssemblyTextures(bakeAssemblyTextures());
  else {
    const papers = foldTextures();
    view.setTextures(papers[0], papers[1]);
  }
  const reflect = () => {
    const s = view.getState();
    scrub.value = String(Math.round(s.t * 1000));
    const flatWord = models[modelId].type === "assembly" ? "Flat sheet" : models[modelId].shape === "net" ? "Flat net" : "Flat square";
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
  if (heldDesktop) {
    const y = heldScrollY;
    const restore = () => {
      if (Math.abs(window.scrollY - y) > 0.5) window.scrollTo(0, y);
    };
    restore();
    requestAnimationFrame(restore);
  }
  settleFoldScroll();
}

/* After Fold, show the model and the scrubber when both fit. Otherwise keep the model fully in view.
   The Fold button would otherwise pull the page and clip the canvas. */
function settleFoldScroll() {
  if (!window.matchMedia("(max-width: 879px)").matches) return;
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  const place = () => {
    const btn = document.getElementById("fold-btn");
    if (btn && document.activeElement === btn) btn.blur();
    const vh = window.innerHeight;
    const host = foldHost.getBoundingClientRect();
    const scrubBox = scrub.getBoundingClientRect();
    const span = scrubBox.bottom - host.top;
    let delta = 0;
    if (span <= vh + 0.5) {
      if (host.top < 0) delta = host.top;
      else if (scrubBox.bottom > vh) delta = scrubBox.bottom - vh;
      else if (scrubBox.top < 0) delta = scrubBox.top;
    } else if (host.top < 0) {
      delta = host.top;
    } else if (host.bottom > vh) {
      delta = Math.min(host.bottom - vh, Math.max(0, host.top));
    }
    if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
  };
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(() => {
      place();
      root.style.scrollBehavior = previous;
    });
  });
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
  if (assembly && assembly.active) sheetTabs.hidden = false;
  remixBanner.hidden = true;
  releaseDesktopPage();
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
    const textures = view && view.getTextures ? view.getTextures() : null;
    const card = renderCard(models[modelId], angles, camera, papers[0], papers[1], textures);
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
    const textures = view && view.getTextures ? view.getTextures() : null;
    const { blob, ext } = await recordFold(models[modelId], camera, papers[0], papers[1], null, textures);
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
    const blurb = models[modelId].type === "assembly"
      ? "Paint the sheets. Watch them dock."
      : models[modelId].shape === "net"
        ? "Paint a net. Watch it fold."
        : "Paint a square. Watch it fold.";
    await navigator.share({ title: `Foldly — ${models[modelId].name}`, text: blurb, url: shareUrl.value });
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
    if (decoded.type === "assembly" && assembly && assembly.active) {
      for (const [id, strokes] of Object.entries(decoded.sheets || {})) {
        assembly.stores[id] = { strokes, undoStack: [], redoStack: [] };
      }
      showSheet(assembly.sheetId, { skipSave: true });
      remixBanner.hidden = false;
      mountFold(!reduced);
      return true;
    }
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

document.getElementById("paint-all-btn").addEventListener("click", () => {
  if (!assembly || !assembly.active) return;
  rememberSheet();
  const color = paint.tool.color;
  const savedId = assembly.sheetId;
  for (const part of models[modelId].parts) {
    const seeds = paintSeeds(part);
    paint.setRegions(paintRegions(part), { replay: false });
    paint.restore(assembly.stores[part.id] || emptyStore());
    paint.addStrokes(seeds.map(([x, y]) => ({
      tool: "fill",
      size: 0,
      symmetry: "none",
      side: "front",
      color,
      x: Math.round(x * 1023),
      y: Math.round(y * 1023),
    })));
    assembly.stores[part.id] = paint.capture();
    const thumb = sheetTabs.querySelector(`[data-sheet-thumb="${part.id}"]`);
    if (thumb) thumb.getContext("2d").drawImage(frontCanvas, 0, 0, thumb.width, thumb.height);
  }
  showSheet(savedId, { skipSave: true });
  raster = null;
  syncTools();
});

frontCanvas.addEventListener("pointerup", () => {
  if (assembly && assembly.active) updateThumb(assembly.sheetId);
  syncTools();
});
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
  } else if (!shared && shot === "end") {
    mountFold(false);
    view.setTime(1);
  } else if (!shared && shot === "paint") {
    paint.surprise();
    syncTools();
  }
  document.getElementById("fold-page").dataset.ready = "1";
});
