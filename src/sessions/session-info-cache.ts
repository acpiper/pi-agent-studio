import { createReadStream, type Dirent, type Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";

/** Same encoding as pi's internal `getDefaultSessionDirPath`; pi does not export it. */
export function sessionDirForCwd(sessionsRoot: string, cwd: string): string {
  const safe = `--${resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return join(sessionsRoot, safe);
}

export async function listSessionFiles(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  return names.filter((n) => n.endsWith(".jsonl")).map((n) => join(dir, n));
}

export async function listAllSessionFiles(sessionsRoot: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(sessionsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const dirs = entries.filter((e) => e.isDirectory() || e.isSymbolicLink());
  const perDir = await Promise.all(dirs.map((e) => listSessionFiles(join(sessionsRoot, e.name))));
  return perDir.flat();
}

type Loader<T> = (path: string, stats: Stats) => Promise<T | null>;

export interface FileStatCache<T> {
  load(paths: readonly string[]): Promise<T[]>;
}

/**
 * Keeps one loaded value per file and loads a file again only when its mtime or size changed.
 * Each `load` call drops the entries of files that are not in its list.
 */
export function createFileStatCache<T>(loader: Loader<T>): FileStatCache<T> {
  const entries = new Map<string, { mtimeMs: number; size: number; value: T | null }>();

  const loadOne = async (path: string): Promise<T | null> => {
    let stats: Stats;
    try {
      stats = await stat(path);
    } catch (err) {
      // The file was deleted after the directory listing.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      entries.delete(path);
      return null;
    }
    const hit = entries.get(path);
    if (hit && hit.mtimeMs === stats.mtimeMs && hit.size === stats.size) return hit.value;
    const value = await loader(path, stats);
    entries.set(path, { mtimeMs: stats.mtimeMs, size: stats.size, value });
    return value;
  };

  return {
    async load(paths) {
      const wanted = new Set(paths);
      for (const path of entries.keys()) if (!wanted.has(path)) entries.delete(path);
      const values = await Promise.all(paths.map(loadOne));
      return values.filter((v) => v !== null) as T[];
    },
  };
}

type Entry = Record<string, unknown> & { type?: unknown };
type Message = { role?: unknown; content?: unknown; timestamp?: unknown };

function parseLine(line: string): Entry | null {
  if (!line.trim()) return null;
  try {
    const v: unknown = JSON.parse(line);
    return v && typeof v === "object" ? (v as Entry) : null;
  } catch {
    return null;
  }
}

function textOf(message: Message): string {
  const { content } = message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text")
    .map((b) => b.text)
    .join(" ");
}

function activityTime(entry: Entry, message: Message): number | undefined {
  if (!("content" in message) || typeof message.role !== "string") return undefined;
  if (message.role !== "user" && message.role !== "assistant") return undefined;
  if (typeof message.timestamp === "number") return message.timestamp;
  const t = new Date(entry.timestamp as string).getTime();
  return Number.isNaN(t) ? undefined : t;
}

async function* readLines(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path, { encoding: "utf8" });
  try {
    yield* createInterface({ input: stream, crlfDelay: Infinity });
  } finally {
    stream.destroy();
  }
}

/**
 * Builds the `SessionInfo` that `SessionManager.list()` returns for one file.
 * Matches pi's internal `buildSessionInfo` (pi 1.1 to 1.6), which pi does not export.
 */
export async function readSessionInfo(path: string, stats: Stats): Promise<SessionInfo | null> {
  try {
    let header: Entry | null = null;
    let messageCount = 0;
    let firstMessage = "";
    const allMessages: string[] = [];
    let name: string | undefined;
    let lastActivity: number | undefined;

    for await (const line of readLines(path)) {
      const entry = parseLine(line);
      if (!entry) continue;
      if (!header) {
        if (entry.type !== "session") return null;
        header = entry;
        continue;
      }
      if (entry.type === "session_info") {
        name = typeof entry.name === "string" ? entry.name.trim() || undefined : undefined;
      }
      if (entry.type !== "message") continue;
      messageCount++;
      const message = (entry.message ?? {}) as Message;
      const time = activityTime(entry, message);
      if (typeof time === "number") lastActivity = Math.max(lastActivity ?? 0, time);
      if (typeof message.role !== "string" || !("content" in message)) continue;
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = textOf(message);
      if (!text) continue;
      allMessages.push(text);
      if (!firstMessage && message.role === "user") firstMessage = text;
    }
    if (!header) return null;

    const headerTime =
      typeof header.timestamp === "string" ? new Date(header.timestamp).getTime() : NaN;
    const modified =
      typeof lastActivity === "number" && lastActivity > 0
        ? new Date(lastActivity)
        : !Number.isNaN(headerTime)
          ? new Date(headerTime)
          : stats.mtime;
    return {
      path,
      id: header.id as string,
      cwd: typeof header.cwd === "string" ? header.cwd : "",
      name,
      parentSessionPath: header.parentSession as string | undefined,
      created: new Date(header.timestamp as string),
      modified,
      messageCount,
      firstMessage: firstMessage || "(no messages)",
      allMessagesText: allMessages.join(" "),
    };
  } catch {
    return null;
  }
}

/** Empty string for old sessions whose header has no cwd. */
export async function readSessionCwd(path: string): Promise<string | null> {
  try {
    for await (const line of readLines(path)) {
      const header = parseLine(line);
      if (!header) continue;
      if (header.type !== "session") return null;
      return typeof header.cwd === "string" ? header.cwd : "";
    }
    return null;
  } catch {
    return null;
  }
}
