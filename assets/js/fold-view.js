import { frameFit, paintProjection, poseFit, projectPolygons } from "./project.js";
import { prepare, sample } from "./runtime.js";

/**
 * Fold view drawn into a canvas.
 * WebKit drops images and gradients on CSS 3D planes, so both browsers use
 * the same projection as the share picture.
 */

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

const DEBUG_COLORS = ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#e07a5f", "#5c6bc0", "#ef9a9a", "#80cbc4", "#ffd54f", "#9575cd", "#a1887f", "#4db6ac"];

function mirrorSource(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width || source.naturalWidth || 1024;
  canvas.height = source.height || source.naturalHeight || 1024;
  const g = canvas.getContext("2d");
  g.translate(canvas.width, 0);
  g.scale(-1, 1);
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createFoldView(host, model, options = {}) {
  const prep = prepare(model);
  host.innerHTML = "";
  const stage = el("div", "stage");
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", `${model.name}. Drag to turn the paper.`);
  const canvas = el("canvas", "fold-canvas");
  canvas.setAttribute("aria-hidden", "true");
  stage.append(canvas);
  host.append(stage);
  const persp = (model.camera && model.camera.perspective) || 900;

  let rx = (model.camera && model.camera.rx) || -58;
  let ry = (model.camera && model.camera.ry) || -32;
  const rz = (model.camera && model.camera.rz) || 0;
  let t = options.start || 0;
  let playing = false;
  let raf = 0;
  let holdTimer = 0;
  let destroyed = false;
  let debug = false;
  let override = null;
  const loop = Boolean(options.loop);
  const listeners = new Set();
  let frontImage = blankPaper("front");
  let backImage = blankPaper("back");
  let fitKey = "";
  let fit = { scale: 1, dx: 0, dy: 0 };

  function fitFor(size) {
    const key = `${rx.toFixed(2)}|${ry.toFixed(2)}|${rz}|${persp}|${size}`;
    if (key !== fitKey) {
      fitKey = key;
      fit = frameFit(model, prep, { rx, ry, rz, perspective: persp }, size, 0.06);
    }
    return fit;
  }

  function state() {
    const sampled = override
      ? { angles: override, stepIndex: 0, label: "Custom", flip: 0, t: t * prep.duration }
      : sample(prep, t * prep.duration);
    return sampled;
  }

  function cameraFor(sampled) {
    return {
      rx,
      ry: ry + (sampled.flip || 0),
      rz,
      perspective: persp,
      flip: 0,
    };
  }

  function apply() {
    const sampled = state();
    const size = Math.max(2, Math.floor(stage.clientWidth || host.clientWidth || 640));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(size * dpr)) {
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const camera = cameraFor(sampled);
    const placed = model.shape === "net"
      ? poseFit(model, prep, sampled.angles, camera, size, 0.08)
      : fitFor(size);
    if (debug) {
      const polys = projectPolygons(model, prep, sampled.angles, camera, size);
      polys.forEach((poly, index) => {
        ctx.beginPath();
        poly.pts.forEach((p, i) => {
          const x = p.x * placed.scale + placed.dx;
          const y = p.y * placed.scale + placed.dy;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = DEBUG_COLORS[index % DEBUG_COLORS.length];
        ctx.fill();
      });
    } else {
      paintProjection(ctx, model, prep, sampled.angles, camera, frontImage, backImage, size, placed);
    }
    for (const fn of listeners) fn(viewState(sampled));
  }

  function viewState(sampled) {
    return {
      t,
      duration: prep.duration,
      stepIndex: sampled.stepIndex,
      stepCount: prep.steps.length,
      label: sampled.label,
      playing,
      angles: sampled.angles,
      camera: {
        rx,
        ry,
        rz,
        flip: sampled.flip || 0,
        perspective: persp,
      },
    };
  }

  function stop() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function tick(now, start, origin) {
    if (!playing || destroyed) return;
    const next = origin + (now - start) / 1000 / prep.duration;
    if (next >= 1) {
      t = 1;
      apply();
      if (loop && !reducedMotion() && !options.once) {
        playing = false;
        holdTimer = setTimeout(() => {
          if (destroyed) return;
          t = 0;
          play();
        }, 650);
      } else {
        stop();
        apply();
      }
      return;
    }
    t = next;
    apply();
    raf = requestAnimationFrame((n) => tick(n, start, origin));
  }

  function play() {
    if (destroyed) return;
    if (reducedMotion() && !options.forcePlay) return;
    if (t >= 1) t = 0;
    override = null;
    stop();
    playing = true;
    const start = performance.now();
    const origin = t;
    raf = requestAnimationFrame((n) => tick(n, start, origin));
  }

  let drag = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, rx, ry, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    ry = drag.ry + (e.clientX - drag.x) * 0.4;
    rx = Math.max(-82, Math.min(82, drag.rx + (e.clientY - drag.y) * 0.3));
    apply();
  });
  function endDrag(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  const resize = new ResizeObserver(() => {
    if (!destroyed) apply();
  });
  resize.observe(stage);

  function loadSource(source) {
    if (typeof source !== "string") return Promise.resolve(source);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("texture"));
      img.src = source;
    });
  }

  function setTextures(frontSource, backSource) {
    debug = false;
    return Promise.all([loadSource(frontSource), loadSource(backSource)]).then(([front, back]) => {
      frontImage = front;
      backImage = model.exterior === "painted" ? mirrorSource(front) : back;
      apply();
    });
  }

  apply();
  if (options.autoplay && !reducedMotion()) play();
  else if (options.autoplay && reducedMotion()) {
    t = 0;
    apply();
  }

  return {
    prep,
    play,
    pause() {
      stop();
      apply();
    },
    setTime(unit) {
      override = null;
      t = Math.max(0, Math.min(1, unit));
      apply();
    },
    setAngles(angles) {
      stop();
      override = { ...angles };
      apply();
    },
    setDebug(on) {
      debug = on;
      apply();
    },
    setTextures,
    getState() {
      return viewState(state());
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      resize.disconnect();
      stop();
      host.innerHTML = "";
    },
  };
}

export function blankPaper(side) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = side === "back" ? "#f6e2b0" : "#fffdf8";
  g.fillRect(0, 0, 1024, 1024);
  return c;
}

export function heroPapers() {
  const front = blankPaper("front");
  const back = blankPaper("back");
  const g = front.getContext("2d");
  const bands = ["#c83a2b", "#243056", "#e4b24a", "#2f6d4f", "#d96b2b"];
  for (let i = -2; i < 8; i += 1) {
    g.fillStyle = bands[(i + 2) % bands.length];
    g.beginPath();
    g.moveTo(i * 180, 0);
    g.lineTo(i * 180 + 100, 0);
    g.lineTo(i * 180 + 520, 1024);
    g.lineTo(i * 180 + 420, 1024);
    g.fill();
  }
  g.fillStyle = "rgba(255,253,248,0.85)";
  for (let y = 80; y < 1024; y += 150) {
    for (let x = 70; x < 1024; x += 170) {
      g.beginPath();
      g.arc(x + (y % 300), y, 28, 0, Math.PI * 2);
      g.fill();
    }
  }
  const gb = back.getContext("2d");
  gb.fillStyle = "#f6e2b0";
  gb.fillRect(0, 0, 1024, 1024);
  gb.strokeStyle = "#c83a2b";
  gb.lineWidth = 28;
  for (let y = 40; y < 1024; y += 90) {
    gb.beginPath();
    gb.moveTo(0, y);
    gb.lineTo(1024, y + 40);
    gb.stroke();
  }
  return { front, back };
}
