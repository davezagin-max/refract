import { PieceIcon } from "./PieceIcon";

function TurnIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12a7 7 0 1 1-2.3-5.2" stroke="#5ee6ff" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M17 3v4h-4"
        stroke="#5ee6ff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="#38ff96" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" fill="#38ff96" />
    </svg>
  );
}

/**
 * The three things a new player needs. It goes away on the first touch of the
 * board or tray, and it never sits on top of the board: on a wide screen it is
 * a strip in the side column, below everything it could push around; on a
 * phone it is one line in the tray's own header (`compact`), so it takes no
 * room from the board and nothing moves when it goes.
 */
export function HowTo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <ol
        aria-label="How to play"
        className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-fg @max-[290px]:text-[11px]"
      >
        <li>
          <strong className="font-semibold text-accent">Drag</strong> a piece in
        </li>
        <li aria-hidden="true" className="text-muted">
          ›
        </li>
        <li>
          <strong className="font-semibold text-accent">Tap</strong> to turn it
        </li>
        <li aria-hidden="true" className="text-muted">
          ›
        </li>
        <li>
          <strong className="font-semibold text-accent">Light</strong> the targets
        </li>
      </ol>
    );
  }
  return (
    <ol
      aria-label="How to play"
      className="rise grid grid-cols-3 gap-2 rounded-xl border border-accent/40 bg-raised/60 p-3 text-center text-xs leading-snug text-fg"
    >
      <li className="flex flex-col items-center gap-1">
        <PieceIcon kind="mirror" orient={1} size={24} />
        <span>
          <strong className="font-semibold">Drag</strong> a piece into the beam
        </span>
      </li>
      <li className="flex flex-col items-center gap-1">
        <TurnIcon />
        <span>
          <strong className="font-semibold">Tap</strong> it to turn it
        </span>
      </li>
      <li className="flex flex-col items-center gap-1">
        <TargetIcon />
        <span>
          <strong className="font-semibold">Light</strong> each target in its colour
        </span>
      </li>
    </ol>
  );
}
