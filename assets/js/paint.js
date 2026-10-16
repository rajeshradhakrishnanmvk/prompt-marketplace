export const PALETTE = [
  "#1b1916",
  "#fffdf8",
  "#d64532",
  "#ef8b2c",
  "#f2c14e",
  "#3e9a4a",
  "#1f8a70",
  "#2f6fbe",
  "#3c4aa8",
  "#8a4fb8",
  "#e25c8d",
  "#8d5a34",
];

export const PAPER = { front: "#fffdf8", back: "#f6e2b0" };
const SIZES = [14, 36, 78];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function packHex(hex) {
  const n = Number.parseInt(hex.slice(1), 16) || 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function floodFill(ctx, x, y, hex) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const i32 = new Uint32Array(img.data.buffer);
  const sx = clamp(x | 0, 0, w - 1);
  const sy = clamp(y | 0, 0, h - 1);
  const target = i32[sy * w + sx];
  const repl = packHex(hex);
  if (target === repl) return;
  const stack = [sx, sy];
  while (stack.length) {
    const py = stack.pop();
    const px = stack.pop();
    if (py < 0 || py >= h || px < 0 || px >= w) continue;
    if (i32[py * w + px] !== target) continue;
    let left = px;
    let right = px;
    while (left > 0 && i32[py * w + left - 1] === target) left -= 1;
    while (right < w - 1 && i32[py * w + right + 1] === target) right += 1;
    for (let x2 = left; x2 <= right; x2 += 1) {
      i32[py * w + x2] = repl;
      if (py > 0 && i32[(py - 1) * w + x2] === target) stack.push(x2, py - 1);
      if (py < h - 1 && i32[(py + 1) * w + x2] === target) stack.push(x2, py + 1);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawPath(ctx, points, color, radius) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = radius * 2;
  if (!points.length) {
    ctx.restore();
    return;
  }
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function mirrorPoints(points, sym) {
  const sets = [points];
  if (sym === "vertical" || sym === "four") {
    sets.push(points.map(([x, y]) => [1023 - x, y]));
  }
  if (sym === "four") {
    sets.push(points.map(([x, y]) => [x, 1023 - y]));
    sets.push(points.map(([x, y]) => [1023 - x, 1023 - y]));
  }
  return sets;
}

export function createPaint(frontCanvas, backCanvas) {
  const ctx = {
    front: frontCanvas.getContext("2d", { willReadFrequently: true }),
    back: backCanvas.getContext("2d", { willReadFrequently: true }),
  };
  let strokes = [];
  let undoStack = [];
  let redoStack = [];
  const tool = {
    tool: "brush",
    size: 1,
    color: 2,
    custom: "#d64532",
    symmetry: "none",
    side: "front",
    creases: true,
  };
  let snapshot = null;
  let current = null;

  function paperHex(side) {
    return PAPER[side];
  }

  function resolve(stroke) {
    if (stroke.tool === "eraser") return paperHex(stroke.side);
    if (typeof stroke.color === "string") return stroke.color;
    return PALETTE[stroke.color] || PALETTE[0];
  }

  function fillPaper(side) {
    ctx[side].fillStyle = paperHex(side);
    ctx[side].fillRect(0, 0, 1024, 1024);
  }

  function drawStroke(sideCtx, stroke) {
    const color = resolve(stroke);
    if (stroke.tool === "clear") return;
    if (stroke.tool === "fill") {
      const seeds = mirrorPoints([[stroke.x, stroke.y]], stroke.symmetry);
      for (const set of seeds) floodFill(sideCtx, set[0][0], set[0][1], color);
      return;
    }
    const radius = SIZES[stroke.size] || SIZES[1];
    for (const set of mirrorPoints(stroke.points, stroke.symmetry)) drawPath(sideCtx, set, color, radius);
  }

  function replay() {
    fillPaper("front");
    fillPaper("back");
    for (const s of strokes) {
      if (s.tool === "clear") {
        fillPaper(s.side);
        continue;
      }
      drawStroke(ctx[s.side], s);
    }
  }

  function commit(next) {
    undoStack.push(strokes);
    if (undoStack.length > 20) undoStack.shift();
    redoStack = [];
    strokes = next;
    replay();
  }

  function pointerPos(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return [
      clamp(((e.clientX - r.left) / r.width) * 1023, 0, 1023),
      clamp(((e.clientY - r.top) / r.height) * 1023, 0, 1023),
    ];
  }

  function bind(canvas, side) {
    canvas.addEventListener("pointerdown", (e) => {
      if (tool.side !== side) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is best-effort; painting still follows the pointer */
      }
      const [x, y] = pointerPos(canvas, e);
      if (tool.tool === "fill") {
        commit(strokes.concat([{ tool: "fill", size: tool.size, symmetry: tool.symmetry, side, color: tool.color, x, y }]));
        return;
      }
      snapshot = ctx[side].getImageData(0, 0, 1024, 1024);
      current = {
        tool: tool.tool,
        size: tool.size,
        symmetry: tool.symmetry,
        side,
        color: tool.tool === "eraser" ? paperHex(side) : tool.color,
        points: [[x, y]],
      };
      ctx[side].putImageData(snapshot, 0, 0);
      drawStroke(ctx[side], current);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!current || current.side !== side) return;
      const [x, y] = pointerPos(canvas, e);
      const last = current.points[current.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 6) return;
      if (current.points.length < 255) current.points.push([x, y]);
      ctx[side].putImageData(snapshot, 0, 0);
      drawStroke(ctx[side], current);
    });
    const finish = (e) => {
      if (!current || current.side !== side) return;
      if (e && e.pointerId != null && canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      const done = current;
      current = null;
      snapshot = null;
      commit(strokes.concat([done]));
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  bind(frontCanvas, "front");
  bind(backCanvas, "back");
  replay();

  return {
    tool,
    getStrokes: () => strokes.map((s) => ({ ...s, points: s.points ? s.points.map((p) => p.slice()) : undefined })),
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo() {
      if (!undoStack.length) return;
      redoStack.push(strokes);
      strokes = undoStack.pop();
      replay();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(strokes);
      strokes = redoStack.pop();
      replay();
    },
    clear() {
      commit(strokes.concat([{ tool: "clear", size: 0, symmetry: "none", side: tool.side, color: 0 }]));
    },
    surprise() {
      commit(strokes.concat(surpriseStrokes(tool.side)));
    },
    loadStrokes(next) {
      undoStack = [];
      redoStack = [];
      strokes = next || [];
      replay();
    },
    async loadRaster(frontUrl, backUrl) {
      undoStack = [];
      redoStack = [];
      strokes = [];
      await drawUrl(ctx.front, frontUrl);
      await drawUrl(ctx.back, backUrl);
    },
    replay,
  };
}

function drawUrl(context, url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      context.clearRect(0, 0, 1024, 1024);
      context.drawImage(img, 0, 0, 1024, 1024);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

function surpriseStrokes(side) {
  const kind = Math.floor(Math.random() * 5);
  const color = () => 2 + Math.floor(Math.random() * 9);
  if (kind === 0) {
    return [0, 1, 2, 3, 4].map((i) => ({
      tool: "brush",
      size: 2,
      symmetry: "none",
      side,
      color: color(),
      points: [
        [40, 80 + i * 190],
        [1023, 200 + i * 160],
      ],
    }));
  }
  if (kind === 1) {
    const dots = [];
    for (let i = 0; i < 12; i += 1) {
      dots.push({
        tool: "brush",
        size: i % 3,
        symmetry: "four",
        side,
        color: color(),
        points: [[120 + (i % 4) * 90, 160 + (i % 3) * 70]],
      });
    }
    return dots;
  }
  if (kind === 2) {
    return [0, 1, 2, 3].map((i) => ({
      tool: "brush",
      size: 2,
      symmetry: "none",
      side,
      color: color(),
      points: [
        [80 + i * 60, 80],
        [80 + i * 60, 940],
      ],
    }));
  }
  if (kind === 3) {
    const rings = [];
    for (let i = 1; i <= 4; i += 1) {
      const m = 90 * i;
      rings.push({
        tool: "brush",
        size: 1,
        symmetry: "none",
        side,
        color: color(),
        points: [
          [m, m],
          [1023 - m, m],
          [1023 - m, 1023 - m],
          [m, 1023 - m],
          [m, m],
        ],
      });
    }
    return rings;
  }
  return [
    { tool: "brush", size: 2, symmetry: "vertical", side, color: color(), points: [[180, 220], [420, 700]] },
    { tool: "brush", size: 2, symmetry: "none", side, color: color(), points: [[260, 780], [512, 900], [760, 780]] },
    { tool: "brush", size: 0, symmetry: "vertical", side, color: 0, points: [[320, 420]] },
    { tool: "fill", size: 0, symmetry: "none", side, color: color(), x: 512, y: 512 },
  ];
}
