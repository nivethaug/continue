import * as vscode from "vscode";

import { getTheme } from "./util/getTheme";
import { getExtensionVersion, getvsCodeUriScheme } from "./util/util";
import { getNonce, getUniqueId } from "./util/vscode";
import { VsCodeWebviewProtocol } from "./webviewProtocol";

import type { FileEdit } from "core";

export class ContinueGUIWebviewViewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "continue.continueGUIView";
  public webviewProtocol: VsCodeWebviewProtocol;

  private _webview?: vscode.Webview;
  private _webviewView?: vscode.WebviewView;

  constructor(
    private readonly windowId: string,
    private readonly extensionContext: vscode.ExtensionContext,
  ) {
    this.webviewProtocol = new VsCodeWebviewProtocol();
  }

  get isReady(): boolean {
    return !!this._webview;
  }

  get isVisible() {
    return this._webviewView?.visible;
  }

  get webview() {
    return this._webview;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._webviewView = webviewView;
    this._webview = webviewView.webview;
    this.webviewProtocol.webview = webviewView.webview;

    webviewView.webview.html = this.getSidebarContent(
      this.extensionContext,
      webviewView,
    );
  }
  public resetWebviewProtocolWebview(): void {
    if (!this._webview) {
      console.warn("No webview found during reset");
      return;
    }
    this.webviewProtocol.webview = this._webview;
  }

  sendMainUserInput(input: string) {
    this._webview?.postMessage({
      type: "userInput",
      input,
    });
  }

  getSidebarContent(
    context: vscode.ExtensionContext | undefined,
    panel: vscode.WebviewPanel | vscode.WebviewView,
    page?: string,
    edits?: FileEdit[],
    isFullScreen = false,
  ): string {
    // ✅ ALWAYS use context.extensionUri
    const extensionUri = this.extensionContext.extensionUri;

    // ✅ GUI ROOT = out/gui
    const guiRoot = vscode.Uri.joinPath(extensionUri, "out", "gui");

    const vscMediaUrl = panel.webview.asWebviewUri(guiRoot).toString();

    const inDevelopmentMode =
      context?.extensionMode === vscode.ExtensionMode.Development;

    let scriptUri: string;
    let styleMainUri: string;

    if (inDevelopmentMode) {
      scriptUri = "http://localhost:5173/src/main.tsx";
      styleMainUri = "http://localhost:5173/src/index.css";
    } else {
      scriptUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(guiRoot, "assets", "index.js"))
        .toString();

      styleMainUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(guiRoot, "assets", "index.css"))
        .toString();
    }

    // ✅ CRITICAL: only allow out/gui
    panel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [guiRoot],
    };

    const nonce = getNonce();
    const currentTheme = getTheme();

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("workbench.colorTheme") ||
        e.affectsConfiguration("window.autoDetectColorScheme") ||
        e.affectsConfiguration("window.autoDetectHighContrast") ||
        e.affectsConfiguration("workbench.preferredDarkColorTheme") ||
        e.affectsConfiguration("workbench.preferredLightColorTheme") ||
        e.affectsConfiguration("workbench.preferredHighContrastColorTheme") ||
        e.affectsConfiguration("workbench.preferredHighContrastLightColorTheme")
      ) {
        void this.webviewProtocol?.request("setTheme", {
          theme: getTheme(),
        });
      }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>const vscode = acquireVsCodeApi();</script>
  <link href="${styleMainUri}" rel="stylesheet">
  <title>Continue</title>
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

  <script>localStorage.setItem("ide", "vscode")</script>
  <script>localStorage.setItem("vsCodeUriScheme", "${getvsCodeUriScheme()}")</script>
  <script>localStorage.setItem("extensionVersion", "${getExtensionVersion()}")</script>

  <script>window.windowId = "${this.windowId}"</script>
  <script>window.vscMachineId = "${getUniqueId()}"</script>
  <script>window.vscMediaUrl = "${vscMediaUrl}"</script>
  <script>window.ide = "vscode"</script>
  <script>window.fullColorTheme = ${JSON.stringify(currentTheme)}</script>
  <script>window.colorThemeName = "dark-plus"</script>
  <script>window.workspacePaths = ${JSON.stringify(
    vscode.workspace.workspaceFolders?.map((f) => f.uri.toString()) || [],
  )}</script>
  <script>window.isFullScreen = ${isFullScreen}</script>

  ${edits ? `<script>window.edits = ${JSON.stringify(edits)}</script>` : ""}
  ${page ? `<script>window.location.pathname = "${page}"</script>` : ""}
</body>
</html>`;
  }
}
