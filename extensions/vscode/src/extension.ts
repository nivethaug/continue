/**
 * This is the entry point for the extension.
 */

import { setupCa } from "core/util/ca";
import { extractMinimalStackTraceInfo } from "core/util/extractMinimalStackTraceInfo";
import { Telemetry } from "core/util/posthog";
import * as vscode from "vscode";

import { SentryLogger } from "core/util/sentry/SentryLogger";
import { getExtensionVersion } from "./util/util";
export { default as buildTimestamp } from "./.buildTimestamp";

async function dynamicImportAndActivate(context: vscode.ExtensionContext) {
  console.log("[DreamCode] dynamic activation start");

  await setupCa();
  console.log("[DreamCode] setupCa done");

  const mod = await import("./activation/activate");
  console.log("[DreamCode] activate module loaded", mod);

  return await mod.activateExtension(context);
}

export function activate(context: vscode.ExtensionContext) {
  // ✅ fire-and-forget async activation
  dynamicImportAndActivate(context).catch((e) => {
    console.log("Error activating extension: ", e);
    Telemetry.capture(
      "vscode_extension_activation_error",
      {
        stack: extractMinimalStackTraceInfo(e.stack),
        message: e.message,
      },
      false,
      true,
    );
    vscode.window
      .showWarningMessage(
        "Error activating the Continue extension.",
        "View Logs",
        "Retry",
      )
      .then(async (selection) => {
        if (selection === "View Logs") {
          const commands = await vscode.commands.getCommands(true);
          if (commands.includes("continue.viewLogs")) {
            vscode.commands.executeCommand("continue.viewLogs");
          } else {
            vscode.commands.executeCommand("workbench.action.toggleDevTools");
          }
        } else if (selection === "Retry") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  });
}

export function deactivate() {
  void Telemetry.capture(
    "deactivate",
    {
      extensionVersion: getExtensionVersion(),
    },
    true,
  );

  Telemetry.shutdownPosthogClient();
  SentryLogger.shutdownSentryClient();
}
