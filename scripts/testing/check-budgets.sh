#!/bin/bash
# ABOUTME: Run tests and check against performance budgets (unit <3s, E2E <60s)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

UNIT_BUDGET=3
E2E_BUDGET=60

echo ""
echo -e "${BLUE}Checking test performance budgets...${NC}"
echo ""

# Time unit tests
echo -e "${YELLOW}── Unit Tests (budget: ${UNIT_BUDGET}s) ──${NC}"
UNIT_START=$(date +%s)
npm run test:unit 2>&1 || true
UNIT_END=$(date +%s)
UNIT_ELAPSED=$((UNIT_END - UNIT_START))

if [ "$UNIT_ELAPSED" -le "$UNIT_BUDGET" ]; then
  UNIT_STATUS="${GREEN}${UNIT_ELAPSED}s ✓${NC}"
else
  UNIT_STATUS="${RED}${UNIT_ELAPSED}s ✗ (over budget by $((UNIT_ELAPSED - UNIT_BUDGET))s)${NC}"
fi

echo ""

# Time E2E tests
echo -e "${YELLOW}── E2E Tests (budget: ${E2E_BUDGET}s) ──${NC}"
E2E_START=$(date +%s)
npm run test:e2e 2>&1 || true
E2E_END=$(date +%s)
E2E_ELAPSED=$((E2E_END - E2E_START))

if [ "$E2E_ELAPSED" -le "$E2E_BUDGET" ]; then
  E2E_STATUS="${GREEN}${E2E_ELAPSED}s ✓${NC}"
else
  E2E_STATUS="${RED}${E2E_ELAPSED}s ✗ (over budget by $((E2E_ELAPSED - E2E_BUDGET))s)${NC}"
fi

# Summary
echo ""
echo "==========================="
echo -e "  Unit:  $UNIT_STATUS  (budget: ${UNIT_BUDGET}s)"
echo -e "  E2E:   $E2E_STATUS  (budget: ${E2E_BUDGET}s)"
echo "==========================="
echo ""
