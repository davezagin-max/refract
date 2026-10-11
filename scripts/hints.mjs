#!/usr/bin/env node
/**
 * Rebuilds the table in lib/engine/hints.ts: for each day from the epoch, the
 * index of the first sub-seed the generator accepts.
 *
 *   pnpm hints          (default: 400 days)
 *   pnpm hints 730
 *
 * Runs the TypeScript engine directly: Node strips the types, and the small
 * resolve hook below adds the ".ts" the engine's imports leave off.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    if (target.startsWith("@/")) target = pathToFileURL(path.join(root, target.slice(2))).href;
    const local = target.startsWith(".") || target.startsWith("file:");
    if (local && path.extname(target) === "") target += ".ts";
    return nextResolve(target, context);
  },
});

const { GENERATOR_VERSION, generateDaily } = await import("../lib/engine/generator.ts");
const { EPOCH, addDays } = await import("../lib/engine/daily.ts");
const { encodeHints } = await import("../lib/engine/hints.ts");

const days = Number(process.argv[2] ?? 400);
if (!Number.isInteger(days) || days < 1) throw new Error("Usage: pnpm hints [days]");

const attempts = [];
const started = Date.now();
for (let i = 0; i < days; i++) {
  // No hint here on purpose: the table must come from the full search.
  attempts.push(generateDaily(addDays(EPOCH, i)).attempts - 1);
}
const table = encodeHints(attempts);

const file = path.join(root, "lib/engine/hints.ts");
const source = readFileSync(file, "utf8");
const next = source
  .replace(/export const HINTS_VERSION = \d+;/, `export const HINTS_VERSION = ${GENERATOR_VERSION};`)
  .replace(/export const HINTS =\s*"[^"]*";/, `export const HINTS =\n  "${table}";`);
if (next === source && !source.includes(table)) throw new Error("Could not find the table in hints.ts");
writeFileSync(file, next);
console.log(`${days} days from ${EPOCH} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
