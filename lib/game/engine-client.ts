/** Promise wrapper around the engine worker, with a main-thread fallback. */
import type { DailyPuzzle } from "@/lib/engine/generator";
import type { Puzzle } from "@/lib/engine/puzzle";
import type { SolveResult } from "@/lib/engine/solver";
import type { EngineRequest, EngineResponse } from "./engine-handle";

type Answer = { result: unknown; ms: number };
type Pending = {
  resolve: (value: Answer) => void;
  reject: (error: Error) => void;
  /** True for an editor solve, the only kind of request that is ever stopped on purpose. */
  solve: boolean;
};
type RequestBody =
  | { type: "daily"; date: string }
  | { type: "solve"; puzzle: Puzzle; maxNodes: number };

/** undefined: not tried yet. null: unavailable, use this thread. */
let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const created = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event: MessageEvent<EngineResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      if (response.ok) entry.resolve({ result: response.result, ms: response.ms });
      else entry.reject(new Error(response.error));
    };
    created.onerror = () => {
      // The worker could not load or crashed: answer everything on this thread from now on.
      created.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const entry of waiting) entry.reject(new Error("worker-lost"));
    };
    worker = created;
  } catch {
    worker = null;
  }
  return worker;
}

/** The message a solve is rejected with when `cancelSolves` abandons it. */
export const CANCELLED = "cancelled";

/**
 * Stop a solve in progress. A search cannot be interrupted from inside (it is
 * one synchronous call), so the worker itself is terminated and the next
 * request starts a fresh one. Pending solves reject with CANCELLED; a daily
 * puzzle caught in the same worker is simply asked for again (see `call`).
 * Does nothing, and returns false, when no solve is waiting on the worker
 * (which includes the main-thread fallback: that cannot be interrupted).
 */
export function cancelSolves(): boolean {
  if (!worker || ![...pending.values()].some((entry) => entry.solve)) return false;
  worker.terminate();
  worker = undefined;
  const waiting = [...pending.values()];
  pending.clear();
  for (const entry of waiting) entry.reject(new Error(CANCELLED));
  return true;
}

/** Same work on the main thread. The engine code is only downloaded if this runs. */
async function onThisThread(request: EngineRequest): Promise<Answer> {
  const { handle } = await import("./engine-handle");
  // Yield once so the caller can paint a loading state first.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const started = performance.now();
  return { result: handle(request), ms: performance.now() - started };
}

function call(body: RequestBody): Promise<Answer> {
  const request = { ...body, id: nextId++ } as EngineRequest;
  const target = getWorker();
  if (!target) return onThisThread(request);
  return new Promise<Answer>((resolve, reject) => {
    pending.set(request.id, { resolve, reject, solve: body.type === "solve" });
    target.postMessage(request);
  }).catch((error: Error) => {
    // The worker died under this request: do it here instead.
    if (error.message === "worker-lost") return onThisThread(request);
    // Only solves are ever stopped on purpose. A day's puzzle that was in the
    // same worker when it was terminated is requested again from a fresh one.
    if (error.message === CANCELLED && body.type === "daily") return call(body);
    throw error;
  });
}

export async function requestDaily(date: string): Promise<{ daily: DailyPuzzle; ms: number }> {
  const { result, ms } = await call({ type: "daily", date });
  return { daily: result as DailyPuzzle, ms };
}

export async function requestSolve(
  puzzle: Puzzle,
  maxNodes: number,
): Promise<{ result: SolveResult; ms: number }> {
  const { result, ms } = await call({ type: "solve", puzzle, maxNodes });
  return { result: result as SolveResult, ms };
}
