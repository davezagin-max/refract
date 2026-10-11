import { PieceIcon } from "./PieceIcon";

const kbd =
  "rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[11px] text-fg whitespace-nowrap";

function Row({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-raised">
        {icon}
      </span>
      <p className="text-sm leading-relaxed text-muted">
        <strong className="font-semibold text-fg">{title}.</strong> {children}
      </p>
    </li>
  );
}

function Swatch({ color, letter }: { color: string; letter: string }) {
  return (
    <span
      className="inline-grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-bg"
      style={{ background: color }}
    >
      {letter}
    </span>
  );
}

/** The full rules and every control, behind the "?" button. */
export function Help() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Place every piece from your tray so that each target receives{" "}
        <strong className="font-semibold text-fg">exactly</strong> its colour. Every puzzle has one
        solution, and the same puzzle is served to everyone each day (it changes at midnight UTC).
      </p>

      <ul className="space-y-3">
        <Row icon={<PieceIcon kind="mirror" orient={1} size={36} />} title="Mirror">
          Reflects the beam off both faces. Turn it to choose the angle: a beam that runs along the
          mirror passes straight by.
        </Row>
        <Row icon={<PieceIcon kind="splitter" orient={1} size={36} />} title="Splitter">
          A half-silvered mirror. One copy of the beam goes straight on, one copy is reflected.
        </Row>
        <Row icon={<PieceIcon kind="prism" size={36} />} title="Prism">
          Separates colours. Red goes straight, green turns one step and blue turns two, all to the
          side the arrow shows. Tap it to flip the side.
        </Row>
      </ul>

      <div className="rounded-xl border border-border bg-bg/50 p-3 text-sm leading-relaxed text-muted">
        <p>
          <strong className="font-semibold text-fg">Colour is additive.</strong> White light is red,
          green and blue together, and beams that cross on a target mix:
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1">
            <Swatch color="#ff4868" letter="R" />+<Swatch color="#38ff96" letter="G" />=
            <Swatch color="#ffe24a" letter="Y" />
          </span>
          <span className="flex items-center gap-1">
            <Swatch color="#ff4868" letter="R" />+<Swatch color="#4e8cff" letter="B" />=
            <Swatch color="#ff5cfa" letter="M" />
          </span>
          <span className="flex items-center gap-1">
            <Swatch color="#38ff96" letter="G" />+<Swatch color="#4e8cff" letter="B" />=
            <Swatch color="#48f0ff" letter="C" />
          </span>
          <span className="flex items-center gap-1">
            all three =<Swatch color="#ffffff" letter="W" />
          </span>
        </p>
        <p className="mt-2">
          A target that gets an extra colour is wrong, so sometimes the job is to keep light away:
          a dashed ring inside a target shows the wrong colour arriving. Each target carries its
          colour&apos;s letter, so you never have to tell colours apart by eye.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Controls</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm text-muted">
          <dt className="font-medium text-fg">Mouse or touch</dt>
          <dd>
            Drag a piece from the tray onto a cell (the beams preview as you move), or tap the piece
            and then the cell. Tap a placed piece to turn it; right-click turns it back. Drag it off
            the board to return it.
          </dd>
          <dt className="font-medium text-fg">Keyboard</dt>
          <dd className="space-y-1.5">
            <p>
              <span className={kbd}>Arrows</span> move the cursor · <span className={kbd}>Enter</span>{" "}
              pick up or place · <span className={kbd}>1</span>–<span className={kbd}>9</span> choose a
              tray piece
            </p>
            <p>
              <span className={kbd}>R</span> turn (<span className={kbd}>Shift+R</span> back) ·{" "}
              <span className={kbd}>Backspace</span> return to tray · <span className={kbd}>Esc</span>{" "}
              cancel
            </p>
            <p>
              <span className={kbd}>Z</span> undo · <span className={kbd}>Shift+Z</span> redo ·{" "}
              <span className={kbd}>H</span> hint
            </p>
          </dd>
        </dl>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        <strong className="font-semibold text-fg">Hints</strong> place one piece where it belongs and
        lock it. They are counted and shown in your shared result. Difficulty is not a guess: it is
        the number of positions a solver has to examine to prove the puzzle has a single solution.
      </p>
    </div>
  );
}
