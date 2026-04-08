#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Step 0 Foundation Smoke Test${NC}"

PASSED=0
FAILED=0

run_test() {
  local name=$1
  local command=$2

  echo -n "  ${name} ... "
  if eval "$command" >/dev/null 2>&1; then
    echo -e "${GREEN}ok${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}fail${NC}"
    FAILED=$((FAILED + 1))
  fi
}

run_test "backend/package.json exists" "test -f backend/package.json"
run_test "extension/package.json exists" "test -f extension/package.json"
run_test "web/package.json exists" "test -f web/package.json"

run_test "backend/.env.example exists" "test -f backend/.env.example"
run_test "extension/.env.example exists" "test -f extension/.env.example"
run_test "web/.env.example exists" "test -f web/.env.example"

run_test "shared/contracts/domain.ts exists" "test -f shared/contracts/domain.ts"
run_test "shared/contracts/api.ts exists" "test -f shared/contracts/api.ts"
run_test "shared/contracts/sse.ts exists" "test -f shared/contracts/sse.ts"
run_test "shared/contracts/errors.ts exists" "test -f shared/contracts/errors.ts"

run_test "backend validation layer exists" "test -f backend/src/lib/validation.ts"
run_test "backend schemas exist" "test -f backend/src/lib/schemas.ts"
run_test "backend tests exist" "test -f backend/src/__tests__/routes.validation.test.ts"

run_test "Step 0 taskboard exists" "test -f docs/agent_plans/v1_step_by_step/v1_step_0.md"
run_test "Step 0 planning blueprint exists" "test -f docs/agent_plans/v1_step_by_step/v1_step_0_planning.md"

echo
echo "Passed: ${PASSED}"
echo "Failed: ${FAILED}"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi

echo -e "${GREEN}All smoke checks passed.${NC}"
