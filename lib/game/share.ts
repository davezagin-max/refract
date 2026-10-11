/** The spoiler-free result text people paste into a chat. */
import { difficultyOf } from "@/lib/engine/difficulty";
import type { Beat } from "./state";

const BEAT_EMOJI: Readonly<Record<Beat, string>> = {
  none: "⬛",
  some: "🟧",
  most: "🟨",
  all: "🟩",
  hint: "💡",
};

const ROW = 8;
const MAX_BEATS = 40;

/** 83 seconds as "1:23". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const padded = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${padded}`
    : `${minutes}:${padded}`;
}

/** One square per move: how many targets were lit after it. Says nothing about where pieces go. */
export function beatGrid(timeline: readonly Beat[]): string {
  let beats = timeline.map((beat) => BEAT_EMOJI[beat]);
  if (beats.length > MAX_BEATS) beats = ["…", ...beats.slice(beats.length - (MAX_BEATS - 1))];
  const rows: string[] = [];
  for (let i = 0; i < beats.length; i += ROW) rows.push(beats.slice(i, i + ROW).join(""));
  return rows.join("\n");
}

export interface ShareInput {
  number: number;
  /** Solver nodes: the difficulty measure. */
  nodes: number;
  moves: number;
  timeMs: number;
  hints: number;
  timeline: readonly Beat[];
  /** Solved after its own day, from the archive. */
  late?: boolean;
  url: string;
}

export function shareText(input: ShareInput): string {
  const { label, stars } = difficultyOf(input.nodes);
  const hints =
    input.hints === 0 ? "no hints" : input.hints === 1 ? "1 hint" : `${input.hints} hints`;
  const moves = input.moves === 1 ? "1 move" : `${input.moves} moves`;
  return [
    `Refract #${input.number}${input.late ? " (archive)" : ""} · ${label} ${"★".repeat(stars)}${"☆".repeat(5 - stars)}`,
    `${moves} · ${formatTime(input.timeMs)} · ${hints}`,
    beatGrid(input.timeline),
    input.url,
  ].join("\n");
}
