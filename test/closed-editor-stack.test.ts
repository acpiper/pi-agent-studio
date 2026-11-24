import { describe, expect, it } from "vitest";
import { createClosedEditorStack } from "../src/closed-editor-stack.ts";

describe("createClosedEditorStack", () => {
  it("returns closed chats and editors in reverse closing order", () => {
    const stack = createClosedEditorStack();
    stack.addChat({ sessionFile: "/s/a.jsonl" });
    stack.addEditor("file:///x.ts");
    expect(stack.pop()).toEqual({ kind: "editor", key: "file:///x.ts" });
    expect(stack.pop()).toEqual({ kind: "chat", chat: { sessionFile: "/s/a.jsonl" } });
    expect(stack.pop()).toBeUndefined();
  });

  it("drops an editor that opens again, so a chat closed before it comes next", () => {
    const stack = createClosedEditorStack();
    stack.addChat({ sessionFile: "/s/a.jsonl" });
    stack.addEditor("file:///x.ts");
    stack.removeEditor("file:///x.ts");
    expect(stack.pop()).toEqual({ kind: "chat", chat: { sessionFile: "/s/a.jsonl" } });
  });

  it("keeps one entry per editor, at the position of its last close", () => {
    const stack = createClosedEditorStack();
    stack.addEditor("file:///x.ts");
    stack.addChat({});
    stack.addEditor("file:///x.ts");
    expect(stack.pop()).toEqual({ kind: "editor", key: "file:///x.ts" });
    expect(stack.pop()).toEqual({ kind: "chat", chat: {} });
    expect(stack.pop()).toBeUndefined();
  });

  it("keeps only the 20 most recent entries", () => {
    const stack = createClosedEditorStack();
    for (let i = 0; i < 21; i++) stack.addEditor(`file:///${i}`);
    let count = 0;
    let last;
    for (let e = stack.pop(); e; e = stack.pop()) {
      count++;
      last = e;
    }
    expect(count).toBe(20);
    expect(last).toEqual({ kind: "editor", key: "file:///1" });
  });
});
