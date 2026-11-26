// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  getSelectionOffsets,
  renderSegments,
  segmentsFromText,
} from "../pi-chat/src/input-tokens.ts";

// globals.ts looks up chat DOM nodes at import time.
vi.mock("../pi-chat/src/globals", () => ({ shortenWorkspacePath: (p: string) => p }));

function select(from: [Node, number], to: [Node, number]): void {
  const range = document.createRange();
  range.setStart(from[0], from[1]);
  range.setEnd(to[0], to[1]);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("getSelectionOffsets", () => {
  it("returns start and end of a non-collapsed selection", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.textContent = "hello world";
    const text = root.firstChild!;
    select([text, 6], [text, 11]);
    expect(getSelectionOffsets(root)).toEqual({ start: 6, end: 11 });
  });

  it("returns equal start and end for a collapsed caret", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.textContent = "hello";
    const text = root.firstChild!;
    select([text, 2], [text, 2]);
    expect(getSelectionOffsets(root)).toEqual({ start: 2, end: 2 });
  });

  it("counts file tokens and line breaks in serialized offsets", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    renderSegments(root, segmentsFromText("see @src/a.ts\nnext line"));
    select([root, 0], [root, root.childNodes.length]);
    const serialized = "see @src/a.ts\nnext line";
    expect(getSelectionOffsets(root)).toEqual({ start: 0, end: serialized.length });
  });
});
