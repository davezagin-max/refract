"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { setSoundEnabled, soundStore } from "@/lib/game/sound";
import { Logo, SoundOffIcon, SoundOnIcon } from "./icons";

const iconButton =
  "grid h-11 w-11 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg";

export function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
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
      className={iconButton}
    >
      {children}
    </button>
  );
}

export function IconLink({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className={iconButton}>
      {children}
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
      <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md text-lg font-semibold tracking-tight">
        <Logo />
        Refract
      </Link>
      <nav aria-label="Game menu" className="flex items-center">
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
