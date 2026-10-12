// Preloaded by `drawio-ai run` (node --import / bun --preload): makes the bare specifier "drawio-ai-kit"
// resolve to THIS install's kit, whatever the script's cwd or node_modules look like.
import { register } from "node:module";

const kit = new URL(import.meta.url.endsWith(".ts") ? "./kit.ts" : "./kit.mjs", import.meta.url).href;
const bun = (globalThis as { Bun?: { plugin(p: unknown): void } }).Bun;
if (bun) {
  // Bun ignores Node loader hooks; a virtual module is the one mechanism that works for runtime imports.
  bun.plugin({ name: "drawio-ai-kit", setup: (b: { module(n: string, f: () => unknown): void }) =>
    b.module("drawio-ai-kit", () => ({ contents: `export * from ${JSON.stringify(kit)}`, loader: "js" })) });
} else {
  const hook = `export const resolve = (s, c, next) => s === "drawio-ai-kit" ? { url: ${JSON.stringify(kit)}, shortCircuit: true } : next(s, c);`;
  register("data:text/javascript," + encodeURIComponent(hook));
}
