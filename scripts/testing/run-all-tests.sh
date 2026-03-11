#!/bin/bash
# ABOUTME: Run unit and E2E tests sequentially, report combined pass/fail summary
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

UNIT_EXIT=0
E2E_EXIT=0

echo ""
echo -e "${BLUE}Running all tests...${NC}"
echo ""

# Unit tests
echo -e "${YELLOW}── Unit Tests ──${NC}"
if npm run test:unit 2>&1; then
  UNIT_STATUS="${GREEN}PASS${NC}"
else
  UNIT_EXIT=1
  UNIT_STATUS="${RED}FAIL${NC}"
fi

echo ""

# E2E tests
echo -e "${YELLOW}── E2E Tests ──${NC}"
if npm run test:e2e 2>&1; then
  E2E_STATUS="${GREEN}PASS${NC}"
else
  E2E_EXIT=1
  E2E_STATUS="${RED}FAIL${NC}"
fi

# Summary
echo ""
echo "==========================="
echo -e "  Unit:  $UNIT_STATUS"
echo -e "  E2E:   $E2E_STATUS"
echo "==========================="
echo ""

if [ "$UNIT_EXIT" -ne 0 ] || [ "$E2E_EXIT" -ne 0 ]; then
  exit 1
fi
