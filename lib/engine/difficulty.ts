/**
 * Difficulty is defined by search effort: the number of nodes the solver
 * expands to exhaust the puzzle (find its solution and prove there is no
 * other). More pieces, more open cells and weaker constraints all mean more
 * positions to rule out, for the solver and for a person.
 *
 * The scale is logarithmic because each extra tray piece multiplies the
 * search by roughly an order of magnitude.
 */

export type DifficultyLabel = "Easy" | "Medium" | "Hard" | "Expert" | "Brutal";

export interface Difficulty {
  label: DifficultyLabel;
  /** 1..5 */
  stars: number;
  /** log2 of the node count, one decimal. */
  score: number;
}

/** Upper node bound (exclusive) of each label, in order. */
export const DIFFICULTY_STEPS: readonly { label: DifficultyLabel; below: number }[] = [
  { label: "Easy", below: 150 },
  { label: "Medium", below: 1500 },
  { label: "Hard", below: 8000 },
  { label: "Expert", below: 30000 },
  { label: "Brutal", below: Infinity },
];

export function difficultyOf(nodes: number): Difficulty {
  const n = Math.max(1, nodes);
  const index = DIFFICULTY_STEPS.findIndex((step) => n < step.below);
  return {
    label: DIFFICULTY_STEPS[index].label,
    stars: index + 1,
    score: Math.round(Math.log2(n) * 10) / 10,
  };
}
