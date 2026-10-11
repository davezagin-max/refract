import { difficultyOf } from "@/lib/engine/difficulty";

/** Difficulty label and stars, from the solver's node count. */
export function Difficulty({ nodes }: { nodes: number }) {
  const { label, stars } = difficultyOf(nodes);
  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <span aria-hidden="true" className="tracking-tight text-gold">
        {"★".repeat(stars)}
        <span className="text-border">{"★".repeat(5 - stars)}</span>
      </span>
      <span className="sr-only">, difficulty {stars} of 5</span>
    </span>
  );
}
