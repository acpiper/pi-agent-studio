export interface ClosedChat {
  sessionFile?: string;
  cwd?: string;
}

export type ClosedEntry = { kind: "chat"; chat: ClosedChat } | { kind: "editor"; key: string };

/** Same limit as VS Code's list of recently closed editors. */
const MAX_ENTRIES = 20;

/** The order in which chat panels and editors that VS Code can reopen were closed. */
export interface ClosedEditorStack {
  addChat(chat: ClosedChat): void;
  addEditor(key: string): void;
  /** An editor that is open again was reopened or moved, so it is no longer closed. */
  removeEditor(key: string): void;
  pop(): ClosedEntry | undefined;
}

export function createClosedEditorStack(): ClosedEditorStack {
  let entries: ClosedEntry[] = [];
  const push = (entry: ClosedEntry) => {
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
  };
  const removeEditor = (key: string) => {
    entries = entries.filter((e) => e.kind !== "editor" || e.key !== key);
  };
  return {
    addChat: (chat) => push({ kind: "chat", chat }),
    addEditor(key) {
      removeEditor(key);
      push({ kind: "editor", key });
    },
    removeEditor,
    pop: () => entries.pop(),
  };
}
