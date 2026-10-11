/** SVG twin of the canvas pieces, for the tray, the drag ghost and the help text. */
import { mirrorAngle } from "@/lib/engine/hex";
import type { PieceKind } from "@/lib/engine/optics";
import { BOARD } from "@/lib/render/palette";

interface Props {
  kind: PieceKind;
  orient?: number;
  size?: number;
  className?: string;
}

export function PieceIcon({ kind, orient = 0, size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 2 2"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {kind === "prism" ? <Prism right={orient !== 0} /> : <Bar kind={kind} orient={orient} />}
    </svg>
  );
}

function Bar({ kind, orient }: { kind: "mirror" | "splitter"; orient: number }) {
  const angle = mirrorAngle(orient);
  const x = Math.cos(angle) * 0.72;
  const y = Math.sin(angle) * 0.72;
  const ends = { x1: -x, y1: -y, x2: x, y2: y };
  if (kind === "splitter") {
    return (
      <>
        <line {...ends} stroke={BOARD.backing} strokeWidth={0.27} strokeLinecap="round" />
        <line {...ends} stroke={BOARD.splitter} strokeWidth={0.14} strokeDasharray="0.2 0.14" />
      </>
    );
  }
  return (
    <>
      <line {...ends} stroke={BOARD.backing} strokeWidth={0.27} strokeLinecap="round" />
      <line {...ends} stroke={BOARD.mirror} strokeWidth={0.14} strokeLinecap="round" />
      <line
        x1={-x * 0.82}
        y1={-y * 0.82}
        x2={x * 0.82}
        y2={y * 0.82}
        stroke="#fff"
        strokeWidth={0.04}
        strokeLinecap="round"
      />
    </>
  );
}

function Prism({ right }: { right: boolean }) {
  const radius = 0.66;
  const points = [0, 1, 2]
    .map((i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 3 + (right ? Math.PI : 0);
      return `${(Math.cos(angle) * radius).toFixed(3)},${(Math.sin(angle) * radius).toFixed(3)}`;
    })
    .join(" ");
  // The same curved arrow as on the canvas: counter-clockwise for a left bend.
  const r = 0.2;
  const start = right ? Math.PI * 0.85 : Math.PI * 0.15;
  const end = right ? start + Math.PI * 1.45 : start - Math.PI * 1.45;
  const sx = Math.cos(start) * r;
  const sy = Math.sin(start) * r;
  const ex = Math.cos(end) * r;
  const ey = Math.sin(end) * r;
  const tangent = end + (right ? Math.PI / 2 : -Math.PI / 2);
  const head = 0.12;
  const wing = (offset: number) =>
    `${(ex + Math.cos(tangent + offset) * head).toFixed(3)},${(ey + Math.sin(tangent + offset) * head).toFixed(3)}`;
  return (
    <>
      <polygon
        points={points}
        fill={BOARD.prismFill}
        stroke={BOARD.prism}
        strokeWidth={0.07}
        strokeLinejoin="round"
      />
      <path
        d={`M${sx.toFixed(3)} ${sy.toFixed(3)} A${r} ${r} 0 1 ${right ? 1 : 0} ${ex.toFixed(3)} ${ey.toFixed(3)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.05}
        strokeLinecap="round"
      />
      <polyline
        points={`${wing(-2.5)} ${ex.toFixed(3)},${ey.toFixed(3)} ${wing(2.5)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.05}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}
