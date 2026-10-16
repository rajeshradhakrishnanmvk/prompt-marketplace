/**
 * Share payload.
 * Stroke coordinates are stored exactly on the 0–1023 grid (10 bits), with
 * small deltas packed tighter. Deflate-raw via CompressionStream, then base64url.
 * Prefix: z = deflate-raw, r = raw bytes, j = JPEG fallback, p = legacy PNG.
 */

const TOOLS = ["brush", "eraser", "fill", "clear"];
const SYMS = ["none", "vertical", "four"];

function q10(v) {
  return Math.max(0, Math.min(1023, Math.round(Number(v) || 0)));
}

function BitWriter() {
  this.out = [];
  this.acc = 0;
  this.n = 0;
}
BitWriter.prototype.write = function write(value, bits) {
  this.acc += (value & ((1 << bits) - 1)) * 2 ** this.n;
  this.n += bits;
  while (this.n >= 8) {
    this.out.push(this.acc & 255);
    this.acc = Math.floor(this.acc / 256);
    this.n -= 8;
  }
};
BitWriter.prototype.finish = function finish() {
  if (this.n) this.out.push(this.acc & 255);
  return new Uint8Array(this.out);
};

function BitReader(bytes) {
  this.bytes = bytes;
  this.i = 0;
  this.acc = 0;
  this.n = 0;
}
BitReader.prototype.read = function read(bits) {
  while (this.n < bits) {
    const b = this.i < this.bytes.length ? this.bytes[this.i++] : 0;
    this.acc += b * 2 ** this.n;
    this.n += 8;
  }
  const mask = 2 ** bits - 1;
  const value = this.acc & mask;
  this.acc = Math.floor(this.acc / 2 ** bits);
  this.n -= bits;
  return value;
};

function writePoint(w, x, y, prev) {
  const qx = q10(x);
  const qy = q10(y);
  if (!prev) {
    w.write(qx, 10);
    w.write(qy, 10);
    return [qx, qy];
  }
  const dx = qx - prev[0];
  const dy = qy - prev[1];
  if (dx >= -16 && dx <= 15 && dy >= -16 && dy <= 15) {
    w.write(0, 1);
    w.write(dx + 16, 5);
    w.write(dy + 16, 5);
  } else {
    w.write(1, 1);
    w.write(qx, 10);
    w.write(qy, 10);
  }
  return [qx, qy];
}

function readPoint(r, prev) {
  if (!prev) return [r.read(10), r.read(10)];
  if (r.read(1) === 0) return [prev[0] + r.read(5) - 16, prev[1] + r.read(5) - 16];
  return [r.read(10), r.read(10)];
}

function headerByte(s) {
  const tool = Math.max(0, TOOLS.indexOf(s.tool));
  const size = s.size & 3;
  const sym = Math.max(0, SYMS.indexOf(s.symmetry || "none"));
  const side = s.side === "back" ? 1 : 0;
  const custom = typeof s.color === "string" && s.color.startsWith("#");
  return (tool & 3) | ((size & 3) << 2) | ((sym & 3) << 4) | (side << 6) | ((custom ? 1 : 0) << 7);
}

export function serialize(strokes) {
  const w = new BitWriter();
  w.write(2, 8);
  w.write(Math.min(strokes.length, 65535), 16);
  for (const s of strokes.slice(0, 65535)) {
    w.write(headerByte(s), 8);
    const custom = typeof s.color === "string" && s.color.startsWith("#");
    if (custom) {
      const n = Number.parseInt(s.color.slice(1), 16) || 0;
      w.write((n >> 16) & 255, 8);
      w.write((n >> 8) & 255, 8);
      w.write(n & 255, 8);
    } else {
      w.write(Number(s.color) & 255, 8);
    }
    if (s.tool === "clear") continue;
    if (s.tool === "fill") {
      w.write(q10(s.x), 10);
      w.write(q10(s.y), 10);
      continue;
    }
    const pts = (s.points || []).slice(0, 255);
    w.write(pts.length, 8);
    let prev = null;
    for (const [x, y] of pts) prev = writePoint(w, x, y, prev);
  }
  return w.finish();
}

function deserializeV1(bytes) {
  const quant = (b) => Math.round((b / 255) * 1023);
  const strokes = [];
  let i = 1;
  while (i < bytes.length) {
    const h = bytes[i++];
    const tool = TOOLS[h & 3];
    const size = (h >> 2) & 3;
    const symmetry = SYMS[(h >> 4) & 3];
    const side = h & 64 ? "back" : "front";
    const custom = h & 128;
    let color;
    if (custom) {
      const r = bytes[i++];
      const g = bytes[i++];
      const b = bytes[i++];
      color = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    } else {
      color = bytes[i++];
    }
    if (tool === "clear") {
      strokes.push({ tool, size, symmetry, side, color });
      continue;
    }
    if (tool === "fill") {
      strokes.push({ tool, size, symmetry, side, color, x: quant(bytes[i++]), y: quant(bytes[i++]) });
      continue;
    }
    const n = bytes[i++] || 0;
    const points = [];
    for (let k = 0; k < n; k += 1) points.push([quant(bytes[i++]), quant(bytes[i++])]);
    strokes.push({ tool, size, symmetry, side, color, points });
  }
  return strokes;
}

function readHeader(r) {
  const h = r.read(8);
  const tool = TOOLS[h & 3];
  const size = (h >> 2) & 3;
  const symmetry = SYMS[(h >> 4) & 3];
  const side = h & 64 ? "back" : "front";
  const custom = h & 128;
  let color;
  if (custom) {
    const red = r.read(8);
    const g = r.read(8);
    const b = r.read(8);
    color = `#${[red, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  } else {
    color = r.read(8);
  }
  return { tool, size, symmetry, side, color };
}

export function deserialize(bytes) {
  if (!bytes || !bytes.length) return [];
  if (bytes[0] === 1) return deserializeV1(bytes);
  if (bytes[0] !== 2) return [];
  const r = new BitReader(bytes);
  r.read(8);
  const count = r.read(16);
  const strokes = [];
  for (let s = 0; s < count; s += 1) {
    const head = readHeader(r);
    if (head.tool === "clear") {
      strokes.push(head);
      continue;
    }
    if (head.tool === "fill") {
      strokes.push({ ...head, x: r.read(10), y: r.read(10) });
      continue;
    }
    const n = r.read(8);
    const points = [];
    let prev = null;
    for (let k = 0; k < n; k += 1) {
      prev = readPoint(r, prev);
      points.push(prev);
    }
    strokes.push({ ...head, points });
  }
  return strokes;
}

export function b64url(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function unb64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflateRaw(bytes) {
  const cs = new CompressionStream("deflate-raw");
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodePayload(strokes, rasterFallback) {
  const raw = serialize(strokes);
  let token = `r${b64url(raw)}`;
  if (typeof CompressionStream === "function") {
    try {
      token = `z${b64url(await deflateRaw(raw))}`;
    } catch (err) {
      token = `r${b64url(raw)}`;
    }
  }
  if (token.length > 1800 && typeof rasterFallback === "function") {
    const png = await rasterFallback();
    if (png) return png;
  }
  return token;
}

export async function decodePayload(token) {
  if (!token) return { type: "empty", strokes: [] };
  if (token[0] === "p" || token[0] === "j") return { type: "raster", token };
  const bytes = unb64url(token.slice(1));
  const raw = token[0] === "z" ? await inflateRaw(bytes) : bytes;
  return { type: "strokes", strokes: deserialize(raw) };
}

/**
 * Raster fallback when a long painting will not fit in the stroke token.
 * JPEG at 320px, stepping down in size and quality, aiming to stay under 2KB.
 */
export function rasterToken(frontCanvas, backCanvas) {
  const pack = (canvas, size, quality) => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.fillStyle = "#fffdf8";
    g.fillRect(0, 0, size, size);
    g.drawImage(canvas, 0, 0, size, size);
    const url = c.toDataURL("image/jpeg", quality);
    return url.slice(url.indexOf(",") + 1).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  let best = null;
  for (const size of [320, 256, 192]) {
    for (const quality of [0.72, 0.56, 0.42]) {
      const token = `j${pack(frontCanvas, size, quality)}~${pack(backCanvas, size, quality)}`;
      if (!best || token.length < best.length) best = token;
      if (token.length <= 1800) return token;
    }
  }
  return best;
}

export function rasterCanvases(token) {
  const mime = token[0] === "j" ? "image/jpeg" : "image/png";
  const body = token.slice(1);
  const [a, b] = body.split("~");
  const toUrl = (part) => `data:${mime};base64,${part.replace(/-/g, "+").replace(/_/g, "/")}`;
  return { front: toUrl(a), back: toUrl(b || a) };
}
