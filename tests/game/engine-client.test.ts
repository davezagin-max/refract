/**
 * The worker client, driven with a stand-in Worker: requests are matched to
 * answers, an abandoned solve stops the worker, a day's puzzle is never lost
 * to that, and a worker that fails falls back to the main thread.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHITE } from "@/lib/engine/optics";
import type { EngineRequest, EngineResponse } from "@/lib/game/engine-handle";
import { at, puzzle } from "../engine/helpers";

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((event: { data: EngineResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  posted: EngineRequest[] = [];
  terminated = false;

  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(request: EngineRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answer the nth request this worker was sent. */
  answer(n: number, result: unknown) {
    this.onmessage?.({ data: { id: this.posted[n].id, ok: true, result, ms: 1 } });
  }
}

const small = puzzle(2, {
  emitters: [{ cell: at(2, -2, 0), dir: 0, color: WHITE }],
  targets: [{ cell: at(2, 2, -2), color: WHITE }],
  walls: [at(2, 2, -1)],
  tray: ["mirror"],
});

async function client() {
  return import("@/lib/game/engine-client");
}

describe("engine worker client", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.made = [];
    vi.stubGlobal("Worker", FakeWorker);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each request to one shared worker and matches answers by id", async () => {
    const { requestSolve } = await client();
    const first = requestSolve(small, 100);
    const second = requestSolve(small, 200);
    expect(FakeWorker.made).toHaveLength(1);
    const worker = FakeWorker.made[0];
    expect(worker.posted.map((r) => r.type)).toEqual(["solve", "solve"]);
    expect(worker.posted[0].id).not.toBe(worker.posted[1].id);
    // Answers arriving out of order still reach the right caller.
    worker.answer(1, { nodes: 2 });
    worker.answer(0, { nodes: 1 });
    expect((await first).result).toEqual({ nodes: 1 });
    expect((await second).result).toEqual({ nodes: 2 });
  });

  it("stops an abandoned solve by terminating the worker, and starts a fresh one next time", async () => {
    const { CANCELLED, cancelSolves, requestSolve } = await client();
    const abandoned = requestSolve(small, 300_000);
    const failure = abandoned.then(
      () => null,
      (error: Error) => error.message,
    );
    expect(cancelSolves()).toBe(true);
    expect(FakeWorker.made[0].terminated).toBe(true);
    expect(await failure).toBe(CANCELLED);

    // Nothing left to stop.
    expect(cancelSolves()).toBe(false);

    const next = requestSolve(small, 100);
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[1].terminated).toBe(false);
    // A late answer from the dead worker is ignored; the new worker's answer counts.
    FakeWorker.made[0].answer(0, { nodes: 999 });
    FakeWorker.made[1].answer(0, { nodes: 7 });
    expect((await next).result).toEqual({ nodes: 7 });
  });

  it("never stops the worker for a day's puzzle, and re-asks if one was caught by a stop", async () => {
    const { cancelSolves, requestDaily, requestSolve } = await client();
    const daily = requestDaily("2026-10-05");
    // Only a daily request is waiting: there is nothing to cancel.
    expect(cancelSolves()).toBe(false);
    expect(FakeWorker.made[0].terminated).toBe(false);

    const solve = requestSolve(small, 300_000).catch((error: Error) => error.message);
    expect(cancelSolves()).toBe(true);
    expect(await solve).toBe("cancelled");
    // The daily request was sent again, to the replacement worker.
    await vi.waitFor(() => expect(FakeWorker.made).toHaveLength(2));
    const replacement = FakeWorker.made[1];
    expect(replacement.posted).toHaveLength(1);
    expect(replacement.posted[0]).toMatchObject({ type: "daily", date: "2026-10-05" });
    replacement.answer(0, { date: "2026-10-05" });
    expect((await daily).daily).toEqual({ date: "2026-10-05" });
  });

  it("does the work on the main thread when the worker fails", async () => {
    const { requestSolve } = await client();
    const pending = requestSolve(small, 1000);
    FakeWorker.made[0].onerror?.();
    const { result } = await pending;
    // The real solver ran: one mirror at the centre is the only solution.
    expect(result.status).toBe("solved");
    expect(result.unique).toBe(true);
    expect(result.solutions[0]).toEqual([{ cell: at(2, 0, 0), kind: "mirror", orient: 1 }]);

    // From now on no worker is tried at all.
    const again = await requestSolve(small, 1000);
    expect(FakeWorker.made).toHaveLength(1);
    expect(again.result.unique).toBe(true);
  });

  it("uses the main thread from the start when workers do not exist", async () => {
    vi.stubGlobal("Worker", undefined);
    const { cancelSolves, requestSolve } = await client();
    const { result } = await requestSolve(small, 1000);
    expect(result.unique).toBe(true);
    expect(cancelSolves()).toBe(false);
  });
});
