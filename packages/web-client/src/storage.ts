/**
 * Storage adapter (CLAUDE.md: browser storage ONLY in the deployed site
 * build; preview/artifact builds stay in-memory). Vite's PROD flag is the
 * deployment boundary — `pnpm dev` and artifact previews get the in-memory
 * backend, the published site gets localStorage.
 */

export interface SaveMeta {
  mode: "game" | "sim";
  startYear: number;
  tick: number;
  savedLabel: string;
}

interface SaveRecord {
  meta: SaveMeta;
  doc: unknown;
}

const PREFIX = "lunaris/";
const memory = new Map<string, string>();

const persistent =
  import.meta.env.PROD &&
  typeof localStorage !== "undefined" &&
  (() => {
    try {
      localStorage.setItem(`${PREFIX}probe`, "1");
      localStorage.removeItem(`${PREFIX}probe`);
      return true;
    } catch {
      return false;
    }
  })();

function read(key: string): string | null {
  return persistent ? localStorage.getItem(PREFIX + key) : (memory.get(key) ?? null);
}

function write(key: string, value: string): void {
  if (persistent) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // quota — drop silently; saves are a convenience, not state
    }
  } else {
    memory.set(key, value);
  }
}

export const storage = {
  /** True when saves survive a page reload (deployed build only). */
  isPersistent: persistent,

  save(slot: string, meta: SaveMeta, doc: unknown): void {
    write(slot, JSON.stringify({ meta, doc } satisfies SaveRecord));
  },

  load(slot: string): SaveRecord | null {
    const raw = read(slot);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as SaveRecord;
    } catch {
      return null;
    }
  },

  meta(slot: string): SaveMeta | null {
    return this.load(slot)?.meta ?? null;
  },
};
