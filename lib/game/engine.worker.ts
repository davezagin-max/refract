/**
 * Web Worker entry: generation and solving can take tens or hundreds of
 * milliseconds on a phone, so they never run on the thread that draws.
 */
import { handle, type EngineRequest, type EngineResponse } from "./engine-handle";

interface WorkerScope {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage(message: EngineResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  const started = performance.now();
  try {
    const result = handle(request);
    scope.postMessage({ id: request.id, ok: true, result, ms: performance.now() - started });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "The engine failed.",
    });
  }
};
