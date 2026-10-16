/**
 * Share payload.
 * Strokes are quantised, then deflate-raw via CompressionStream and base64url.
 * Prefix: z = deflate-raw, r = raw bytes, p = 128px PNG fallback.
 */

const TOOLS = ["brush", "eraser", "fill", "clear"];
const SYMS = ["none", "vertical", "four"];

function quant(v) {
  return Math.max(0, Math.min(255, Math.round((v / 1023) * 255)));
}
function dequant(b) {
  return Math.round((b / 255) * 1023);
}

export function serialize(strokes) {
  const out = [1];
  for (const s of strokes) {
    const tool = Math.max(0, TOOLS.indexOf(s.tool));
    const size = s.size & 3;
    const sym = Math.max(0, SYMS.indexOf(s.symmetry || "none"));
    const side = s.side === "back" ? 1 : 0;
    const custom = typeof s.color === "string" && s.color.startsWith("#");
    out.push((tool & 3) | ((size & 3) << 2) | ((sym & 3) << 4) | (side << 6) | ((custom ? 1 : 0) << 7));
    if (custom) {
      const n = Number.parseInt(s.color.slice(1), 16) || 0;
      out.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
    } else {
      out.push(Number(s.color) & 255);
    }
    if (s.tool === "clear") continue;
    if (s.tool === "fill") {
      out.push(quant(s.x), quant(s.y));
      continue;
    }
    const pts = (s.points || []).slice(0, 255);
    out.push(pts.length);
    for (const [x, y] of pts) out.push(quant(x), quant(y));
  }
  return new Uint8Array(out);
}

export function deserialize(bytes) {
  const strokes = [];
  let i = 0;
  if (bytes[i++] !== 1) return strokes;
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
      strokes.push({ tool, size, symmetry, side, color, x: dequant(bytes[i++]), y: dequant(bytes[i++]) });
      continue;
    }
    const n = bytes[i++] || 0;
    const points = [];
    for (let k = 0; k < n; k += 1) points.push([dequant(bytes[i++]), dequant(bytes[i++])]);
    strokes.push({ tool, size, symmetry, side, color, points });
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
  if (token[0] === "p") return { type: "raster", token };
  const bytes = unb64url(token.slice(1));
  const raw = token[0] === "z" ? await inflateRaw(bytes) : bytes;
  return { type: "strokes", strokes: deserialize(raw) };
}

/** 128px PNG fallback token from two canvases (browser only). */
export function rasterToken(frontCanvas, backCanvas) {
  const pack = (canvas) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    c.getContext("2d").drawImage(canvas, 0, 0, 128, 128);
    const url = c.toDataURL("image/png");
    return url.slice(url.indexOf(",") + 1).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  return `p${pack(frontCanvas)}~${pack(backCanvas)}`;
}

export function rasterCanvases(token) {
  const body = token.slice(1);
  const [a, b] = body.split("~");
  const toUrl = (part) => `data:image/png;base64,${part.replace(/-/g, "+").replace(/_/g, "/")}`;
  return { front: toUrl(a), back: toUrl(b || a) };
}
