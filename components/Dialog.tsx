"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tailwind max-width class. */
  width?: string;
}

/**
 * A modal built on the native <dialog>: the browser supplies the focus trap,
 * Escape to close, and focus return to the button that opened it.
 */
export function Dialog({ open, onClose, title, children, width = "max-w-lg" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`m-auto w-[calc(100vw-1rem)] ${width} max-h-[calc(100dvh-1.5rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl shadow-black/60`}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-5 sm:py-3">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"
            >
              <CloseIcon />
            </button>
          </header>
          <div className="overflow-y-auto px-3 py-4 sm:px-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
