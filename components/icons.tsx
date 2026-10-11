/** Small stroke icons. Decorative: every button that uses one has a text label. */
import type { ReactNode } from "react";

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5 4 9l4 4" />
    <path d="M4 9h10a5 5 0 0 1 0 10h-3" />
  </Svg>
);
export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m16 5 4 4-4 4" />
    <path d="M20 9H10a5 5 0 0 0 0 10h3" />
  </Svg>
);
export const HintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.9 1 1 1.7h5.2c.1-.7.5-1.3 1-1.7A6 6 0 0 0 12 3Z" />
  </Svg>
);
export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <path d="M4 4v5h5" />
  </Svg>
);
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const HelpIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9" />
    <path d="M12 17h.01" />
  </Svg>
);
export const SoundOnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);
export const SoundOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
    <path d="m16 10 5 5M21 10l-5 5" />
  </Svg>
);
export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 20 1-4L16 5l3 3L8 19l-4 1Z" />
    <path d="m14 7 3 3" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14 6-6 6 6 6" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5v14l12-7L7 5Z" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  </Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="11" width="12" height="9" rx="2" />
    <path d="M9 11V8a3 3 0 0 1 6 0v3" />
  </Svg>
);

/** The wordmark's glyph: a beam entering a prism and leaving as three colours. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M2 19 13 15" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 14 30 10" stroke="#ff4868" strokeWidth="2" strokeLinecap="round" />
      <path d="M19.5 16.5 30 16.5" stroke="#38ff96" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 19 30 23" stroke="#4e8cff" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16 5 26 25H6L16 5Z"
        fill="rgba(190,215,255,0.16)"
        stroke="#e6eeff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
