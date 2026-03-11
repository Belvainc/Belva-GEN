#!/bin/bash
# ABOUTME: Show project health overview — git, quality, agents, skills, memory
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo ""
echo -e "${BLUE}Belva-GEN Project Health${NC}"
echo "========================"

# Git status
echo ""
echo -e "${YELLOW}Git${NC}"
BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
echo "  Branch: $BRANCH"
CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGES" -eq 0 ]; then
  echo -e "  Working tree: ${GREEN}clean${NC}"
else
  echo -e "  Working tree: ${YELLOW}${CHANGES} changed file(s)${NC}"
fi

echo ""
echo -e "${YELLOW}Recent Commits${NC}"
git log --oneline -5 2>/dev/null | sed 's/^/  /'

# Quality
echo ""
echo -e "${YELLOW}Quality${NC}"
if npm run quality --silent > /dev/null 2>&1; then
  echo -e "  Lint + Type-check: ${GREEN}PASS${NC}"
else
  echo -e "  Lint + Type-check: ${RED}FAIL${NC}"
fi

# Inventory
echo ""
echo -e "${YELLOW}Inventory${NC}"

AGENTS=$(find "$PROJECT_ROOT/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
RULES=$(find "$PROJECT_ROOT/.claude/rules" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS=$(find "$PROJECT_ROOT/.github/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
MEMORY=$(find "$PROJECT_ROOT/.claude/agent-memory" -name "MEMORY.md" 2>/dev/null | wc -l | tr -d ' ')
COMMANDS=$(find "$PROJECT_ROOT/.claude/commands" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

echo "  Agents:   $AGENTS"
echo "  Rules:    $RULES"
echo "  Skills:   $SKILLS"
echo "  Memory:   $MEMORY"
echo "  Commands: $COMMANDS"
echo ""
