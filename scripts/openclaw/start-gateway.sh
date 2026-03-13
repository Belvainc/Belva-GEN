#!/usr/bin/env bash
# Start the OpenClaw Gateway for local development.
# Requires: brew install openclaw
#
# Usage: ./scripts/openclaw/start-gateway.sh
#
# The gateway reads openclaw/openclaw.json and serves at http://localhost:3100.
# Agent definitions are composed by our orchestration layer, not the gateway.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/openclaw/openclaw.json"

# Verify openclaw is installed
if ! command -v openclaw &>/dev/null; then
  echo "Error: openclaw is not installed."
  echo "Install with: brew install openclaw"
  exit 1
fi

# Verify config exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: OpenClaw config not found at $CONFIG_FILE"
  exit 1
fi

echo "Starting OpenClaw Gateway..."
echo "  Config: $CONFIG_FILE"
echo "  Port:   3100"
echo ""

# Export REPO_PATH for filesystem MCP server path restrictions
export REPO_PATH="$PROJECT_ROOT"

exec openclaw serve --config "$CONFIG_FILE"
