import { IDE } from "..";

import {
  joinEncodedUriPathSegmentToUri,
  joinPathsToUri,
  pathToUriPathSegment,
} from "./uri";

/*
  This function takes a relative (to workspace) filepath
  And checks each workspace for if it exists or not
  Only returns fully resolved URI if it exists
*/
export async function resolveRelativePathInDir(
  path: string,
  ide: IDE,
  dirUriCandidates?: string[],
): Promise<string | undefined> {
  // Handle absolute paths directly - bypass relative path resolution
  const os = require("os");
  const pathModule = require("path");
  const { pathToFileURL } = require("url");

  // Enhanced Windows absolute path detection
  // Matches: /C:/..., /D:/..., C:\..., D:\..., C:/..., D:/...
  const windowsAbsolutePathRegex = /^\/?[A-Za-z]:[/\\]/;
  const isWindowsAbsolute =
    os.platform() === "win32" &&
    (pathModule.isAbsolute(path) || windowsAbsolutePathRegex.test(path));
  const isUnixAbsolute =
    os.platform() !== "win32" && pathModule.isAbsolute(path);

  if (isWindowsAbsolute || isUnixAbsolute) {
    let absolutePath = path;

    // Remove leading / from POSIX-style Windows paths (/C:/... -> C:/...)
    if (os.platform() === "win32" && absolutePath.startsWith("/")) {
      absolutePath = absolutePath.slice(1);
    }

    const uri = pathToFileURL(absolutePath).href;

    // Verify the file exists before returning
    if (await ide.fileExists(uri)) {
      return uri;
    }
    return undefined;
  }

  const dirs = dirUriCandidates ?? (await ide.getWorkspaceDirs());
  for (const dirUri of dirs) {
    const fullUri = joinPathsToUri(dirUri, path);
    if (await ide.fileExists(fullUri)) {
      return fullUri;
    }
  }

  return undefined;
}

/*
  Same as above but in this case the relative path does not need to exist (e.g. file to be created, etc)
  Checks closes match with the dirs, path segment by segment
  and based on which workspace has the closest matching path, returns resolved URI
  If no meaninful path match just concatenates to first dir's uri
*/
export async function inferResolvedUriFromRelativePath(
  _relativePath: string,
  ide: IDE,
  dirCandidates?: string[],
): Promise<string> {
  const relativePath = _relativePath.trim().replaceAll("\\", "/");

  // Handle absolute paths directly - bypass relative path inference
  const os = require("os");
  const path = require("path");
  const { pathToFileURL } = require("url");

  // Enhanced Windows absolute path detection
  // Matches: /C:/..., /D:/..., C:\..., D:\..., C:/..., D:/...
  const windowsAbsolutePathRegex = /^\/?[A-Za-z]:[/\\]/;
  const isWindowsAbsolute =
    os.platform() === "win32" &&
    (path.isAbsolute(_relativePath) ||
      windowsAbsolutePathRegex.test(_relativePath));
  const isUnixAbsolute =
    os.platform() !== "win32" && path.isAbsolute(_relativePath);

  if (isWindowsAbsolute || isUnixAbsolute) {
    let absolutePath = _relativePath;

    // Remove leading / from POSIX-style Windows paths (/C:/... -> C:/...)
    if (os.platform() === "win32" && absolutePath.startsWith("/")) {
      absolutePath = absolutePath.slice(1);
    }

    return pathToFileURL(absolutePath).href;
  }

  const dirs = dirCandidates ?? (await ide.getWorkspaceDirs());

  if (dirs.length === 0) {
    throw new Error("inferResolvedUriFromRelativePath: no dirs provided");
  }

  const segments = pathToUriPathSegment(relativePath).split("/");
  // Generate all possible suffixes from shortest to longest
  const suffixes: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    suffixes.push(segments.slice(i).join("/"));
  }

  // For each suffix, try to find a unique matching dir/file
  for (const suffix of suffixes) {
    const uris = dirs.map((dir) => ({
      dir,
      partialUri: joinEncodedUriPathSegmentToUri(dir, suffix),
    }));
    const promises = uris.map(async ({ partialUri, dir }) => {
      const exists = await ide.fileExists(partialUri);
      return {
        dir,
        partialUri,
        exists,
      };
    });
    const existenceChecks = await Promise.all(promises);

    const existingUris = existenceChecks.filter(({ exists }) => exists);

    // If exactly one directory matches, use it
    if (existingUris.length === 1) {
      return joinEncodedUriPathSegmentToUri(
        existingUris[0].dir,
        segments.join("/"),
      );
    }
  }

  // Sometimes the model will decide to only output the base name or small number of path parts
  // in which case we shouldn't create a new file if it matches the current file
  const activeFile = await ide.getCurrentFile();
  if (activeFile && activeFile.path.endsWith(relativePath)) {
    return activeFile.path;
  }

  // If no unique match found, use the first directory
  return joinPathsToUri(dirs[0], relativePath);
}
