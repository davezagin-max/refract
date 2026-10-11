import { PieceIcon } from "./PieceIcon";

/**
 * The three things a new player needs. It goes away on the first touch of the
 * board or tray. Compact on a phone, where it floats over the foot of the board.
 */
export function HowTo() {
  return (
    <ol
      aria-label="How to play"
      className="rise grid grid-cols-3 gap-1 rounded-xl border border-accent/40 bg-raised/90 px-1.5 py-2 text-center text-[11px] leading-tight text-fg shadow-lg shadow-black/40 backdrop-blur-sm lg:gap-2 lg:bg-raised/60 lg:p-3 lg:text-xs lg:leading-snug lg:shadow-none"
    >
      <li className="flex flex-col items-center gap-0.5 lg:gap-1">
        <PieceIcon kind="mirror" orient={1} size={24} />
        <span>
          <strong className="font-semibold">Drag</strong> a piece into the beam
        </span>
      </li>
      <li className="flex flex-col items-center gap-0.5 lg:gap-1">
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
        <span>
          <strong className="font-semibold">Tap</strong> it to turn it
        </span>
      </li>
      <li className="flex flex-col items-center gap-0.5 lg:gap-1">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#38ff96" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="5" fill="#38ff96" />
        </svg>
        <span>
          <strong className="font-semibold">Light</strong> each target in its colour
        </span>
      </li>
    </ol>
  );
}
