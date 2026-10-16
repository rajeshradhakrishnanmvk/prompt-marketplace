import { prepare, sample } from "./runtime.js";

/**
 * CSS 3D fold.
 * Each layer is translateZ(0.1px * index). Clip-paths sit on an inner skin,
 * not on the element that also has backface-visibility and a 3D transform.
 * WebKit drops the front face when those three are on the same node inside
 * preserve-3d. The skin is flattened into the face, then the face is posed.
 */

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function clipPath(poly, mirrorX) {
  const pts = poly.map(([x, y]) => {
    const X = mirrorX ? 1 - x : x;
    return `${+(X * 100).toFixed(3)}% ${+(y * 100).toFixed(3)}%`;
  });
  return `polygon(${pts.join(",")})`;
}

const DEBUG_COLORS = ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#e07a5f", "#5c6bc0", "#ef9a9a", "#80cbc4", "#ffd54f", "#9575cd", "#a1887f", "#4db6ac"];

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createFoldView(host, model, options = {}) {
  const prep = prepare(model);
  host.innerHTML = "";
  const stage = el("div", "stage");
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", `${model.name}. Drag to turn the paper.`);
  const rig = el("div", "rig");
  stage.append(rig);
  host.append(stage);
  const persp = (model.camera && model.camera.perspective) || 900;
  stage.style.perspective = `${persp}px`;

  const nodes = {};
  const faces = {};
  model.flaps.forEach((flap, index) => {
    const node = el("div", "flap");
    node.dataset.id = flap.id;
    node.dataset.layer = String(index);
    if (flap.poly && flap.poly.length >= 3) {
      const front = el("div", "face front");
      const back = el("div", "face back");
      const frontSkin = el("div", "skin");
      const backSkin = el("div", "skin");
      const c1 = clipPath(flap.poly, false);
      const c2 = clipPath(flap.poly, true);
      frontSkin.style.clipPath = c1;
      frontSkin.style.webkitClipPath = c1;
      backSkin.style.clipPath = c2;
      backSkin.style.webkitClipPath = c2;
      front.append(frontSkin);
      back.append(backSkin);
      node.append(front, back);
      faces[flap.id] = { front, back, frontSkin, backSkin };
    }
    nodes[flap.id] = node;
  });
  for (const flap of model.flaps) {
    const parent = flap.parent && nodes[flap.parent] ? nodes[flap.parent] : rig;
    if (flap.parent && !nodes[flap.parent]) console.warn("Missing parent", flap.parent);
    parent.append(nodes[flap.id]);
  }

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

  function cssFor(flap, angle) {
    const layer = model.flaps.indexOf(flap);
    const z = (layer * 0.1).toFixed(2);
    if (!flap.hinge) return `translateZ(${z}px)`;
    const [ax, ay] = flap.hinge.axis;
    return `translateZ(${z}px) rotate3d(${ax}, ${ay}, 0, ${angle}deg)`;
  }

  function state() {
    const sampled = override
      ? { angles: override, stepIndex: 0, label: "Custom", flip: 0, t: t * prep.duration }
      : sample(prep, t * prep.duration);
    return sampled;
  }

  function apply() {
    const sampled = state();
    for (const flap of model.flaps) {
      const node = nodes[flap.id];
      const angle = sampled.angles[flap.id] || 0;
      node.style.transform = cssFor(flap, angle);
      node.style.transformOrigin = flap.hinge
        ? `${flap.hinge.p[0] * 100}% ${flap.hinge.p[1] * 100}%`
        : "50% 50%";
      if (faces[flap.id]) {
        const { frontSkin, backSkin } = faces[flap.id];
        if (debug) {
          const color = DEBUG_COLORS[model.flaps.indexOf(flap) % DEBUG_COLORS.length];
          frontSkin.style.backgroundImage = "none";
          frontSkin.style.backgroundColor = color;
          backSkin.style.backgroundImage = "none";
          backSkin.style.backgroundColor = "#f6e2b0";
        } else if (!frontSkin.dataset.textured) {
          frontSkin.style.backgroundImage = "";
          frontSkin.style.backgroundColor = "";
          backSkin.style.backgroundImage = "";
          backSkin.style.backgroundColor = "";
        }
      }
    }
    rig.style.transform = `rotateX(${rx}deg) rotateY(${ry + (sampled.flip || 0)}deg) rotateZ(${rz}deg)`;
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

  function canvasUrl(source, mirror) {
    if (typeof source === "string" && !mirror) return Promise.resolve(source);
    return new Promise((resolve) => {
      const draw = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width || img.naturalWidth;
        c.height = img.height || img.naturalHeight;
        const g = c.getContext("2d");
        if (mirror) {
          g.translate(c.width, 0);
          g.scale(-1, 1);
        }
        g.drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      if (typeof source === "string") {
        const img = new Image();
        img.onload = () => draw(img);
        img.src = source;
      } else draw(source);
    });
  }

  function setTextures(frontSource, backSource) {
    debug = false;
    return Promise.all([canvasUrl(frontSource, false), canvasUrl(backSource, true)]).then(([frontUrl, backUrl]) => {
      rig.style.setProperty("--paper-front", `url("${frontUrl}")`);
      rig.style.setProperty("--paper-back", `url("${backUrl}")`);
      for (const flap of model.flaps) {
        if (!faces[flap.id]) continue;
        const { frontSkin, backSkin } = faces[flap.id];
        frontSkin.dataset.textured = "1";
        backSkin.dataset.textured = "1";
        frontSkin.style.backgroundColor = "#fffdf8";
        backSkin.style.backgroundColor = "#f6e2b0";
        frontSkin.style.backgroundImage = `url("${frontUrl}")`;
        backSkin.style.backgroundImage = `url("${backUrl}")`;
      }
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
