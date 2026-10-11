"use client";

/** Last-resort screen if a page throws while rendering. Saved games are untouched. */
export default function PageError({ retry }: { error: Error; retry: () => void }) {
  return (
    <main id="main" className="grid flex-1 place-items-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          The page hit an error it could not recover from. Your saved games and streak are stored
          in this browser and have not been changed.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="min-h-12 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
