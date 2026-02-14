# Change Rules (Mandatory)

These rules MUST be followed for all development work in this repository.

---

## 1. Branching Rule

- All new work MUST start from the `dreamcode` branch.
- A new branch MUST be created before any change.
- Direct commits to `dreamcode` are strictly forbidden.

### Branch naming convention:

- `feature/<short-description>`
- `fix/<short-description>`
- `refactor/<short-description>`

---

## 2. Development Rule

- All code changes MUST be done on the newly created branch.
- No experimental, partial, or temporary work may be committed to `dreamcode`.

---

## 3. Approval Rule

- After completing work, the agent MUST stop.
- Explicit user approval is REQUIRED before proceeding.
- Approval must be clear (e.g., "Approved", "Yes, create PR").

---

## 4. Pull Request Rule

- A Pull Request MUST be created only after approval.
- The PR MUST:
  - Target the `dreamcode` branch
  - Contain a clear title
  - Include a concise summary of changes

---

## 5. Merge Restriction

- No merge into `dreamcode` is allowed without:
  1. User approval
  2. A Pull Request

---

## 6. Post-Merge Branch Cleanup Rule (Mandatory)

- After the user confirms that a Pull Request has been merged into `dreamcode`,
  the AI MUST verify whether the feature branch still exists.

- The AI MUST check:
  1. Whether the branch exists locally
  2. Whether the branch exists on the remote (GitHub)

- If the branch EXISTS:
  - The AI MUST delete it safely:
    - Local: `git branch -d <branch-name>`
    - Remote: `git push origin --delete <branch-name>`

- If the branch DOES NOT exist:
  - The AI MUST NOT fail
  - The AI MUST report that the branch was already deleted
    (for example, due to GitHub auto-delete after merge)

- Branch cleanup MUST be:
  - Safe
  - Idempotent
  - Non-blocking

- The AI MUST NEVER attempt branch deletion:
  - Before the PR is merged
  - Without explicit user confirmation that the merge is complete

---

## 7. Enforcement

Failure to follow these rules is a process violation.  
These rules override convenience, speed, or assumptions.

---

## IMPORTANT BEHAVIOR CHANGE (APPLIES TO ALL FUTURE TASKS)

Before starting ANY new task:

- Always create a new branch from `dreamcode`
- Perform all work on that branch only
- Stop and request user approval when work is complete
- Create a Pull Request ONLY after approval
- Never push or commit directly to `dreamcode`
- After merge confirmation, clean up the feature branch if it exists

---

This architecture is intentional and optimized for a
single, non-technical, solo developer workflow.
