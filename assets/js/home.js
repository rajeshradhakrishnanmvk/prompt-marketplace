import { createFoldView, heroPapers, reducedMotion } from "./fold-view.js";

const models = JSON.parse(document.getElementById("foldly-models").textContent);
const host = document.getElementById("hero-fold");
const papers = heroPapers();
const reduced = reducedMotion();
const view = createFoldView(host, models["paper-cup"], {
  autoplay: !reduced,
  loop: !reduced,
  start: reduced ? 0.72 : 0,
});
view.setTextures(papers.front, papers.back);
if (reduced) view.setTime(0.72);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) view.pause();
  else if (!reduced) view.play();
});
