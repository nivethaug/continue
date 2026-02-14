import path from "path";

import { distance } from "fastest-levenshtein";
import Parser from "web-tree-sitter";

import { DiffLine } from "../..";
import { LANGUAGES } from "../../autocomplete/constants/AutocompleteLanguageInfo";
import { myersDiff } from "../../diff/myers";
import { getParserForFile } from "../../util/treeSitter";

import { findInAst } from "./findInAst";

type AstReplacements = Array<{
  nodeToReplace: Parser.SyntaxNode;
  replacementNodes: Parser.SyntaxNode[];
}>;

const LAZY_COMMENT_REGEX = /\.{3}\s*(.+?)\s*\.{3}/;
export function isLazyText(text: string): boolean {
  return LAZY_COMMENT_REGEX.test(text);
}

/**
 * Syntax-level AST validation (language-agnostic)
 */
function astHasErrors(parser: Parser, code: string): boolean {
  const tree = parser.parse(code);
  let hasError = false;

  function walk(node: Parser.SyntaxNode) {
    if (node.type === "ERROR") {
      hasError = true;
      return;
    }
    for (const child of node.children) {
      walk(child);
      if (hasError) return;
    }
  }

  walk(tree.rootNode);
  return hasError;
}

function reconstructNewFile(
  oldFile: string,
  newFile: string,
  lazyBlockReplacements: AstReplacements,
): string {
  lazyBlockReplacements
    .sort((a, b) => a.nodeToReplace.startIndex - b.nodeToReplace.startIndex)
    .reverse();

  const oldFileLines = oldFile.split("\n");
  const newFileChars = newFile.split("");

  for (const {
    nodeToReplace: lazyBlockNode,
    replacementNodes,
  } of lazyBlockReplacements) {
    let replacementText = "";

    if (replacementNodes.length > 0) {
      const startPosition = replacementNodes[0].startPosition;
      const endPosition =
        replacementNodes[replacementNodes.length - 1].endPosition;

      const replacementLines = oldFileLines.slice(
        startPosition.row,
        endPosition.row + 1,
      );

      replacementLines[0] = replacementLines[0].slice(startPosition.column);
      replacementLines[replacementLines.length - 1] = replacementLines[
        replacementLines.length - 1
      ].slice(0, endPosition.column);

      replacementText = replacementLines.join("\n");

      newFileChars.splice(
        lazyBlockNode.startIndex,
        lazyBlockNode.text.length,
        replacementText,
      );
    } else {
      const lazyBlockStart = lazyBlockNode.startIndex;
      const lazyBlockEnd = lazyBlockNode.endIndex - 1;

      let startIndex = lazyBlockStart;
      let newLinesFound = 0;
      while (
        startIndex > 0 &&
        newFileChars[startIndex - 1]?.trim() === "" &&
        newLinesFound < 2
      ) {
        startIndex--;
        if (newFileChars[startIndex - 1] === "\n") {
          newLinesFound++;
        }
      }

      const charAfter = newFileChars[lazyBlockEnd + 1];
      const secondCharAfter = newFileChars[lazyBlockEnd + 2];
      let endIndex = lazyBlockEnd;
      if (charAfter === "\n") {
        endIndex++;
        if (secondCharAfter === "\n") {
          endIndex++;
        }
      }

      newFileChars.splice(startIndex, endIndex - startIndex + 1);
    }
  }

  return newFileChars.join("");
}

const REMOVAL_PERCENTAGE_THRESHOLD = 0.3;
function shouldRejectDiff(diff: DiffLine[]): boolean {
  const numRemovals = diff.filter((line) => line.type === "old").length;
  return numRemovals / diff.length > REMOVAL_PERCENTAGE_THRESHOLD;
}

function nodeSurroundedInLazyBlocks(
  parser: Parser,
  file: string,
  filename: string,
): { newTree: Parser.Tree; newFile: string } | undefined {
  const ext = path.extname(filename).slice(1);
  const language = LANGUAGES[ext];
  if (!language) return undefined;

  const newFile = `${language.singleLineComment} ... existing code ...\n\n${file}\n\n${language.singleLineComment} ... existing code ...`;
  const newTree = parser.parse(newFile);

  return { newTree, newFile };
}

export async function deterministicApplyLazyEdit({
  oldFile,
  newLazyFile,
  filename,
  onlyFullFileRewrite = false,
}: {
  oldFile: string;
  newLazyFile: string;
  filename: string;
  onlyFullFileRewrite?: boolean;
}): Promise<DiffLine[] | undefined> {
  const parser = await getParserForFile(filename);
  if (!parser) return undefined;

  const oldTree = parser.parse(oldFile);
  let newTree = parser.parse(newLazyFile);
  let reconstructedNewFile: string | undefined;

  if (onlyFullFileRewrite) {
    if (!isLazyText(newTree.rootNode.text)) {
      const diff = myersDiff(oldFile, newLazyFile);
      if (shouldRejectDiff(diff)) return undefined;
      return diff;
    }
    return undefined;
  }

  const hasLazyBlocks = !!findInAst(newTree.rootNode, isLazyBlock);

  if (!hasLazyBlocks) {
    const diff = myersDiff(oldFile, newLazyFile);
    if (shouldRejectDiff(diff)) return undefined;
    return diff;
  }

  if (!findInAst(newTree.rootNode, isLazyBlock)) {
    const firstSimilarNode = findInAst(oldTree.rootNode, (node) =>
      nodesAreSimilar(node, newTree.rootNode.children[0]),
    );

    if (firstSimilarNode?.parent?.equals(oldTree.rootNode)) {
      const result = nodeSurroundedInLazyBlocks(parser, newLazyFile, filename);
      if (result) {
        newLazyFile = result.newFile;
        newTree = result.newTree;
      }
    } else {
      const newCodeNumLines = newTree.rootNode.text.split("\n").length;
      const matchingNode = findInAst(
        oldTree.rootNode,
        (node) => programNodeIsSimilar(newTree.rootNode, node),
        (node) => node.text.split("\n").length >= newCodeNumLines,
      );

      if (!matchingNode) {
        console.warn("No matching node found for lazy block");
        return undefined;
      }

      reconstructedNewFile =
        oldTree.rootNode.text.slice(0, matchingNode.startIndex) +
        newTree.rootNode.text +
        oldTree.rootNode.text.slice(matchingNode.endIndex);
    }
  }

  if (!reconstructedNewFile) {
    const replacements: AstReplacements = [];
    findLazyBlockReplacements(oldTree.rootNode, newTree.rootNode, replacements);

    reconstructedNewFile = reconstructNewFile(
      oldFile,
      newLazyFile,
      replacements,
    );
  }

  if (astHasErrors(parser, reconstructedNewFile)) {
    console.warn("AST validation failed after lazy edit");
    return undefined;
  }

  const diff = myersDiff(oldFile, reconstructedNewFile);
  if (shouldRejectDiff(diff)) return undefined;

  return diff;
}

function isLazyBlock(node: Parser.SyntaxNode): boolean {
  if (
    node.type === "jsx_expression" &&
    node.namedChildCount === 1 &&
    isLazyBlock(node.namedChildren[0])
  ) {
    return true;
  }

  return node.type.includes("comment") && isLazyText(node.text);
}

function stringsWithinLevDistThreshold(
  a: string,
  b: string,
  threshold: number,
) {
  const dist = distance(a, b);
  return dist / Math.min(a.length, b.length) <= threshold;
}

function programNodeIsSimilar(
  programNode: Parser.SyntaxNode,
  otherNode: Parser.SyntaxNode,
): boolean {
  const newLines = programNode.text.split("\n");
  const oldLines = otherNode.text.split("\n");

  const oldFirstLine = oldLines[0].trim();
  let matchForOldFirstLine = -1;

  for (let i = 0; i < newLines.length; i++) {
    if (newLines[i].trim() === oldFirstLine) {
      matchForOldFirstLine = i;
      break;
    }
  }

  if (matchForOldFirstLine < 0) return false;

  if (
    oldLines[oldLines.length - 1].trim() !==
    newLines[newLines.length - 1].trim()
  ) {
    return false;
  }

  let matchingLines = 0;
  for (let i = 0; i < Math.min(newLines.length, oldLines.length); i++) {
    if (oldLines[i].trim() === newLines[matchForOldFirstLine + i]?.trim()) {
      matchingLines++;
    }
  }

  return matchingLines >= Math.max(newLines.length, oldLines.length) / 2;
}

function nodesAreSimilar(a: Parser.SyntaxNode, b: Parser.SyntaxNode): boolean {
  if (a.type !== b.type) return false;

  if (
    a.childForFieldName("name")?.text &&
    a.childForFieldName("name")?.text === b.childForFieldName("name")?.text
  ) {
    return true;
  }

  if (
    a.namedChildren[0]?.text === b.namedChildren[0]?.text &&
    a.children[1]?.text === b.children[1]?.text
  ) {
    return true;
  }

  if (
    a.type === "jsx_element" &&
    b.type === "jsx_element" &&
    a.namedChildren[0]?.children[1]?.text ===
      b.namedChildren[0]?.children[1]?.text &&
    stringsWithinLevDistThreshold(a.text, b.text, 0.3)
  ) {
    return true;
  }

  return stringsWithinLevDistThreshold(
    a.text.split("\n")[0],
    b.text.split("\n")[0],
    0.2,
  );
}

function nodesAreExact(a: Parser.SyntaxNode, b: Parser.SyntaxNode): boolean {
  return a.text === b.text;
}

function findLazyBlockReplacements(
  oldNode: Parser.SyntaxNode,
  newNode: Parser.SyntaxNode,
  replacements: AstReplacements,
): void {
  if (nodesAreExact(oldNode, newNode)) return;
  if (!findInAst(newNode, isLazyBlock)) return;

  const leftChildren = [...oldNode.namedChildren];
  const rightChildren = [...newNode.namedChildren];

  let isLazy = false;
  let currentLazyBlockNode: Parser.SyntaxNode | undefined;
  const currentLazyBlockReplacementNodes: Parser.SyntaxNode[] = [];

  while (leftChildren.length > 0 && rightChildren.length > 0) {
    const L = leftChildren[0];
    const R = rightChildren[0];

    if (isLazyBlock(R)) {
      isLazy = true;
      currentLazyBlockNode = R;
      rightChildren.shift();
      continue;
    }

    const index = rightChildren.findIndex((node) => nodesAreSimilar(L, node));

    if (index === -1) {
      if (isLazy) currentLazyBlockReplacementNodes.push(L);
      leftChildren.shift();
    } else {
      rightChildren.splice(0, index);

      findLazyBlockReplacements(L, rightChildren[0], replacements);

      leftChildren.shift();
      rightChildren.shift();

      if (isLazy) {
        replacements.push({
          nodeToReplace: currentLazyBlockNode!,
          replacementNodes: [...currentLazyBlockReplacementNodes],
        });
        isLazy = false;
        currentLazyBlockReplacementNodes.length = 0;
        currentLazyBlockNode = undefined;
      }
    }
  }

  if (isLazy && currentLazyBlockNode) {
    replacements.push({
      nodeToReplace: currentLazyBlockNode,
      replacementNodes: [...currentLazyBlockReplacementNodes, ...leftChildren],
    });
  }

  for (const R of rightChildren) {
    if (isLazyBlock(R)) {
      replacements.push({
        nodeToReplace: R,
        replacementNodes: [],
      });
    }
  }
}
