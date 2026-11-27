export const CHAT_VIEW_TYPE = "pi-agent-studio.chat";

/** Webview state that VS Code persists so a reloaded panel can be revived. */
export interface ChatPanelState {
  panelId: string;
  sessionFile?: string;
  cwd?: string;
}

export function isChatPanelState(value: unknown): value is ChatPanelState {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.panelId === "string" &&
    (s.sessionFile === undefined || typeof s.sessionFile === "string") &&
    (s.cwd === undefined || typeof s.cwd === "string")
  );
}
