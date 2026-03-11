#!/bin/bash
# ABOUTME: Remove build artifacts, caches, and optionally node_modules (--hard)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

HARD=false
if [ "$1" = "--hard" ]; then
  HARD=true
fi

cd "$PROJECT_ROOT"

echo ""
echo -e "${BLUE}Cleaning build artifacts...${NC}"
echo ""

remove_if_exists() {
  local path="$1"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo -e "  ${GREEN}✓${NC} Removed $path"
  else
    echo -e "  ${YELLOW}–${NC} $path (not found, skipping)"
  fi
}

remove_if_exists ".next"
remove_if_exists "coverage"
remove_if_exists "e2e/results"
remove_if_exists "tsconfig.tsbuildinfo"

if [ "$HARD" = true ]; then
  echo ""
  echo -e "${YELLOW}Hard clean: removing node_modules...${NC}"
  remove_if_exists "node_modules"
  echo ""
  echo -e "${YELLOW}Run 'make install' or 'npm install' to restore dependencies.${NC}"
fi

echo ""
echo -e "${GREEN}Clean complete.${NC}"
