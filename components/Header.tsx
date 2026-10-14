"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { setSoundEnabled, soundStore } from "@/lib/game/sound";
import { Logo, SoundOffIcon, SoundOnIcon } from "./icons";

const iconButton =
  "flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg text-sm text-muted transition-colors hover:bg-raised hover:text-fg";

/** A visible label next to the icon on wide screens; icon only on a phone. */
function Label({ text }: { text?: string }) {
  return text ? <span className="hidden pr-1 lg:inline">{text}</span> : null;
}

export function IconButton({
  label,
  text,
  onClick,
  pressed,
  children,
}: {
  label: string;
  text?: string;
  onClick?: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`${iconButton} ${text ? "lg:px-2.5" : ""}`}
    >
      {children}
      <Label text={text} />
    </button>
  );
}

export function IconLink({
  label,
  text,
  href,
  children,
}: {
  label: string;
  text?: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-label={label} title={label} className={`${iconButton} ${text ? "lg:px-2.5" : ""}`}>
      {children}
      <Label text={text} />
    </Link>
  );
}

function SoundToggle() {
  const on = useSyncExternalStore(
    soundStore.subscribe,
    soundStore.getSnapshot,
    soundStore.getServerSnapshot,
  );
  return (
    <IconButton label={on ? "Sound on" : "Sound off"} pressed={on} onClick={() => setSoundEnabled(!on)}>
      {on ? <SoundOnIcon /> : <SoundOffIcon />}
    </IconButton>
  );
}

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 lg:px-6">
      <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-md text-lg font-semibold tracking-tight">
        <Logo />
        Refract
        <span className="hidden truncate border-l border-border pl-3 text-sm font-normal tracking-normal text-muted sm:inline">
          a daily laser puzzle
        </span>
      </Link>
      <nav aria-label="Game menu" className="flex shrink-0 items-center lg:gap-1">
        {children}
        <SoundToggle />
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="flex min-h-[var(--footer-h)] flex-wrap items-center justify-center gap-x-4 border-t border-border/60 px-4 text-center text-xs text-muted">
      <span>Built with Claude Code and Claude Opus 5.5.</span>
      <a
        href="https://github.com/davezagin-max/refract"
        className="inline-flex min-h-11 items-center underline decoration-border underline-offset-4 hover:text-fg"
      >
        Source on GitHub
      </a>
    </footer>
  );
}
