"use client";

import { useEffect, useState, type ReactNode } from "react";
import { beatGrid, formatTime } from "@/lib/game/share";
import type { GameResult } from "./Game";
import { CheckIcon, ShareIcon } from "./icons";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (permissions, insecure origin): try the old way.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Time left until the next puzzle (midnight UTC). */
export function Countdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const left = 86_400_000 - (now % 86_400_000);
  return <span className="font-mono tabular-nums text-fg">{formatTime(left)}</span>;
}

interface Props {
  result: GameResult;
  /** Builds the text to copy; called on click so the URL is current. */
  shareText: () => string;
  children?: ReactNode;
}

export function ResultPanel({ result, shareText, children }: Props) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [fallback, setFallback] = useState("");

  useEffect(() => {
    if (copied !== "copied") return;
    const timer = window.setTimeout(() => setCopied("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const share = async () => {
    const text = shareText();
    const ok = await copyText(text);
    setCopied(ok ? "copied" : "failed");
    setFallback(ok ? "" : text);
  };

  const hints =
    result.hints === 0 ? "no hints" : result.hints === 1 ? "1 hint" : `${result.hints} hints`;

  return (
    <section
      aria-label="Result"
      className="rise rounded-xl border border-success/40 bg-surface p-4 shadow-[0_0_40px_-12px_rgba(77,255,166,0.45)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-success">
          <CheckIcon />
          Solved
        </h2>
        {/* One row of the grid per line, exactly as it is copied: never re-wrapped by the box. */}
        <p
          role="img"
          aria-label="One square per move: how many targets were lit after it"
          className="shrink-0 whitespace-pre pt-1 text-right text-sm leading-tight"
        >
          {beatGrid(result.timeline)}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {result.moves === 1 ? "1 move" : `${result.moves} moves`} · {formatTime(result.timeMs)} · {hints}
      </p>
      <button
        type="button"
        onClick={share}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        <ShareIcon />
        {copied === "copied" ? "Copied to clipboard" : "Copy result"}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {copied === "copied" ? "Result copied to the clipboard." : ""}
      </p>
      {copied === "failed" && (
        <label className="mt-2 block text-xs text-muted">
          Copying was blocked by the browser. Select the text and copy it yourself:
          <textarea
            readOnly
            value={fallback}
            rows={5}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1 block w-full rounded-lg border border-border bg-bg p-2 font-mono text-xs text-fg"
          />
        </label>
      )}
      {children}
    </section>
  );
}
