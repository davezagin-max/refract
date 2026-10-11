/**
 * localStorage behind a guard. Private windows, full quotas and blocked
 * storage all throw; none of that may break play, so every call is wrapped
 * and falls back to an in-memory map that lasts for the visit.
 */

const PREFIX = "refract:v1:";
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Read and parse a value. Returns null when missing, unreadable or not JSON. */
export function load(key: string): unknown {
  const full = PREFIX + key;
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(full) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) raw = memory.get(full) ?? null;
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Write a value. Returns false when it could only be kept in memory. */
export function save(key: string, value: unknown): boolean {
  const full = PREFIX + key;
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return false;
  }
  memory.set(full, raw);
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(full, raw);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  const full = PREFIX + key;
  memory.delete(full);
  try {
    storage()?.removeItem(full);
  } catch {
    // Nothing to do: the in-memory copy is already gone.
  }
}

export const KEYS = {
  game: (id: string) => `game:${id}`,
  history: "history",
  sound: "sound",
  howTo: "how-to-seen",
  editor: "editor-draft",
  puzzle: (date: string, version: number) => `puzzle:${version}:${date}`,
} as const;
