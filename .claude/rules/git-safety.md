---
paths:
  - "**/*"
---

# Rule: Git Safety — Non-Negotiable

## Enforcement Level: MANDATORY — No Exceptions

All agents must follow these git practices without deviation.

---

## 1. Forbidden Commands

The following git commands are NEVER permitted under any circumstances:

| Command | Reason |
|---------|--------|
| `git push --force` / `git push -f` | Rewrites shared history, can destroy others' work |
| `git reset --hard` | Discards uncommitted changes irreversibly |
| `git clean -f` / `git clean -fd` | Deletes untracked files irreversibly |
| `git checkout .` / `git restore .` | Blanket discard of all changes |
| `git branch -D` | Force-deletes branch ignoring merge status |
| `git rebase` on shared/pushed branches | Rewrites shared history |

**Safe alternatives:**
- Instead of `git reset --hard`: use `git stash` or create a backup branch first
- Instead of `git branch -D`: use `git branch -d` (checks merge status)
- Instead of force-push: coordinate with team, use `--force-with-lease` only as last resort with explicit approval

## 2. Merge Strategy

- All merges to `main` MUST use squash-merge: `git merge --squash`
- Every squash-merge commit message must reference the Jira ticket: `[BELVA-XXX] Description`
- Feature branches must be up-to-date with `main` before merge (rebase locally, never force-push)
- Delete feature branches after successful merge

## 3. Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/BELVA-XXX-short-description` | `feature/BELVA-042-agent-dashboard` |
| Fix | `fix/BELVA-XXX-short-description` | `fix/BELVA-099-null-state-crash` |
| Chore | `chore/short-description` | `chore/update-dependencies` |

- All branch names must be lowercase with hyphens
- Description portion must be concise (3-5 words max)

## 4. Branch Protection

- `main` branch: no direct commits allowed
- All changes to `main` require a pull request
- PRs must pass CI (tests, lint, type-check) before merge
- PRs require at least 1 human approval

## 5. Commit Message Format

```
type(scope): description [BELVA-XXX]
```

- **Types:** `feat`, `fix`, `chore`, `test`, `docs`, `refactor`
- **Scopes:** `orchestrator`, `backend`, `frontend`, `testing`, `governance`
- Description must be imperative mood, lowercase, no period at end
- Jira ticket reference required for all feat/fix commits

**Examples:**
- `feat(orchestrator): add epic state machine transitions [BELVA-012]`
- `fix(backend): validate webhook payload before processing [BELVA-045]`
- `test(testing): add unit tests for message bus [BELVA-012]`
- `chore(governance): update DoD validation criteria`

## Applicability

- **All agents** must follow these rules
- The @orchestrator-project agent is responsible for enforcing branch protection at the workflow level
- CI pipelines must validate commit message format
