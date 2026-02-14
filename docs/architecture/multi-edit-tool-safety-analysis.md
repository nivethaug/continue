# Multi-Edit Tool Safety Analysis

> **Status:** Design analysis only  
> **Decision:** `multi_edit` remains unsafe by default  
> **Scope:** Documentation — no behavior change  
> **Related systems:** Lazy edit pipeline (`applyCodeBlock`, `deterministicApplyLazyEdit`)

---

## Executive Summary

The `multi_edit` tool is a **primitive string-based find-and-replace facility** designed for programmatic editing operations. It intentionally provides **no safety guarantees** beyond exact string matching, treating files as opaque strings rather than structured code.

This analysis documents:

1. Current behavior and guarantees
2. Known failure modes and detection capabilities
3. Safety gaps compared to the lazy edit pipeline
4. Conceptual safety enhancements (suggestions only — no implementation)

---

## 1. Current Behavior Analysis

### Execution Flow

```typescript
multiEditTool.preprocessArgs()
  ↓
validateMultiEdit(args)           // Checks structure
  ↓
validateSearchAndReplaceFilepath()  // Resolves file URI
  ↓
executeMultiFindAndReplace()         // ← ACTUAL WORK
  ↓
ide.writeFile()                   // Write to disk
```

### What `multi_edit` Does Today

1. **Performs find-and-replace:**
   - Searches for `old_string` in file content
   - If found, replaces with `new_string`
   - If `replace_all=true`, repeats for all occurrences
   - Applies edits sequentially (order matters)

2. **String-only operations:**
   - Uses `findSearchMatches()` — character-level matching
   - Direct string splice operations
   - No Tree-sitter involved
   - No concept of "syntax" or "AST"

3. **File resolution:**
   - Resolves relative paths to absolute URIs
   - Uses IDE's workspace directories
   - Validates file exists before reading

### Guarantees Provided

| Guarantee                      | Status                              |
| ------------------------------ | ----------------------------------- |
| Edits applied sequentially     | ✅ Yes (for loop)                   |
| Atomic (all or nothing)        | ✅ Yes (try-catch, any fail = none) |
| File path resolution           | ✅ Yes                              |
| Exact string matching required | ✅ Yes (not fuzzy)                  |

### Guarantees Explicitly **NOT** Provided

| Guarantee                   | Status                                  | Why Not |
| --------------------------- | --------------------------------------- | ------- |
| Syntax validation           | ❌ String operations only               |
| Edits preserve valid syntax | ❌ Can write syntactically invalid code |
| Deletion size limits        | ❌ No threshold checks                  |
| Structure preservation      | ❌ No awareness of AST                  |
| Formatting consistency      | ❌ Can mismatch indentation             |
| Rollback on error           | ❌ No undo mechanism                    |

---

## 2. Failure Modes

### Known Failure Cases

| Failure Type                               | Detection                     | Silent? | Impact                                                       | User Experience |
| ------------------------------------------ | ----------------------------- | ------- | ------------------------------------------------------------ | --------------- |
| **Exact string mismatch**                  | ✅ Yes (throws ContinueError) | ❌ No   | Tool fails, no file change                                   |
| **Multiple matches without `replace_all`** | ✅ Yes (throws ContinueError) | ❌ No   | Tool fails with error message                                |
| **File not found**                         | ✅ Yes (fileExists check)     | ❌ No   | Tool fails with clear error                                  |
| **Syntax corruption after edit**           | ❌ No                         | ✅ Yes  | Invalid code written, later errors caught by linter/compiler |
| **Large unintended deletions**             | ❌ No                         | ✅ Yes  | File content mangled, user must manually recover             |
| **Indentation mangled**                    | ❌ No                         | ✅ Yes  | Code works but formatting broken                             |
| **Partial match with extra whitespace**    | ❌ No                         | ✅ Yes  | Match fails, tool throws error                               |
| **Concurrent user edit conflicts**         | ❌ No                         | ✅ Yes  | File overwrites user's concurrent changes                    |
| **File corrupted between read/write**      | ❌ No                         | ✅ Yes  | Old edit overwrites lost                                     |

### Detectable vs Silent

| Failure Category       | Detectable | Reason                               |
| ---------------------- | ---------- | ------------------------------------ |
| String matching errors | ✅ Yes     | Throws `ContinueError` with message  |
| File access errors     | ✅ Yes     | IDE readFile/writeFile throws        |
| **All other failures** | ❌ Silent  | No validation between read and write |

### Silent Failure Examples

1. **Large deletion:**

   ```
   old_string: "small"
   new_string: ""
   // Deletes 90% of file
   // Returns success, file is mangled
   ```

2. **Syntax corruption:**

   ```
   old_string: "const x = 1;"
   new_string: "const x ="
   // Invalid JavaScript
   // Returns success, parsing breaks
   ```

3. **Indentation mismatch:**
   ```python
   old_string: "def foo():\n    pass"
   new_string: "def foo():\npass"
   // Indentation lost
   // Code may be semantically wrong
   ```

---

## 3. Safety Gap Assessment

### Comparison: Multi-Edit vs Lazy Edit Pipeline

| Safety Layer            | Multi-Edit | Lazy Edit Pipeline                            |
| ----------------------- | ---------- | --------------------------------------------- |
| **AST validation**      | ❌ None    | ✅ `astHasErrors()` checks parsed tree        |
| **Diff validation**     | ❌ None    | ✅ Myers diff generated, verified             |
| **Size thresholds**     | ❌ None    | ✅ `shouldRejectDiff()` rejects >30% removals |
| **Syntax recovery**     | ❌ None    | ✅ Validates syntax post-reconstruction       |
| **Lazy markers**        | ❌ None    | ✅ Explicit user intent boundaries            |
| **Rollback capability** | ❌ None    | ✅ DocumentHistoryTracker tracks versions     |

### Why These Are Currently Absent

| Missing Safety       | Design Rationale                                       |
| -------------------- | ------------------------------------------------------ |
| **AST validation**   | `multi_edit` is general-purpose, not language-specific |
| **Diff thresholds**  | Edit count is unpredictable, size varies wildly        |
| **Syntax checking**  | Would require language-specific parsers for every edit |
| **Rollback**         | No persistence layer designed into tool                |
| **Lazy integration** | Lazy markers are LLM chat feature, not tool feature    |

### Tradeoff Analysis

**Current design prioritizes:**

- ✅ **Simplicity:** Pure string operations, no dependencies
- ✅ **Performance:** No parsing overhead
- ✅ **Predictability:** Exact match semantics
- ✅ **Cross-language:** Works for any file type

**At cost of:**

- ❌ **Safety:** No structure or syntax awareness
- ❌ **Recovery:** No undo or validation
- ❌ **Correctness:** User must verify result manually

---

## 4. Suggested Safety Enhancements

> ⚠️ **SUGGESTION ONLY — DO NOT IMPLEMENT**

### SUGGESTION 1 — Pre-Flight File Hash Check

**Concept:** Before applying edits, compute hash of file content, write, then re-hash and compare.

**Mechanism:**

```typescript
// Pseudocode only
const beforeHash = hash(editingFileContents);
const newFileContents = executeMultiFindAndReplace(editingFileContents, edits);
await extras.ide.writeFile(fileUri, newFileContents);
const afterHash = hash(await extras.ide.readFile(fileUri));

if (beforeHash === afterHash) {
  // No actual change made
  return { didChange: false };
}

if (afterHash !== hash(newFileContents)) {
  // Something else modified file concurrently
  throw new ContinueError("File was modified concurrently");
}
```

**Tradeoffs:**

- ✅ Catches concurrent modifications
- ❌ Hashing overhead (~1-5ms per file)
- ❌ False positives if file formatting differs

**Rationale:** Prevents overwriting user's concurrent edits.

---

### SUGGESTION 2 — Edit Impact Score

**Concept:** Assign numeric score to each edit operation; reject if total exceeds threshold.

**Mechanism:**

```typescript
// Pseudocode only
function calculateEditImpact(
  oldFile: string,
  oldString: string,
  newString: string,
): number {
  const oldLength = oldString.length;
  const newLength = newString.length;
  const deletionRatio = (oldLength - newLength) / oldLength;
  const additionRatio = newLength / oldFile.length;

  return {
    deletionScore: Math.max(0, deletionRatio * 100),
    additionScore: Math.min(100, additionRatio * 50),
    totalScore: deletionRatio * 100 + additionRatio * 50,
  };
}

const totalImpact = edits.reduce((sum, edit) => {
  return (
    sum + calculateEditImpact(file, edit.old_string, edit.new_string).totalScore
  );
}, 0);

if (totalImpact > DANGER_THRESHOLD) {
  throw new ContinueError("Edit impact exceeds safety threshold");
}
```

**Tradeoffs:**

- ✅ Simple heuristics, no AST required
- ✅ Configurable threshold
- ✅ Works for all languages
- ❌ False negatives for legitimate large refactorings
- ❌ Threshold tuning per language needed

**Rationale:** Blocks mass deletions before they happen.

---

### SUGGESTION 3 — Best-Effort Syntax Validation

**Concept:** Try parsing when possible; warn (don't fail) for non-supported languages.

**Mechanism:**

```typescript
// Pseudocode only
async function validateSyntaxBestEffort(
  code: string,
  filepath: string,
): { valid: boolean; language: string | null } {
  const parser = await getParserForFile(filepath);
  if (!parser) {
    return { valid: true, language: null }; // Can't validate, permit
  }

  try {
    parser.parse(code);
    return { valid: true, language: parser.getLanguage() };
  } catch (error) {
    // Log warning, don't fail
    console.warn(`Syntax validation failed for ${filepath}`, error);
    return { valid: false, language: parser.getLanguage() };
  }
}

// In multi_edit
for (const fileUri of newFileContents.keys()) {
  const newContent = await extras.ide.readFile(fileUri);
  const validation = await validateSyntaxBestEffort(newContent, fileUri);

  if (!validation.valid) {
    console.warn(
      `File ${fileUri} may have syntax errors (language: ${validation.language})`,
    );
    // Still write file
  }
}
```

**Tradeoffs:**

- ✅ Catches most syntax errors for supported languages
- ✅ Zero breaking changes
- ✅ No additional dependencies
- ❌ Partial coverage (17 languages)
- ❌ False warnings for valid code that parser doesn't like

**Rationale:** Early warning of syntax issues without blocking workflows.

---

### SUGGESTION 4 — Line Deletion Threshold

**Concept:** Count deleted lines; reject if > percentage.

**Mechanism:**

```typescript
// Pseudocode only
function countLineDeletions(
  fileContent: string,
  oldString: string,
  newString: string,
): { deletedLines: number; deletionRatio: number } {
  const fileLines = fileContent.split("\n");

  // Simple heuristic: count oldString occurrences, check each line
  const deletedLines = fileLines.filter(
    (line) =>
      oldString.trim() === line.trim() &&
      (newString === "" || !newString.includes(line.trim())),
  ).length;

  const deletionRatio = deletedLines / fileLines.length;
  return { deletedLines, deletionRatio };
}

for (const edit of edits) {
  const { deletedLines, deletionRatio } = countLineDeletions(
    editingFileContents,
    edit.old_string,
    edit.new_string,
  );

  if (deletionRatio > MAX_DELETION_RATIO) {
    throw new ContinueError(
      `Edit deletes ${Math.round(deletionRatio * 100)}% of file. ` +
        `Add \`allowDestructive: true\` to proceed, or split into smaller edits.`,
    );
  }
}
```

**Tradeoffs:**

- ✅ Simple line-based heuristic
- ✅ Configurable ratio
- ❌ Misses intra-line deletions
- ❌ False positives for multi-line string matches

**Rationale:** Rough guard against mass file truncation.

---

### SUGGESTION 5 — Safe Mode Parameter

**Concept:** Add `safe: boolean` or `allowDestructive: boolean` parameter to `multiEditArgs`.

**Mechanism:**

```typescript
// Pseudocode only
export interface MultiEditArgs {
  filepath: string;
  edits: EditOperation[];
  safe?: boolean;
  allowDestructive?: boolean;
}

// In validation
if (args.safe !== false) {
  // safe by default
  const impactScore = calculateTotalImpact(edits);
  const validation = await bestEffortSyntaxCheck(fileUri, newContent);

  if (impactScore > DEFAULT_SAFE_THRESHOLD || !validation.valid) {
    throw new ContinueError(
      `Edit blocked by safety mode (score: ${impactScore}, valid: ${validation.valid}). ` +
        `Set \`safe: false\` to proceed anyway.`,
      ContinueErrorReason.EditSafetyBlocked,
    );
  }
}
```

**Tradeoffs:**

- ✅ Backward compatible (default safe)
- ✅ Agent can opt-out per-operation
- ✅ Clear failure message
- ❌ Requires updating prompts/tool descriptions
- ❌ Default behavior change (from unsafe to safe)

**Rationale:** Explicit safety control while preserving unsafe capability for advanced use.

---

### SUGGESTION 6 — Edit Preview Mode

**Concept:** Return diff without applying; let agent confirm.

**Mechanism:**

```typescript
// Pseudocode only
export interface MultiEditArgs {
  filepath: string;
  edits: EditOperation[];
  preview?: boolean;
}

// In preprocessArgs
if (args.preview) {
  const oldContent = await extras.ide.readFile(fileUri);
  const newContent = executeMultiFindAndReplace(oldContent, edits);
  const diff = myersDiff(oldContent, newContent);

  return {
    ...args,
    previewDiff: diffLines,
    previewStats: {
      linesChanged: diff.filter((d) => d.type !== "same").length,
      deletionRatio: calculateDeletionRatio(diff),
    },
  };
  // Skip actual file write
}

// Agent can see preview, decide whether to actually apply
```

**Tradeoffs:**

- ✅ Zero-risk inspection mode
- ✅ Agent can make informed decision
- ❌ Requires agent logic changes
- ❌ Additional API roundtrip if agent re-calls tool

**Rationale:** Enables intelligent safety without blocking by default.

---

## Summary: Design Observations

### Current State

**`multi_edit` is intentionally primitive:**

- Treats file as opaque string
- No awareness of syntax or structure
- Assumes caller (agent/LLM) has validated edit correctness
- Designed for speed and simplicity over safety

**This is appropriate because:**

- Not all languages have Tree-sitter support
- AST parsing overhead would prevent some legitimate edits
- Agents may need to make exact character-level changes
- Performance matters for high-frequency operations

### Architectural Insight

**Two safety paradigms coexist:**

| Paradigm                                        | Use Case                                            | Safety Level                 |
| ----------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| **Tool layer (`multi_edit`)**                   | Programmatic edits, bulk ops, legacy workflows      | Low (user/agent responsible) |
| **Chat layer (`deterministicApplyLazyEdit()`)** | LLM chat responses, code blocks, user-visible edits | High (automated validation)  |

**Forcing tool safety would blur this boundary and create confusion.**

### Strategic Implications

| Decision                               | Implication                                             |
| -------------------------------------- | ------------------------------------------------------- |
| Keep `multi_edit` unsafe by default    | Preserves existing tooling contract and agent workflows |
| Add optional safety flags              | Enables guarded operations without breaking changes     |
| Enhance `deterministicApplyLazyEdit()` | Improves safety where it matters (chat responses)       |
| Create separate `safeMultiEdit` tool   | Clear separation of concerns, explicit safety contract  |

---

## Risk Analysis

### Current Risks

| Risk               | Likelihood | Impact                                          | Mitigation                           |
| ------------------ | ---------- | ----------------------------------------------- | ------------------------------------ |
| Syntax corruption  | Medium     | High (user loses code, later compilation fails) | User reviews changes, linters catch  |
| Large deletions    | Low-Medium | High (may lose significant work)                | User reviews changes                 |
| Formatting mangled | Medium     | Low-Medium                                      | Auto-formatters can fix              |
| Concurrent edits   | Low        | Medium                                          | User notification or manual recovery |

### Risk of Changing Default Behavior

| Change                   | Risk Level | Impact                                                                |
| ------------------------ | ---------- | --------------------------------------------------------------------- |
| Enable safety by default | High       | Breaks existing agent workflows that rely on exact string replacement |
| Add mandatory validation | High       | Prevents legitimate edits (e.g., breaking syntax intentionally)       |
| Merge with lazy edits    | Medium     | Confuses two paradigms, introduces complexity                         |

### Risk Mitigation

- Keep `multi_edit` behavior unchanged by default
- Safety as **opt-in** via parameters or settings
- Clear documentation of safety levels
- Separate tool for safety-critical use cases if needed

---

## Possible Future Directions

### Near-Term (Low Complexity)

| Direction           | Description                        | Effort |
| ------------------- | ---------------------------------- | ------ |
| **Preview mode**    | Return diff without applying       | Low    |
| **Safe parameter**  | `safe: boolean` flag               | Low    |
| **Warning system**  | Log warnings for destructive edits | Low    |
| **Metrics logging** | Track edit outcomes for telemetry  | Low    |

### Medium-Term (Medium Complexity)

| Direction                    | Description                         | Effort |
| ---------------------------- | ----------------------------------- | ------ |
| **Impact scoring**           | Simple heuristic-based safety       | Medium |
| **Best-effort syntax check** | Parse when possible, warn otherwise | Medium |
| **Line deletion threshold**  | Configurable limits                 | Medium |
| **File hash verification**   | Detect concurrent mods              | Medium |

### Long-Term (High Complexity)

| Direction                   | Description                          | Effort      |
| --------------------------- | ------------------------------------ | ----------- |
| **Rollback system**         | Undo capability using VersionHistory | High        |
| **Edit conflict detection** | Compare ASTs before/after            | High        |
| **Cross-file transactions** | Atomic multi-file edits              | Very High   |
| **Safe-mode tool**          | Separate tool with full safety stack | Medium-High |

---

**END OF DOCUMENTATION**
