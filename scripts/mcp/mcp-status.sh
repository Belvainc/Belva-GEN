#!/bin/bash
# ABOUTME: [STUB] Check MCP server connectivity for Jira and Slack integrations
set -e

YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}MCP Integration Status${NC}"
echo "======================"
echo ""
echo -e "${YELLOW}MCP integration not yet configured.${NC}"
echo ""
echo "  Scaffolding available at:"
echo "    src/server/mcp/jira/   — Jira MCP client"
echo "    src/server/mcp/slack/  — Slack MCP client"
echo ""
echo "  See .claude/rules/mcp-safety.md for safe operation guidelines."
echo ""
