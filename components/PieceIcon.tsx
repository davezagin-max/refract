/** SVG twin of the canvas pieces, for the tray, the drag ghost and the help text. */
import { mirrorAngle } from "@/lib/engine/hex";
import type { PieceKind } from "@/lib/engine/optics";
import { BOARD } from "@/lib/render/palette";
import { prismArrow } from "@/lib/render/pieces";

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
  // The same curved arrow as on the canvas, scaled up a little for the larger triangle.
  const arrow = prismArrow(!right);
  const k = 1.14;
  const r = arrow.radius * k;
  const at = (angle: number) => `${(Math.cos(angle) * r).toFixed(3)} ${(Math.sin(angle) * r).toFixed(3)}`;
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
        d={`M${at(arrow.start)} A${r} ${r} 0 1 ${right ? 1 : 0} ${at(arrow.end)}`}
        fill="none"
        stroke="#fff"
        strokeWidth={0.055}
        strokeLinecap="round"
      />
      <polygon
        points={arrow.head.map(([x, y]) => `${(x * k).toFixed(3)},${(y * k).toFixed(3)}`).join(" ")}
        fill="#fff"
      />
    </>
  );
}
