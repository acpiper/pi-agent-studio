import { describe, expect, it } from "vitest";
import { isChatPanelState } from "../src/chat/chat-panel-state.ts";

describe("isChatPanelState", () => {
  it("accepts a saved state with only a panel id", () => {
    expect(isChatPanelState({ panelId: "p" })).toBe(true);
  });

  it("accepts a saved state with a session file and cwd", () => {
    expect(isChatPanelState({ panelId: "p", sessionFile: "/s/a.jsonl", cwd: "/w" })).toBe(true);
  });

  it("rejects a missing state from a panel that never saved one", () => {
    expect(isChatPanelState(undefined)).toBe(false);
    expect(isChatPanelState(null)).toBe(false);
  });

  it("rejects a state without a string panel id", () => {
    expect(isChatPanelState({ sessionFile: "/s/a.jsonl" })).toBe(false);
    expect(isChatPanelState({ panelId: 1 })).toBe(false);
  });

  it("rejects a state with a non-string session file or cwd", () => {
    expect(isChatPanelState({ panelId: "p", sessionFile: 1 })).toBe(false);
    expect(isChatPanelState({ panelId: "p", cwd: null })).toBe(false);
  });
});
