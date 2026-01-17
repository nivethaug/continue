# Agent Code Context Guide

When starting a new chat to fix or improve DreamCode agent code, share this context first:

## Essential Context

### 1. Project Overview

This is **DreamCode** - an AI coding assistant forked from Continue.dev.
We're implementing an **"agent mode"** that auto-approves all actions.

### 2. Current State

Run these commands and share the output:

```bash
git diff --stat
git diff
```

Or share the key files you modified.

### 3. Architecture

```
core/
├── edit/
│   ├── lazy/
│   │   ├── applyCodeBlock.ts       # Disabled in agent mode
│   │   ├── streamLazyApply.ts     # Disabled in agent mode
│   │   └── unifiedDiffApply.ts    # Disabled in agent mode
│   └── streamDiffLines.ts        # Disabled in agent mode
├── tools/
│   ├── definitions/
│   │   └── runTerminalCommand.ts # Auto-approved in agent mode
│   └── policies/
│       └── fileAccess.ts         # Auto-approved in agent mode
└── util/
    ├── ideUtils.ts               # Enhanced Windows path handling
    └── pathResolver.ts          # Enhanced Windows path handling
```

### 4. Specific Goals

- What exactly needs fixing/improving?
- What's the expected behavior?
- What's currently not working?

### 5. Key Changes Made

**Agent Mode Control:**

- Environment variable: `DREAMCODE_AGENT` (set to `"true"` to enable)
- When enabled, all actions are auto-approved (except disabled tools)

**Disabled in Agent Mode:**

- Diff-based editing execution (all `streamDiffLines` flows)
- Lazy apply code blocks
- Unified diff application

**Auto-Approved in Agent Mode:**

- Terminal commands (via `runTerminalCommand`)
- File access operations
- All tools (except those explicitly disabled)

**Path Handling Enhancements:**

- Windows POSIX-style paths: `/C:/path/to/file` → `C:/path/to/file`
- Network paths: `\\server\share` supported
- Absolute paths work without workspace membership requirement

### 6. Important Code Patterns

**Agent Mode Guard Pattern:**

```typescript
if (process.env.DREAMCODE_AGENT === "true") {
  throw new Error("Feature disabled in agent mode");
}
```

**Auto-Approval Pattern:**

```typescript
// In tool policies
if (dynamicPolicy === "allowedWithPermission") {
  return { policy: "allowedWithoutPermission", displayValue, toolCallState };
}
```

**Windows Path Normalization:**

```typescript
const windowsAbsolutePathRegex = /^\/[A-Za-z]:/;
if (windowsAbsolutePathRegex.test(normalizedPath)) {
  normalizedPath = normalizedPath.slice(1); // Remove leading /
}
```

### 7. Quick Reference Links

- Any relevant documentation or design docs
- Previous similar work/discussions
- Issue tracker links

---

## Example Prompt Template

```
I need to fix/improve DreamCode agent mode.

Context:
- Forked from Continue.dev
- Agent mode auto-approves all actions when DREAMCODE_AGENT=true
- Already disabled diff-based editing, auto-approved tools
- Enhanced Windows path handling

Current issue:
[Describe problem - what's broken or needs improvement?]

Files involved:
- [List files modified or related to issue]

Expected behavior:
[What should happen after fix/improvement?]

Steps to reproduce:
[If applicable]
```

---

## Tips for Better Results

1. **Be Specific:** Clearly state what's wrong vs. what should work
2. **Show Error Messages:** Include stack traces or error outputs
3. **Include Diff Context:** Share relevant git diff sections
4. **Mention Edge Cases:** Any special scenarios to consider (Windows paths, non-workspace files, etc.)
5. **Reference Related Work:** If you fixed similar issues before, mention them
