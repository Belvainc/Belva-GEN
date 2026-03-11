#!/bin/bash
# ABOUTME: Verify that the development environment has all required tools and versions
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  local min_major="$3"

  if ! output=$($cmd 2>/dev/null); then
    echo -e "  ${RED}✗${NC} $label — not found"
    FAIL=$((FAIL + 1))
    return
  fi

  version=$(echo "$output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  major=$(echo "$version" | cut -d. -f1)

  if [ -n "$min_major" ] && [ "$major" -lt "$min_major" ] 2>/dev/null; then
    echo -e "  ${YELLOW}!${NC} $label — found $version (need >= $min_major.x)"
    FAIL=$((FAIL + 1))
    return
  fi

  echo -e "  ${GREEN}✓${NC} $label — $version"
  PASS=$((PASS + 1))
}

echo ""
echo -e "${BLUE}Belva-GEN Environment Check${NC}"
echo "==========================="
echo ""

check "Node.js"    "node --version"           20
check "npm"        "npm --version"            10
check "TypeScript" "npx tsc --version"         5
check "Playwright" "npx playwright --version"  1

echo ""
echo "---"
echo -e "  ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Environment check failed. Fix the issues above before continuing.${NC}"
  exit 1
fi

echo -e "${GREEN}Environment is ready.${NC}"
