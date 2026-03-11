# Memory Management Skill

Decide what agent learnings to share with the team, keep personal, or discard.

---

## Purpose

AI agents accumulate knowledge as they work — gotchas, patterns, workarounds. Some of this knowledge helps every developer on the project. Some is personal. This skill defines when and how to promote learnings from personal auto-memory to shared agent memory.

---

## Usage

```markdown
Review agent memory and decide what to promote/prune.
Use the memory-management skill.
```

---

## Memory Architecture

```
Personal (local, not in git)              Shared (git-tracked, team-wide)
─────────────────────────────             ──────────────────────────────
~/.claude/projects/*/memory/              .claude/agent-memory/<agent>/MEMORY.md
  MEMORY.md (auto, first 200 lines)      .claude/rules/*.md
  topic-files.md (on demand)             .github/skills/*/SKILL.md
                                          CLAUDE.md
```

**Flow:** Personal auto-memory → validate across sessions → promote to shared agent memory → if broadly applicable, consider a rule or skill instead.

---

## The Promotion Decision

### Ask These Questions

| Question | Yes → Shared | No → Personal |
| -------- | ------------ | ------------- |
| Would a new developer's Claude agent need this to avoid a mistake? | Share it | Keep personal |
| Has this pattern been validated across 2+ sessions? | Share it | Wait and verify |
| Is it a project fact, not a personal preference? | Share it | Keep personal |
| Does it reference the codebase (not local paths/env)? | Share it | Rewrite or keep personal |
| Would its absence cause Claude to produce incorrect code? | Share it | Nice-to-have, keep personal |

### One-Word Test

**"Would this help someone who isn't me?"** → Share it.

---

## What Belongs Where

### Shared Agent Memory (`.claude/agent-memory/<agent>/MEMORY.md`)

Gotchas, workarounds, and patterns **specific to this agent's domain** that any team member's Claude would benefit from.

**Good entries:**

```markdown
## Zod Schema vs TypeScript Type Drift

When adding new fields to AgentMessage types, always update both the Zod schema and the TypeScript type simultaneously. The discriminated union in agent-protocol.ts requires both to stay in sync or publish() silently drops messages that fail validation.

Reference: `src/types/agent-protocol.ts`
```

**Bad entries:**

```markdown
## My Debugging Session
I spent 2 hours figuring out why the message bus wasn't dispatching.
The issue was on my machine because I had stale node_modules.
```

### Personal Auto-Memory (`~/.claude/projects/*/memory/`)

Your personal learning journal. Session context, debugging notes, workflow preferences.

### Rules (`.claude/rules/*.md`)

Patterns so stable they should be **enforced on every relevant file**. Rules use path-scoping frontmatter and are loaded automatically. Promote from agent memory to a rule when:

- The pattern applies to a category of files (all types, all tests, all API routes)
- Violating it would always be wrong
- It's been in agent memory for 2+ sprints with no changes

### Skills (`.github/skills/*/SKILL.md`)

Reusable workflows that encode domain expertise (story writing, bug reporting, DoR validation). Promote to a skill when:

- The process involves multiple steps with judgment calls
- Multiple agents or team members need the same workflow
- The process is complex enough that free-form instructions produce inconsistent results

---

## Entry Format

Keep entries concise, factual, and citable.

```markdown
## [Topic Name]

[1-3 sentences describing the pattern, gotcha, or workaround.]
[Why it matters — what goes wrong if you don't know this.]

Reference: `path/to/relevant/file.ts`
```

### Rules

1. **Cite sources** — include a file path so staleness is detectable
2. **No absolute paths** — use repo-relative paths (`src/server/...` not `/Users/james/...`)
3. **No session context** — no "I tried X and it failed" narratives
4. **No personal preferences** — no "I prefer tabs" or "I like verbose logging"
5. **Concise** — if an entry exceeds 5 lines, it may belong in a rule or skill instead
6. **Domain-scoped** — each agent's memory covers only its domain

---

## Memory Hygiene

### When Adding

Before recording a new entry, check:

- Does this duplicate an existing rule in `.claude/rules/`?
- Does this duplicate content in `CLAUDE.md`?
- Is this still true? (Test the pattern against current code)
- Is the cited file still at that path?

### When Reviewing (Quarterly)

For each entry in each agent's MEMORY.md:

1. **Does the referenced file/pattern still exist?** → If not, remove or update
2. **Has this been promoted to a rule or skill?** → If yes, remove from memory
3. **Is this still a gotcha or has the underlying issue been fixed?** → If fixed, remove
4. **Has anyone on the team contradicted this?** → If yes, discuss and resolve

### Staleness Signals

| Signal | Action |
| ------ | ------ |
| Referenced file was deleted or renamed | Update or remove entry |
| Pattern was codified into a rule | Remove from memory (rule takes precedence) |
| Entry references a library version that was upgraded | Verify still applicable |
| Entry was added 3+ months ago with no validation | Review and confirm or remove |

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
| ------------ | ------- | --- |
| Absolute paths (`/Users/james/...`) | Breaks for other developers | Use repo-relative paths |
| Debugging narratives | Session context, not reusable knowledge | Extract the pattern, discard the story |
| Personal preferences as shared memory | Conflicts between team members | Keep in personal auto-memory |
| Duplicating rules | Memory and rules diverge over time | If it's in a rule, don't repeat in memory |
| Unbounded growth | Claude starts ignoring entries | Cap at ~50 lines per agent; promote or prune |

---

## Process: Promoting Personal → Shared

```
1. Notice a pattern in personal auto-memory that helped you
2. Verify it across at least one more session (did it hold up?)
3. Check it's not already in rules, CLAUDE.md, or shared memory
4. Rewrite in entry format (concise, no personal context, repo-relative paths)
5. Add to the appropriate agent's .claude/agent-memory/<agent>/MEMORY.md
6. Commit via PR — team reviews shared memory changes like code
```

---

## Process: Promoting Memory → Rule or Skill

```
1. Entry has been stable in shared memory for 2+ sprints
2. It applies broadly (all files of a type, not one specific case)
3. Create .claude/rules/<topic>.md with path-scoping frontmatter (for rules)
   OR .github/skills/<name>/SKILL.md (for multi-step workflows)
4. Remove the original memory entry (rule/skill is now the source of truth)
5. Commit via PR
```
