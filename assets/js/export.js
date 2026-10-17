import { prepare, sample } from "./runtime.js";
import { poseFit, paintProjection } from "./project.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawFold(ctx, model, prep, angles, camera, front, back, size, ox, oy) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#fffaf3";
  roundRect(ctx, 0, 0, size, size, 18);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, 18);
  ctx.clip();
  const pad = size * 0.16;
  ctx.translate(pad, pad);
  const drawSize = size - pad * 2;
  const fit = model.shape === "net" ? poseFit(model, prep, angles, camera, drawSize, 0.08) : undefined;
  paintProjection(ctx, model, prep, angles, camera, front, back, drawSize, fit);
  ctx.restore();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderCard(model, angles, camera, front, back) {
  const prep = prepare(model);
  const card = document.createElement("canvas");
  card.width = 1200;
  card.height = 630;
  const g = card.getContext("2d");
  g.fillStyle = "#243056";
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#f4ecdf";
  g.fillRect(520, 0, 680, 630);
  g.fillStyle = "#f6e2b0";
  g.fillRect(56, 64, 72, 12);
  g.fillStyle = "#fffaf3";
  g.font = "700 26px Palatino, Georgia, serif";
  g.fillText("FOLDLY", 56, 120);
  g.font = "700 58px Palatino, Georgia, serif";
  wrapText(g, model.name, 56, 200, 420, 66);
  g.font = "400 26px Georgia, serif";
  g.fillStyle = "#f6e2b0";
  wrapText(g, "Paint a square. Watch it fold.", 56, 470, 420, 34);
  drawFold(g, model, prep, angles, camera, front, back, 520, 620, 55);
  return card;
}

function drawFrame(ctx, model, prep, sampled, camera, front, back) {
  ctx.fillStyle = "#243056";
  ctx.fillRect(0, 0, 960, 540);
  ctx.fillStyle = "#fffaf3";
  ctx.font = "700 22px Palatino, Georgia, serif";
  ctx.fillText("FOLDLY", 36, 46);
  ctx.font = "600 28px Palatino, Georgia, serif";
  ctx.fillText(model.name, 36, 84);
  const cam = { ...camera, flip: sampled.flip || 0 };
  drawFold(ctx, model, prep, sampled.angles, cam, front, back, 430, 490, 55);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "400 22px Georgia, serif";
  const label = `Step ${sampled.stepIndex + 1}: ${sampled.label}`;
  wrapText(ctx, label, 36, 460, 420, 28);
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1", "video/mp4"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export async function recordFold(model, camera, front, back, onProgress) {
  const prep = prepare(model);
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  if (!canvas.captureStream) throw new Error("no-capture");
  const mime = pickMime();
  if (!mime) throw new Error("no-recorder");
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    rec.onstop = () => resolve();
  });
  const frames = Math.max(1, Math.round(prep.duration * 30));
  rec.start(100);
  for (let i = 0; i <= frames; i += 1) {
    const unit = i / frames;
    const sampled = sample(prep, unit * prep.duration);
    drawFrame(ctx, model, prep, sampled, camera, front, back);
    if (onProgress) onProgress(unit);
    await wait(1000 / 30);
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mime }), ext };
}
