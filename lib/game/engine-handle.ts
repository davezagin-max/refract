/**
 * The work the engine worker does, as a plain function. The worker imports it
 * statically; the page only loads it (lazily) if a worker cannot be started.
 */
import { GENERATOR_VERSION, generateDaily } from "@/lib/engine/generator";
import { attemptHint } from "@/lib/engine/hints";
import type { Puzzle } from "@/lib/engine/puzzle";
import { solve } from "@/lib/engine/solver";

export type EngineRequest =
  | { id: number; type: "daily"; date: string }
  | { id: number; type: "solve"; puzzle: Puzzle; maxNodes: number };

export type EngineResponse =
  | { id: number; ok: true; result: unknown; ms: number }
  | { id: number; ok: false; error: string };

export function handle(request: EngineRequest): unknown {
  if (request.type === "daily") {
    return generateDaily(request.date, attemptHint(request.date, GENERATOR_VERSION));
  }
  return solve(request.puzzle, { maxNodes: request.maxNodes, maxSolutions: 2 });
}
