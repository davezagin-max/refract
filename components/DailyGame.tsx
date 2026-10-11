"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { EPOCH, addDays, daysBetween, isPlayable, shortDate, utcToday } from "@/lib/engine/daily";
import { GENERATOR_VERSION, type DailyPuzzle } from "@/lib/engine/generator";
import { loadDaily } from "@/lib/game/daily-cache";
import { shareText } from "@/lib/game/share";
import { cleanHistory, recordResult, streaks, type History } from "@/lib/game/stats";
import { KEYS, load, save } from "@/lib/game/storage";
import { Archive } from "./Archive";
import { Dialog } from "./Dialog";
import { Difficulty } from "./Difficulty";
import { Game, type GameResult } from "./Game";
import { Footer, Header, IconButton, IconLink } from "./Header";
import { Help } from "./Help";
import { CalendarIcon, EditIcon, HelpIcon } from "./icons";
import { Countdown, ResultPanel } from "./ResultPanel";

const gameId = (date: string) => `daily:${GENERATOR_VERSION}:${date}`;

/** Re-check the date now and then, so a tab left open notices the new day. */
function subscribeToClock(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 30_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const clientToday = () => utcToday();
const serverToday = () => null;

/**
 * The page. The date, saved games and history only exist in the browser, so
 * the server renders the frame and the session mounts on the client.
 */
export function DailyGame() {
  const today = useSyncExternalStore(subscribeToClock, clientToday, serverToday);
  if (today === null) {
    return (
      <Frame>
        <Placeholder text="Setting up the board…" />
      </Frame>
    );
  }
  return <Session today={today} />;
}

function Frame({
  children,
  onArchive,
  onHelp,
}: {
  children: React.ReactNode;
  onArchive?: () => void;
  onHelp?: () => void;
}) {
  return (
    <>
      <Header>
        <IconButton label="Past puzzles and streak" onClick={onArchive}>
          <CalendarIcon />
        </IconButton>
        <IconButton label="How to play" onClick={onHelp}>
          <HelpIcon />
        </IconButton>
        <IconLink label="Level editor" href="/editor">
          <EditIcon />
        </IconLink>
      </Header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </>
  );
}

function Placeholder({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="game-shell mx-auto w-full max-w-[1140px]">
      <div className="game-board grid min-h-[calc(100dvh-var(--header-h))] place-items-center lg:min-h-[520px]">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <svg width="96" height="96" viewBox="-50 -50 100 100" aria-hidden="true">
            <polygon
              points="40,0 20,34.6 -20,34.6 -40,0 -20,-34.6 20,-34.6"
              fill="none"
              stroke="var(--border)"
              strokeWidth="2"
            />
            <polygon
              points="40,0 20,34.6 -20,34.6 -40,0 -20,-34.6 20,-34.6"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="60 180"
              style={{ animation: "sweep 1.1s linear infinite" }}
            />
          </svg>
          <p role="status" className="text-sm text-muted">
            {text}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

type Loaded = { date: string; daily: DailyPuzzle } | { date: string; error: string };

function initialDate(today: string): string {
  const asked = new URLSearchParams(window.location.search).get("day");
  return asked && isPlayable(asked, today) ? asked : today;
}

function Session({ today }: { today: string }) {
  const [date, setDate] = useState(() => initialDate(today));
  const [openedOn] = useState(today);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<History>(() => cleanHistory(load(KEYS.history)));
  const [howTo, setHowTo] = useState(() => load(KEYS.howTo) !== true);
  const [dialog, setDialog] = useState<"archive" | "help" | null>(null);
  const [inProgress, setInProgress] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let current = true;
    loadDaily(date).then(
      (daily) => {
        if (current) setLoaded({ date, daily });
      },
      () => {
        if (current) setLoaded({ date, error: "The puzzle could not be generated." });
      },
    );
    return () => {
      // A slower answer for a day the player has already left must not replace the board.
      current = false;
    };
  }, [date, attempt]);

  const ready = loaded && loaded.date === date ? loaded : null;

  const pick = (next: string) => {
    setDialog(null);
    if (next === date) return;
    setDate(next);
    try {
      window.history.replaceState(null, "", next === today ? window.location.pathname : `?day=${next}`);
    } catch {
      // The address bar is a convenience; the game works without it.
    }
  };

  const openArchive = () => {
    // Which days have a saved, unfinished game: read when the calendar opens, not on every render.
    const started = new Set<string>();
    for (let i = 0, n = daysBetween(EPOCH, today); i <= n; i++) {
      const day = addDays(EPOCH, i);
      if (!history[day] && load(KEYS.game(gameId(day))) !== null) started.add(day);
    }
    setInProgress(started);
    setDialog("archive");
  };

  const dismissHowTo = () => {
    if (!howTo) return;
    setHowTo(false);
    save(KEYS.howTo, true);
  };

  const onSolved = (result: GameResult) => {
    const next = recordResult(history, date, {
      moves: result.moves,
      timeMs: result.timeMs,
      hints: result.hints,
      solvedOn: utcToday(),
    });
    setHistory(next);
    save(KEYS.history, next);
  };

  return (
    <Frame onArchive={openArchive} onHelp={() => setDialog("help")}>
      {!ready ? (
        <Placeholder text={`Generating puzzle for ${shortDate(date)}…`} />
      ) : "error" in ready ? (
        <Placeholder text={ready.error}>
          <button
            type="button"
            onClick={() => {
              setLoaded(null);
              setAttempt((n) => n + 1);
            }}
            className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-raised"
          >
            Try again
          </button>
        </Placeholder>
      ) : (
        <Game
          key={date}
          id={gameId(date)}
          puzzle={ready.daily.puzzle}
          solution={ready.daily.solution}
          showHowTo={howTo}
          onInteract={dismissHowTo}
          onSolved={onSolved}
          heading={
            <Heading
              daily={ready.daily}
              isToday={date === today}
              newDay={today !== openedOn && date !== today ? today : null}
              onToday={() => pick(today)}
            />
          }
          result={(result) => {
            const solvedOn = history[date]?.solvedOn ?? utcToday();
            const stats = streaks(history, today);
            return (
              <ResultPanel
                result={result}
                shareText={() =>
                  shareText({
                    number: ready.daily.number,
                    nodes: ready.daily.nodes,
                    moves: result.moves,
                    timeMs: result.timeMs,
                    hints: result.hints,
                    timeline: result.timeline,
                    late: solvedOn !== date,
                    url: window.location.origin + (date === today ? "" : `/?day=${date}`),
                  })
                }
              >
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Streak", stats.current],
                    ["Best", stats.best],
                    ["Solved", stats.solved],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border bg-bg/50 py-1.5">
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        {label}
                      </dt>
                      <dd className="font-mono text-lg tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  {date === today ? (
                    <p>
                      Next puzzle in <Countdown />
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pick(today)}
                      className="min-h-11 rounded-lg px-1 font-medium text-accent underline-offset-4 hover:underline"
                    >
                      Play today&apos;s puzzle
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openArchive}
                    className="min-h-11 rounded-lg px-1 font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Past puzzles
                  </button>
                </div>
              </ResultPanel>
            );
          }}
        />
      )}

      <Dialog open={dialog === "archive"} onClose={() => setDialog(null)} title="Past puzzles" width="max-w-md">
        <Archive today={today} current={date} history={history} inProgress={inProgress} onPick={pick} />
      </Dialog>
      <Dialog open={dialog === "help"} onClose={() => setDialog(null)} title="How to play">
        <Help />
      </Dialog>
    </Frame>
  );
}

function Heading({
  daily,
  isToday,
  newDay,
  onToday,
}: {
  daily: DailyPuzzle;
  isToday: boolean;
  newDay: string | null;
  onToday: () => void;
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold leading-tight tracking-tight lg:text-3xl">
        {isToday ? "Today" : "Archive"} <span className="text-accent">#{daily.number}</span>
      </h1>
      <p className="text-xs text-muted lg:mt-1 lg:text-sm">
        {shortDate(daily.date)} · <Difficulty nodes={daily.nodes} />
      </p>
      <p className="mt-2 hidden text-sm leading-relaxed text-muted lg:block">
        Generated from the date and checked by a solver, which examined{" "}
        <span className="font-mono text-fg">{daily.nodes.toLocaleString("en-US")}</span> positions to
        prove this board has exactly one solution.
      </p>
      {newDay && (
        <button
          type="button"
          onClick={onToday}
          className="mt-1 min-h-11 rounded-lg text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          A new puzzle is out. Play it
        </button>
      )}
    </div>
  );
}
