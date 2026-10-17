/**
 * Share payload.
 * Stroke coordinates are stored exactly on the 0–1023 grid (10 bits), with
 * small deltas packed tighter. Deflate-raw via CompressionStream, then base64url.
 * Prefix: z = deflate-raw, r = raw bytes.
 * j and p are older picture links. They still open, and new links are not pictures.
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

export const SHARE_LIMIT = 1800;

export async function encodePayload(strokes) {
  const raw = serialize(strokes);
  let token = `r${b64url(raw)}`;
  if (typeof CompressionStream === "function") {
    try {
      token = `z${b64url(await deflateRaw(raw))}`;
    } catch (err) {
      token = `r${b64url(raw)}`;
    }
  }
  const length = token.length;
  if (length > SHARE_LIMIT) return { token: null, tooDetailed: true, length };
  return { token, tooDetailed: false, length };
}

function u16(bytes, offset) {
  return bytes[offset] * 256 + bytes[offset + 1];
}

export function serializeAssembly(entries) {
  const chunks = [Uint8Array.of(3, entries.length)];
  for (const [id, strokes] of entries) {
    const idBytes = new TextEncoder().encode(id);
    const body = serialize(strokes);
    const head = new Uint8Array(1 + idBytes.length + 2);
    head[0] = idBytes.length;
    head.set(idBytes, 1);
    head[1 + idBytes.length] = (body.length >> 8) & 255;
    head[2 + idBytes.length] = body.length & 255;
    chunks.push(head, body);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function deserializeAssembly(bytes) {
  if (!bytes || bytes[0] !== 3) return {};
  const count = bytes[1];
  const sheets = {};
  let offset = 2;
  const decode = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    const idLen = bytes[offset];
    const id = decode.decode(bytes.subarray(offset + 1, offset + 1 + idLen));
    const bodyLen = u16(bytes, offset + 1 + idLen);
    const start = offset + 1 + idLen + 2;
    sheets[id] = deserialize(bytes.subarray(start, start + bodyLen));
    offset = start + bodyLen;
  }
  return sheets;
}

export async function encodeAssemblyPayload(entries) {
  const raw = serializeAssembly(entries);
  let token = `r${b64url(raw)}`;
  if (typeof CompressionStream === "function") {
    try {
      token = `z${b64url(await deflateRaw(raw))}`;
    } catch (err) {
      token = `r${b64url(raw)}`;
    }
  }
  const length = token.length;
  if (length > SHARE_LIMIT) return { token: null, tooDetailed: true, length };
  return { token, tooDetailed: false, length };
}

export async function decodePayload(token) {
  if (!token) return { type: "empty", strokes: [] };
  if (token[0] === "p" || token[0] === "j") return { type: "raster", token };
  const bytes = unb64url(token.slice(1));
  const raw = token[0] === "z" ? await inflateRaw(bytes) : bytes;
  if (raw[0] === 3) return { type: "assembly", sheets: deserializeAssembly(raw) };
  return { type: "strokes", strokes: deserialize(raw) };
}

export function rasterCanvases(token) {
  const mime = token[0] === "j" ? "image/jpeg" : "image/png";
  const body = token.slice(1);
  const toUrl = (part) => `data:${mime};base64,${part.replace(/-/g, "+").replace(/_/g, "/")}`;
  if (!body.includes("~")) return { front: toUrl(body), back: null, stacked: true };
  const [a, b] = body.split("~");
  return { front: toUrl(a), back: toUrl(b || a), stacked: false };
}
