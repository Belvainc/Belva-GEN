---
paths:
  - "**/*"
---

# Rule: MCP Tool Safety — Non-Negotiable

## Enforcement Level: MANDATORY — No Exceptions

Never re-submit full content for metadata-only MCP operations. Content passed through the context window can be truncated, reformatted, or corrupted silently.

---

## The Rule

If you cannot find an MCP tool that safely performs a metadata-only edit without re-submitting content, you MUST:

1. Search for alternative tools or API endpoints that handle it safely
2. If none exist, **ask the user to perform the action manually**
3. Never attempt a dangerous workaround

## Jira MCP Operations

| Operation | Safe? | Action |
| --------- | ----- | ------ |
| Read issue | `jira_get_issue` | Safe (read-only) |
| Transition issue | `jira_transition_issue` | Safe (status change only) |
| Add comment | `jira_add_comment` | Safe (append-only) |
| Add label | `jira_add_label` | Safe (metadata only) |
| **Update full description** | **DANGEROUS** | Replaces entire body — risk of truncation |
| **Bulk field update** | **DANGEROUS** | May overwrite fields unintentionally |

## Slack MCP Operations

| Operation | Safe? | Action |
| --------- | ----- | ------ |
| Send message | `slack_post_message` | Safe (new content) |
| Add reaction | `slack_add_reaction` | Safe (metadata only) |
| **Update message** | **DANGEROUS** | Replaces entire message body |
| **Delete message** | **DANGEROUS** | Irreversible |

## General Principle

**The context window is not a lossless transport layer.**

- Reading content through MCP, passing it through the context window, and writing it back can silently lose data
- Long documents, formatted content, and structured data are especially vulnerable
- Always prefer targeted operations (add, transition, comment) over full-content replacements
- When in doubt, ask the user to perform the operation manually

## Applicability

- All agents that interact with MCP tools
- The @orchestrator-project agent must enforce this when delegating MCP operations
