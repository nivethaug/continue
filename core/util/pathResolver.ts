import { fileURLToPath, pathToFileURL } from "node:url";
import * as path from "path";
import untildify from "untildify";
import { IDE } from "..";
import { resolveRelativePathInDir } from "./ideUtils";
import { findUriInDirs } from "./uri";

export interface ResolvedPath {
  uri: string;
  displayPath: string;
  isAbsolute: boolean;
  isWithinWorkspace: boolean;
}

/**
 * Checks if a URI is within any of the workspace directories
 * Also verifies the file actually exists, matching the behavior of resolveRelativePathInDir
 */
async function isUriWithinWorkspace(ide: IDE, uri: string): Promise<boolean> {
  const workspaceDirs = await ide.getWorkspaceDirs();
  const { foundInDir } = findUriInDirs(uri, workspaceDirs);

  // Check both: within workspace path AND file exists
  if (foundInDir !== null) {
    return await ide.fileExists(uri);
  }

  return false;
}

export async function resolveInputPath(
  ide: IDE,
  inputPath: string,
): Promise<ResolvedPath | null> {
  const trimmedPath = inputPath.trim();

  // Handle file:// URIs
  if (trimmedPath.startsWith("file://")) {
    const displayPath = fileURLToPath(trimmedPath);
    const isWithinWorkspace = await isUriWithinWorkspace(ide, trimmedPath);
    return {
      uri: trimmedPath,
      displayPath,
      isAbsolute: true,
      isWithinWorkspace,
    };
  }

  // Expand tilde paths (handles ~/ and ~username/)
  const expandedPath = untildify(trimmedPath);

  // Handle Windows paths with leading slash (POSIX-style: /C:/... -> C:/...)
  let normalizedPath = expandedPath;
  const os = require("os");
  if (os.platform() === "win32" && normalizedPath.startsWith("/")) {
    // Check if this is a Windows absolute path with leading slash
    // Pattern: /C:/... or /D:/... where C/D is a drive letter
    const windowsAbsolutePathRegex = /^\/[A-Za-z]:/;
    if (windowsAbsolutePathRegex.test(normalizedPath)) {
      normalizedPath = normalizedPath.slice(1); // Remove leading /
    }
  }

  // Check if it's an absolute path (including Windows paths)
  const isAbsolute =
    path.isAbsolute(normalizedPath) ||
    // Windows network paths
    normalizedPath.startsWith("\\\\") ||
    // Windows drive letters
    /^[a-zA-Z]:/.test(normalizedPath);

  if (isAbsolute) {
    // Convert to file:// URI format
    const uri = pathToFileURL(normalizedPath).href;

    // For absolute paths, check if file exists directly
    // Don't require workspace membership for absolute paths
    const fileExists = await ide.fileExists(uri);
    if (fileExists) {
      const isWithinWorkspace = await isUriWithinWorkspace(ide, uri);
      return {
        uri,
        displayPath: normalizedPath,
        isAbsolute: true,
        isWithinWorkspace,
      };
    }

    // File doesn't exist, but it's a valid absolute path
    // Return it anyway (for files to be created, etc.)
    const isWithinWorkspace = await isUriWithinWorkspace(ide, uri);
    return {
      uri,
      displayPath: normalizedPath,
      isAbsolute: true,
      isWithinWorkspace,
    };
  }

  // Handle relative paths...
  const workspaceUri = await resolveRelativePathInDir(expandedPath, ide);
  if (workspaceUri) {
    return {
      uri: workspaceUri,
      displayPath: expandedPath,
      isAbsolute: false,
      isWithinWorkspace: true,
    };
  }

  return null;
}
