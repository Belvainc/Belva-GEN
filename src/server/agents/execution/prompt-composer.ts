import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentId } from "@/types/agent-protocol";
import { createChildLogger } from "@/server/config/logger";

const logger = createChildLogger({ module: "prompt-composer" });

// ─── Paths ──────────────────────────────────────────────────────────────────
// Agent definitions and rules are in the project root.

const PROJECT_ROOT = resolve(process.cwd());
const AGENTS_DIR = join(PROJECT_ROOT, ".claude", "agents");
const RULES_DIR = join(PROJECT_ROOT, ".claude", "rules");

// ─── Rule Path Matchers ─────────────────────────────────────────────────────
// Rules have `paths:` frontmatter that determines which files they apply to.
// We parse this to decide which rules are relevant to an agent's domain.

interface RuleFile {
  filename: string;
  content: string;
  appliesTo: string[];
}

/**
 * Compose a system prompt for an agent by combining:
 * 1. The agent's definition from `.claude/agents/<agentId>.md`
 * 2. Applicable rules from `.claude/rules/*.md` based on domain paths
 *
 * This matches how Claude Code agents work — agent file + relevant rules.
 */
export async function composeSystemPrompt(
  agentId: AgentId,
  domainPaths: string[]
): Promise<string> {
  const sections: string[] = [];

  // 1. Read agent definition
  const agentPrompt = await readAgentDefinition(agentId);
  if (agentPrompt) {
    sections.push(agentPrompt);
  } else {
    logger.warn({ agentId }, "Agent definition file not found, using agentId as fallback");
    sections.push(`You are the ${agentId} agent.`);
  }

  // 2. Read and filter applicable rules
  const rules = await loadRules();
  const applicableRules = filterApplicableRules(rules, domainPaths);

  if (applicableRules.length > 0) {
    sections.push("\n---\n\n# Applicable Rules\n");
    for (const rule of applicableRules) {
      sections.push(rule.content);
      sections.push(""); // separator
    }
  }

  logger.info(
    { agentId, ruleCount: applicableRules.length },
    "System prompt composed"
  );

  return sections.join("\n");
}

/**
 * Read an agent definition file.
 */
async function readAgentDefinition(agentId: AgentId): Promise<string | null> {
  const filePath = join(AGENTS_DIR, `${agentId}.md`);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Load all rule files from `.claude/rules/`.
 */
async function loadRules(): Promise<RuleFile[]> {
  try {
    const files = await readdir(RULES_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const rules: RuleFile[] = [];
    for (const filename of mdFiles) {
      const content = await readFile(join(RULES_DIR, filename), "utf-8");
      const appliesTo = parsePathsFrontmatter(content);
      rules.push({ filename, content, appliesTo });
    }

    return rules;
  } catch {
    logger.warn("Failed to load rules directory");
    return [];
  }
}

/**
 * Parse the paths frontmatter from a rule file.
 * Expects YAML frontmatter with a "paths:" array.
 */
function parsePathsFrontmatter(content: string): string[] {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return [];

  const frontmatter = frontmatterMatch[1] ?? "";
  const pathsMatch = frontmatter.match(/paths:\s*\n((?:\s+-\s*.+\n?)*)/);
  if (!pathsMatch) return [];

  const pathsBlock = pathsMatch[1] ?? "";
  const paths: string[] = [];
  const lineRegex = /^\s+-\s*"?([^"]+)"?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(pathsBlock)) !== null) {
    const value = match[1];
    if (value) paths.push(value.trim());
  }

  return paths;
}

/**
 * Filter rules that apply to the agent's domain paths.
 * A rule applies if any of its paths patterns match any domain path.
 * Rules with a universal wildcard pattern always apply.
 */
function filterApplicableRules(
  rules: RuleFile[],
  domainPaths: string[]
): RuleFile[] {
  if (domainPaths.length === 0) {
    // If no domain paths specified, include universal rules only
    return rules.filter((r) =>
      r.appliesTo.some((p) => p === "**/*")
    );
  }

  return rules.filter((rule) =>
    rule.appliesTo.some((rulePattern) => {
      // Universal wildcard
      if (rulePattern === "**/*") return true;

      // Check if any domain path matches the rule pattern
      return domainPaths.some((dp) => matchesGlobPattern(dp, rulePattern));
    })
  );
}

/**
 * Simple glob pattern matching.
 * Supports: `**` (any directory depth), `*` (any filename).
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\*\*/g, "<<DOUBLE_STAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DOUBLE_STAR>>/g, ".*");

  try {
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(filePath);
  } catch {
    // If pattern is invalid, do a simple prefix match
    const prefix = pattern.replace(/\*.*$/, "");
    return filePath.startsWith(prefix);
  }
}
