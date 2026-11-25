import { access } from "node:fs/promises";
import * as vscode from "vscode";
import { createClosedEditorStack, type ClosedChat } from "./closed-editor-stack.ts";

export const closedEditors = createClosedEditorStack();

function reopenableKey(input: unknown): string | undefined {
  if (
    input instanceof vscode.TabInputText ||
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputNotebook
  ) {
    return input.uri.toString();
  }
  if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
    return `${input.original.toString()}|${input.modified.toString()}`;
  }
  return undefined;
}

function isOpen(key: string): boolean {
  return vscode.window.tabGroups.all.some((g) =>
    g.tabs.some((t) => reopenableKey(t.input) === key),
  );
}

async function existingFile(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    await access(path);
    return path;
  } catch {
    return undefined;
  }
}

export function registerReopenClosedEditor(
  reopenChat: (chat: ClosedChat) => Promise<unknown>,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.closed) {
        const key = reopenableKey(tab.input);
        // VS Code does not reopen a preview tab that the next preview replaced, or a moved tab.
        if (key && !tab.isPreview && !isOpen(key)) closedEditors.addEditor(key);
      }
      for (const tab of e.opened) {
        const key = reopenableKey(tab.input);
        if (key) closedEditors.removeEditor(key);
      }
    }),
    vscode.commands.registerCommand("pi-agent-studio.reopenClosedEditor", async () => {
      const entry = closedEditors.pop();
      if (entry?.kind === "chat") {
        // pi writes the session file at the first message, so an unused chat has no file.
        const sessionFile = await existingFile(entry.chat.sessionFile);
        await reopenChat({ ...entry.chat, sessionFile });
        return;
      }
      await vscode.commands.executeCommand("workbench.action.reopenClosedEditor");
    }),
  );
}
