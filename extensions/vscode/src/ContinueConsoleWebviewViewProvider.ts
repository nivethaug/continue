import { LLMInteractionItem } from "core";
import { EXTENSION_NAME } from "core/control-plane/env";
import { LLMLogger } from "core/llm/logger";
import * as vscode from "vscode";

import { getNonce } from "./util/vscode";

interface FromConsoleView {
  type: "start" | "stop";
  uuid: string;
}

const MAX_INTERACTIONS = 50;

export class ContinueConsoleWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "continue.continueConsoleView";

  private _webview?: vscode.Webview;
  private _webviewView?: vscode.WebviewView;
  private _currentUuid?: string;
  private _currentInteractions = new Map<string, LLMInteractionItem[]>();
  private _completedInteractions: LLMInteractionItem[][] = [];
  private _saveLog: boolean;

  constructor(
    private readonly windowId: string,
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly llmLogger: LLMLogger,
  ) {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    this._saveLog = config.get<boolean>("enableConsole") ?? false;

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${EXTENSION_NAME}.enableConsole`)) {
        const cfg = vscode.workspace.getConfiguration(EXTENSION_NAME);
        this._saveLog = cfg.get<boolean>("enableConsole") ?? false;
        if (!this._saveLog) {
          this.clearLog();
        }
      }
    });

    llmLogger.onLogItem((item) => this.addItem(item));
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._webviewView = webviewView;
    this._webview = webviewView.webview;

    webviewView.onDidDispose(() => {
      this._webview = undefined;
      this._webviewView = undefined;
      this._currentUuid = undefined;
    });

    webviewView.webview.html = this.getSidebarContent(
      this.extensionContext,
      webviewView,
    );

    this._webview.onDidReceiveMessage((message: FromConsoleView) => {
      if (message.type === "start") {
        this._currentUuid = message.uuid;
        void this._webview?.postMessage({
          type: "init",
          uuid: this._currentUuid,
          items: this.getAllItems(),
        });
      }
    });
  }

  private addItem(item: LLMInteractionItem) {
    if (!this._saveLog) return;

    let items = this._currentInteractions.get(item.interactionId);
    if (!items) {
      items = [];
      this._currentInteractions.set(item.interactionId, items);
    }

    items.push(item);

    if (
      item.kind === "success" ||
      item.kind === "cancel" ||
      item.kind === "error"
    ) {
      this._completedInteractions.push(items);
      this._currentInteractions.delete(item.interactionId);
    }

    if (this._currentUuid) {
      void this._webview?.postMessage({
        type: "item",
        uuid: this._currentUuid,
        item,
      });
    }

    while (
      this._completedInteractions.length > 0 &&
      this._completedInteractions.length + this._currentInteractions.size >
        MAX_INTERACTIONS
    ) {
      const removed = this._completedInteractions.shift();
      void this._webview?.postMessage({
        type: "remove",
        uuid: this._currentUuid,
        interactionId: removed![0].interactionId,
      });
    }
  }

  private getAllItems() {
    const items = this._completedInteractions.flat();
    for (const interactionItems of this._currentInteractions.values()) {
      items.push(...interactionItems);
    }
    return items;
  }

  clearLog() {
    this._completedInteractions = [];
    this._currentInteractions.clear();

    if (this._currentUuid) {
      void this._webview?.postMessage({
        type: "clear",
        uuid: this._currentUuid,
      });
    }
  }

  private getSidebarContent(
    context: vscode.ExtensionContext | undefined,
    panel: vscode.WebviewPanel | vscode.WebviewView,
  ): string {
    // ✅ ALWAYS use the real extension root
    const extensionUri = this.extensionContext.extensionUri;

    // ✅ Console GUI lives in out/gui
    const guiRoot = vscode.Uri.joinPath(extensionUri, "out", "gui");

    const inDevelopmentMode =
      context?.extensionMode === vscode.ExtensionMode.Development;

    let scriptUri: string;
    let styleMainUri: string;

    if (inDevelopmentMode) {
      scriptUri = "http://localhost:5173/src/console.tsx";
      styleMainUri = "http://localhost:5173/src/indexConsole.css";
    } else {
      scriptUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(guiRoot, "assets", "indexConsole.js"))
        .toString();

      styleMainUri = panel.webview
        .asWebviewUri(
          vscode.Uri.joinPath(guiRoot, "assets", "indexConsole.css"),
        )
        .toString();
    }

    // ✅ CRITICAL: only allow out/gui
    panel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [guiRoot],
    };

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>const vscode = acquireVsCodeApi();</script>
  <link href="${styleMainUri}" rel="stylesheet">
  <title>DreamCode Console</title>
</head>
<body>
  <div id="root"></div>

  ${
    inDevelopmentMode
      ? `<script type="module">
    import RefreshRuntime from "http://localhost:5173/@react-refresh"
    RefreshRuntime.injectIntoGlobalHook(window)
    window.$RefreshReg$ = () => {}
    window.$RefreshSig$ = () => (type) => type
    window.__vite_plugin_react_preamble_installed__ = true
    </script>`
      : ""
  }

  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
