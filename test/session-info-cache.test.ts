import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createFileStatCache,
  listAllSessionFiles,
  listSessionFiles,
  readSessionCwd,
  readSessionInfo,
  sessionDirForCwd,
} from "../src/sessions/session-info-cache.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "session-info-cache-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.PI_CODING_AGENT_DIR;
});

const header = (id: string, cwd?: string) =>
  JSON.stringify({ type: "session", id, timestamp: "2026-01-02T03:04:05.000Z", cwd });

const message = (role: string, content: unknown, timestamp?: number) =>
  JSON.stringify({
    type: "message",
    timestamp: "2026-01-02T04:00:00.000Z",
    message: { role, content, timestamp },
  });

function writeSession(path: string, lines: string[]) {
  writeFileSync(path, lines.join("\n") + "\n");
}

describe("readSessionInfo", () => {
  it("returns the same SessionInfo as SessionManager.listAll for each file", async () => {
    const dir = join(root, "sessions");
    mkdirSync(dir);
    writeSession(join(dir, "a.jsonl"), [
      header("a", "/work"),
      "not json",
      message("user", "first question", 1_700_000_000_000),
      message("assistant", [
        { type: "text", text: "answer" },
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "more" },
      ]),
      message("toolResult", [{ type: "text", text: "tool output" }]),
      JSON.stringify({ type: "session_info", name: "  named  " }),
      "",
    ]);
    writeSession(join(dir, "b.jsonl"), [header("b")]);
    writeSession(join(dir, "c.jsonl"), [
      header("c", "/other"),
      JSON.stringify({ type: "session_info", name: "old" }),
      JSON.stringify({ type: "session_info", name: "   " }),
      message("assistant", "no user message yet"),
    ]);
    writeSession(join(dir, "not-a-session.jsonl"), [message("user", "no header")]);

    const byPath = (x: { path: string }, y: { path: string }) => x.path.localeCompare(y.path);
    const expected = (await SessionManager.listAll(dir)).sort(byPath);
    const files = await listSessionFiles(dir);
    const actual = await Promise.all(files.map((f) => readSessionInfo(f, statSync(f))));

    expect(expected).toHaveLength(3);
    expect(actual.filter((s) => s !== null).sort(byPath)).toEqual(expected);
  });
});

describe("readSessionCwd", () => {
  it("reads the cwd from the header, empty for old sessions, null without a header", async () => {
    const withCwd = join(root, "a.jsonl");
    const oldSession = join(root, "b.jsonl");
    const noHeader = join(root, "c.jsonl");
    writeSession(withCwd, [header("a", "/work"), message("user", "hi")]);
    writeSession(oldSession, [header("b")]);
    writeSession(noHeader, [message("user", "hi")]);

    expect(await readSessionCwd(withCwd)).toBe("/work");
    expect(await readSessionCwd(oldSession)).toBe("");
    expect(await readSessionCwd(noHeader)).toBeNull();
  });
});

describe("sessionDirForCwd", () => {
  it("gives the dir that pi uses for new sessions in that cwd", () => {
    process.env.PI_CODING_AGENT_DIR = root;
    const cwd = join(root, "some", "project");
    const sm = SessionManager.create(cwd);
    expect(sessionDirForCwd(join(root, "sessions"), cwd)).toBe(sm.getSessionDir());
  });
});

describe("listAllSessionFiles", () => {
  it("lists the session files of every per-cwd dir, and nothing for a missing root", async () => {
    mkdirSync(join(root, "--a--"));
    mkdirSync(join(root, "--b--"));
    writeSession(join(root, "--a--", "1.jsonl"), [header("1")]);
    writeSession(join(root, "--b--", "2.jsonl"), [header("2")]);
    writeFileSync(join(root, "--b--", "notes.txt"), "");
    writeFileSync(join(root, "top.jsonl"), "");

    expect((await listAllSessionFiles(root)).sort()).toEqual([
      join(root, "--a--", "1.jsonl"),
      join(root, "--b--", "2.jsonl"),
    ]);
    expect(await listAllSessionFiles(join(root, "missing"))).toEqual([]);
  });
});

describe("createFileStatCache", () => {
  it("loads a file again only after its size or mtime changed", async () => {
    const a = join(root, "a.jsonl");
    const b = join(root, "b.jsonl");
    writeSession(a, [header("a", "/work")]);
    writeSession(b, [header("b", "/work")]);
    const loaded: string[] = [];
    const cache = createFileStatCache(async (path) => {
      loaded.push(path);
      return readSessionCwd(path);
    });

    expect(await cache.load([a, b])).toEqual(["/work", "/work"]);
    expect(loaded).toEqual([a, b]);

    expect(await cache.load([a, b])).toEqual(["/work", "/work"]);
    expect(loaded).toEqual([a, b]);

    appendFileSync(a, message("user", "more") + "\n");
    await cache.load([a, b]);
    expect(loaded).toEqual([a, b, a]);
  });

  it("drops files that were deleted or left out of the list", async () => {
    const a = join(root, "a.jsonl");
    const b = join(root, "b.jsonl");
    writeSession(a, [header("a", "/a")]);
    writeSession(b, [header("b", "/b")]);
    let loads = 0;
    const cache = createFileStatCache(async (path) => {
      loads++;
      return readSessionCwd(path);
    });
    await cache.load([a, b]);

    rmSync(b);
    expect(await cache.load([a, b])).toEqual(["/a"]);

    writeSession(b, [header("b", "/b")]);
    utimesSync(b, 1000, 1000);
    await cache.load([a, b]);
    expect(await cache.load([a])).toEqual(["/a"]);

    // Same size and mtime, so only a dropped entry makes the cache read the new content.
    writeSession(b, [header("b", "/c")]);
    utimesSync(b, 1000, 1000);
    expect(await cache.load([a, b])).toEqual(["/a", "/c"]);
    expect(loads).toBe(4);
  });

  it("skips files whose loader gives null", async () => {
    const bad = join(root, "bad.jsonl");
    writeSession(bad, [message("user", "no header")]);
    const cache = createFileStatCache(readSessionCwd);
    expect(await cache.load([bad])).toEqual([]);
  });
});
