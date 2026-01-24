import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { ToolImpl } from ".";
import { ContextItem } from "../..";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { formatGrepSearchResults } from "../../util/grepSearch";
import { prepareQueryForRipgrep } from "../../util/regexValidator";
import { getStringArg } from "../parseArgs";

const DEFAULT_GREP_SEARCH_RESULTS_LIMIT = 100;
const DEFAULT_GREP_SEARCH_CHAR_LIMIT = 7500; // ~1500 tokens

function splitGrepResultsByFile(content: string): ContextItem[] {
  const matches = [...content.matchAll(/^\.\/([^\n]+)$/gm)];
  const contextItems: ContextItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const filepath = match[1];
    const startIndex = match.index!;
    const endIndex =
      i < matches.length - 1 ? matches[i + 1].index! : content.length;

    const fileContent = content
      .substring(startIndex, endIndex)
      .replace(/^\.\/[^\n]+\n/, "")
      .trim();

    if (fileContent) {
      contextItems.push({
        name: `Search results in ${filepath}`,
        description: `Grep search results from ${filepath}`,
        content: fileContent,
        uri: { type: "file", value: filepath },
      });
    }
  }

  return contextItems;
}

function normalizeWorkspaceDir(dir: string): string {
  if (dir.startsWith("file://")) {
    return fileURLToPath(dir);
  }
  return dir;
}

async function runGrepSearchWithSystemRg(
  query: string,
  maxResults: number,
  ide: any,
): Promise<string> {
  const workspaceDirs = await ide.getWorkspaceDirs();

  if (!workspaceDirs || workspaceDirs.length === 0) {
    throw new ContinueError(
      ContinueErrorReason.SearchExecutionFailed,
      "No workspace directories found for grep_search",
    );
  }

  const outputs: string[] = [];

  for (const dir of workspaceDirs) {
    const dirPath = normalizeWorkspaceDir(dir);

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        "rg",
        [
          "-i",
          "--heading",
          "--line-number",
          ...(maxResults ? ["-m", maxResults.toString()] : []),
          query,
          ".",
        ],
        {
          cwd: dirPath,
          env: process.env,
        },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("close", (code) => {
        if (code === 0 || code === 1) {
          resolve(stdout);
        } else {
          reject(
            new Error(`ripgrep exited with code ${code}: ${stderr.trim()}`),
          );
        }
      });

      child.on("error", (err) => {
        reject(
          new Error(`ripgrep execution failed (rg missing?): ${err.message}`),
        );
      });
    });

    if (output.trim()) {
      outputs.push(output);
    }
  }

  return outputs.join("\n");
}

export const grepSearchImpl: ToolImpl = async (args, extras) => {
  const rawQuery = getStringArg(args, "query");
  const { query, warning } = prepareQueryForRipgrep(rawQuery);

  let results: string | null = null;

  // 1️⃣ Try system ripgrep first (no VS Code dependency)
  try {
    results = await runGrepSearchWithSystemRg(
      query,
      DEFAULT_GREP_SEARCH_RESULTS_LIMIT,
      extras.ide,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 2️⃣ If rg missing or failed → fallback to IDE search
    if (
      message.includes("rg missing") ||
      message.includes("ENOENT") ||
      message.includes("ripgrep execution failed")
    ) {
      try {
        results = await extras.ide.getSearchResults(
          query,
          DEFAULT_GREP_SEARCH_RESULTS_LIMIT,
        );
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);

        throw new ContinueError(
          ContinueErrorReason.SearchExecutionFailed,
          `grep_search failed. System rg unavailable and IDE search failed: ${fallbackMessage}`,
        );
      }
    } else if (
      message.includes("invalid regex") ||
      message.includes("code 2")
    ) {
      return [
        {
          name: "Search error",
          description: "Invalid search pattern",
          content: `Invalid regex.\n\nOriginal: ${rawQuery}\nProcessed: ${query}\n\n${message}`,
        },
      ];
    } else {
      throw new ContinueError(
        ContinueErrorReason.SearchExecutionFailed,
        message,
      );
    }
  }

  if (!results) {
    return [
      {
        name: "Search results",
        description: "Results from grep search",
        content: "The search returned no results.",
      },
    ];
  }

  const { formatted, numResults, truncated } = formatGrepSearchResults(
    results,
    DEFAULT_GREP_SEARCH_CHAR_LIMIT,
  );

  if (numResults === 0) {
    return [
      {
        name: "Search results",
        description: "Results from grep search",
        content: "The search returned no results.",
      },
    ];
  }

  const truncationReasons: string[] = [];
  if (numResults === DEFAULT_GREP_SEARCH_RESULTS_LIMIT) {
    truncationReasons.push(
      `the number of results exceeded ${DEFAULT_GREP_SEARCH_RESULTS_LIMIT}`,
    );
  }
  if (truncated) {
    truncationReasons.push(
      `the number of characters exceeded ${DEFAULT_GREP_SEARCH_CHAR_LIMIT}`,
    );
  }

  const splitByFile = Boolean(args?.splitByFile);
  const contextItems: ContextItem[] = splitByFile
    ? splitGrepResultsByFile(formatted)
    : [
        {
          name: "Search results",
          description: "Results from grep search",
          content: formatted,
        },
      ];

  if (truncationReasons.length > 0) {
    contextItems.push({
      name: "Truncation warning",
      description: "",
      content: `The above search results were truncated because ${truncationReasons.join(
        " and ",
      )}.`,
    });
  }

  if (warning) {
    contextItems.push({
      name: "Query warning",
      description: "",
      content: warning,
    });
  }

  return contextItems;
};
