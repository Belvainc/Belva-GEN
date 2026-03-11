#!/bin/bash
# ABOUTME: Install Playwright browsers (chromium only, matching playwright.config.ts)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo -e "${BLUE}Installing Playwright browsers...${NC}"
echo ""

cd "$PROJECT_ROOT"

if npx playwright install chromium --with-deps; then
  echo ""
  echo -e "${GREEN}Playwright browsers installed successfully.${NC}"
else
  echo ""
  echo -e "${RED}Failed to install Playwright browsers.${NC}"
  exit 1
fi
