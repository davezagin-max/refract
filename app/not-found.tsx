import Link from "next/link";
import { Logo } from "@/components/icons";

export default function NotFound() {
  return (
    <main id="main" className="grid flex-1 place-items-center px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size={48} />
        <h1 className="text-2xl font-semibold tracking-tight">That beam left the board</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          There is no page at this address. Today&apos;s puzzle is one step back.
        </p>
        <Link
          href="/"
          className="grid min-h-12 place-items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Play today&apos;s puzzle
        </Link>
      </div>
    </main>
  );
}
