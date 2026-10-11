import { PieceIcon } from "./PieceIcon";

/** The three things a new player needs. It goes away on the first touch of the board. */
export function HowTo() {
  return (
    <ol
      aria-label="How to play"
      className="rise grid grid-cols-3 gap-2 rounded-xl border border-accent/30 bg-raised/60 p-2 text-center text-xs leading-snug text-fg"
    >
      <li className="flex flex-col items-center gap-1">
        <PieceIcon kind="mirror" orient={1} size={28} />
        <span>
          <strong className="font-semibold">Drag</strong> a piece into the beam
        </span>
      </li>
      <li className="flex flex-col items-center gap-1">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M19 12a7 7 0 1 1-2.3-5.2"
            stroke="#5ee6ff"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="M17 3v4h-4" stroke="#5ee6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>
          <strong className="font-semibold">Tap</strong> it to turn it
        </span>
      </li>
      <li className="flex flex-col items-center gap-1">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#38ff96" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="5" fill="#38ff96" />
        </svg>
        <span>
          <strong className="font-semibold">Light</strong> every target in its colour
        </span>
      </li>
    </ol>
  );
}
