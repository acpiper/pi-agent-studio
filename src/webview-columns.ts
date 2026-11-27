import * as vscode from "vscode";
import { CHAT_VIEW_TYPE } from "./chat/chat-panel-state.ts";

const PI_WEBVIEW_VIEW_TYPES = [CHAT_VIEW_TYPE, "pi-agent-studio.settingsPanel"];

function isPiTab(tab: vscode.Tab, viewTypes = PI_WEBVIEW_VIEW_TYPES): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputWebview &&
    viewTypes.some((viewType) => input.viewType.includes(viewType))
  );
}

export function hasPiChatTab(): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => isPiTab(tab, [CHAT_VIEW_TYPE])),
  );
}

export function findPiColumn(): vscode.ViewColumn | undefined {
  for (const group of vscode.window.tabGroups.all) {
    if (group.tabs.some((tab) => isPiTab(tab))) return group.viewColumn;
  }
  return undefined;
}

export function findUnusedColumn(): vscode.ViewColumn | undefined {
  const used = new Set<vscode.ViewColumn>();
  for (const group of vscode.window.tabGroups.all) {
    if (group.viewColumn !== undefined && group.tabs.length > 0) used.add(group.viewColumn);
  }
  for (let column = vscode.ViewColumn.One; column <= vscode.ViewColumn.Nine; column++) {
    if (!used.has(column)) return column;
  }
  return undefined;
}
