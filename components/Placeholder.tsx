import type { ReactNode } from "react";

/** Board-sized stand-in for loading and error states, so nothing jumps when the board arrives. */
export function Placeholder({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-var(--header-h))] w-full max-w-[1140px] place-items-center lg:min-h-[min(calc(100dvh-var(--header-h)-var(--footer-h)),900px)]">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <svg width="96" height="96" viewBox="-50 -50 100 100" aria-hidden="true">
          <polygon
            points="40,0 20,34.6 -20,34.6 -40,0 -20,-34.6 20,-34.6"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <polygon
            points="40,0 20,34.6 -20,34.6 -40,0 -20,-34.6 20,-34.6"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="60 180"
            style={{ animation: "sweep 1.1s linear infinite" }}
          />
        </svg>
        <p role="status" className="text-sm text-muted">
          {text}
        </p>
        {children}
      </div>
    </div>
  );
}
