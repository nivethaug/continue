import { IDE, Position } from "../..";
import { AutocompleteCodeSnippet } from "../../autocomplete/snippets/types";
import { GetLspDefinitionsFunction } from "../../autocomplete/types";
import { ConfigHandler } from "../../config/ConfigHandler";
import { DataLogger } from "../../data/log";
import { NextEditProvider } from "../NextEditProvider";
import { RecentlyEditedRange } from "../types";
import { getAutocompleteContext } from "./autocompleteContextFetching";
import { createDiff, DiffFormatType } from "./diffFormatting";
import {
  getPrevEditsDescending,
  prevEdit,
  prevEditLruCache,
  setPrevEdit,
} from "./prevEditLruCache";

const randomNumberBetween = (min: number, max: number) => {
  min = Math.ceil(min); // Ensure min is an integer
  max = Math.floor(max); // Ensure max is an integer
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

interface filenameAndDiff {
  filename: string;
  diff: string;
}
interface ProcessNextEditDataParams {
  filePath: string;
  beforeContent: string;
  afterContent: string;
  cursorPosBeforeEdit: Position;
  cursorPosAfterPrevEdit: Position;
  ide: IDE;
  configHandler: ConfigHandler;
  getDefinitionsFromLsp: GetLspDefinitionsFunction;
  recentlyEditedRanges: RecentlyEditedRange[];
  recentlyVisitedRanges: AutocompleteCodeSnippet[];
  workspaceDir: string;
  modelNameOrInstance?: string | undefined;
}
export const processNextEditData = async ({
  filePath,
  beforeContent,
  afterContent,
  cursorPosBeforeEdit,
  cursorPosAfterPrevEdit,
  ide,
  configHandler,
  getDefinitionsFromLsp,
  recentlyEditedRanges,
  recentlyVisitedRanges,
  workspaceDir,
  modelNameOrInstance,
}: ProcessNextEditDataParams) => {
  console.log("[processNextEditData] Loading config...");
  const { config } = await configHandler.loadConfig();

  const autocompleteModel = config?.selectedModelByRole.autocomplete;

  // OPTIMAL: Use configured autocomplete if available, otherwise skip
  // This allows GLM and any other LLM to work without requiring a specific autocomplete model
  let autocompleteContext = "";
  const hasAutocompleteModel = !!autocompleteModel;
  const maxPromptTokens = randomNumberBetween(500, 12000);

  if (hasAutocompleteModel) {
    try {
      // Use configured autocomplete model
      const modelName = autocompleteModel.model;

      autocompleteContext = await getAutocompleteContext(
        filePath,
        cursorPosBeforeEdit,
        ide,
        configHandler,
        getDefinitionsFromLsp,
        recentlyEditedRanges,
        recentlyVisitedRanges,
        maxPromptTokens,
        beforeContent,
        modelName,
      );
    } catch (error) {}
  } else {
    autocompleteContext = "";
  }

  NextEditProvider.getInstance().addAutocompleteContext(autocompleteContext);
  console.log(
    "[processNextEditData] Autocomplete context added, length:",
    autocompleteContext.length,
  );

  let filenamesAndDiffs: filenameAndDiff[] = [];

  // ====================================================================
  // DEDUPLICATION FIX: Check for in-progress edits BEFORE creating diff
  // ====================================================================

  // Get current history
  const timestamp = Date.now();
  let prevEdits: prevEdit[] = getPrevEditsDescending(); // edits from most to least recent

  // Check if this exact file/workspace combo is currently being processed
  // This prevents multiple rapid calls for the same file/URI combo from creating duplicates
  const editKey = `${filePath}::${workspaceDir}`;
  const alreadyProcessing = prevEdits.some(
    (edit) =>
      edit.fileUri === filePath &&
      edit.workspaceUri === workspaceDir &&
      timestamp - edit.timestamp < 5000, // Within last 5 seconds
  );

  if (alreadyProcessing) {
    console.log("[processNextEditData] No duplicate found, proceeding...");
    return; // Don't process - the most recent call will handle it
  }

  if (prevEdits.length > 0) {
    // if last edit was 10+ minutes ago or workspace changed, forget previous edits
    if (
      timestamp - prevEdits[0].timestamp >= 1000 * 60 * 10 ||
      workspaceDir !== prevEdits[0].workspaceUri
    ) {
      prevEditLruCache.clear();
      prevEdits = [];
    }

    // extract filenames and diffs for logging
    filenamesAndDiffs = prevEdits.map(
      (edit) =>
        ({
          // filename relative to workspace dir
          filename: edit.fileUri
            .replace(edit.workspaceUri, "")
            .replace(/^[/\\]/, ""),

          // diff without first 4 lines (the file header)
          diff: edit.unidiff.split("\n").slice(4).join("\n"),
        }) as filenameAndDiff,
    );
  }

  if (filenamesAndDiffs.length > 0) {
    // if there are previous edits, log
    void DataLogger.getInstance().logDevData({
      name: "nextEditWithHistory",
      data: {
        previousEdits: filenamesAndDiffs,
        fileURI: filePath,
        workspaceDirURI: workspaceDir,
        beforeContent,
        afterContent,
        beforeCursorPos: cursorPosBeforeEdit,
        afterCursorPos: cursorPosAfterPrevEdit,
        context: autocompleteContext || "<NO AUTOCOMPLETE CONTEXT>",
        modelProvider: hasAutocompleteModel
          ? autocompleteModel.providerName
          : "",
        modelName: autocompleteModel?.model || "",
        modelTitle: autocompleteModel?.title || "",
      },
    });
  }

  // add current edit to history
  const thisEdit: prevEdit = {
    unidiff: createDiff({
      beforeContent: beforeContent,
      afterContent: afterContent,
      filePath: filePath,
      diffType: DiffFormatType.Unified,
      contextLines: 25, // storing many context lines for downstream trimming
      workspaceDir: workspaceDir,
    }),
    fileUri: filePath,
    workspaceUri: workspaceDir,
    timestamp: timestamp,
  };

  setPrevEdit(thisEdit);
};
