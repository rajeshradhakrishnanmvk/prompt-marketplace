import { prepare, sample } from "./runtime.js";
import { prepareAssembly, sampleAssembly } from "./assembly.js";

export function prepareModel(model) {
  if (model && model.type === "assembly") return prepareAssembly(model);
  return prepare(model);
}

export function sampleModel(prep, time) {
  if (prep && prep.assembly) return sampleAssembly(prep, time);
  return sample(prep, time);
}
