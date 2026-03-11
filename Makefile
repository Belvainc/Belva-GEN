# ============================================================================
# Belva-GEN Makefile
# ============================================================================
# This Makefile is a menu system and developer guide. All non-trivial logic
# lives in scripts/ — the Makefile only delegates.
#
# Usage:
#   make help          — Show all target categories
#   make dev-help      — Development targets
#   make test-help     — Testing targets
#   make setup-help    — Setup targets
#   make status-help   — Status targets
# ============================================================================

.DEFAULT_GOAL := help
SHELL := /bin/bash

# ============================================================================
# Variables
# ============================================================================

SCRIPTS_DIR := scripts

# ============================================================================
# Section 1: Help
# ============================================================================

.PHONY: help
help: ## Show all available target categories
	@echo ""
	@echo "  Belva-GEN — Developer Command Menu"
	@echo "  ===================================="
	@echo ""
	@echo "  Usage: make <target>"
	@echo ""
	@echo "  Categories:"
	@echo "    make dev-help      Development (dev server, build, start)"
	@echo "    make test-help     Testing (unit, e2e, coverage, budgets)"
	@echo "    make setup-help    Setup (install, verify, playwright)"
	@echo "    make quality-help  Quality (lint, type-check)"
	@echo "    make status-help   Status (project health)"
	@echo "    make clean-help    Clean (artifacts, caches)"
	@echo "    make infra-help    Infrastructure (database, redis, docker)"
	@echo "    make mcp-help      MCP integrations (future)"
	@echo ""
	@echo "  Quick start:"
	@echo "    make setup         Install deps + verify environment"
	@echo "    make dev           Start dev server"
	@echo "    make quality       Lint + type-check"
	@echo "    make test-all      Run all tests"
	@echo ""

# ============================================================================
# Section 2: Development
# ============================================================================

.PHONY: dev-help
dev-help: ## Show development targets
	@echo ""
	@echo "  Development Targets"
	@echo "  ==================="
	@echo "    make dev           Start Next.js dev server (localhost:3000)"
	@echo "    make build         Production build"
	@echo "    make start         Start production server"
	@echo ""

.PHONY: dev
dev: ## Start Next.js dev server
	npm run dev

.PHONY: build
build: ## Production build
	npm run build

.PHONY: start
start: ## Start production server
	npm run start

# ============================================================================
# Section 3: Quality
# ============================================================================

.PHONY: quality-help
quality-help: ## Show quality targets
	@echo ""
	@echo "  Quality Targets"
	@echo "  ==============="
	@echo "    make quality       Run lint + type-check (pre-commit gate)"
	@echo "    make lint          ESLint only"
	@echo "    make type-check    TypeScript type-check only"
	@echo ""

.PHONY: quality
quality: ## Run lint + type-check
	npm run quality

.PHONY: lint
lint: ## ESLint
	npm run lint

.PHONY: type-check
type-check: ## TypeScript type-check
	npm run type-check

# ============================================================================
# Section 4: Testing
# ============================================================================

.PHONY: test-help
test-help: ## Show testing targets
	@echo ""
	@echo "  Testing Targets"
	@echo "  ==============="
	@echo "    make test          Run Jest tests"
	@echo "    make test-unit     Run unit tests only (src/)"
	@echo "    make test-e2e      Run Playwright E2E tests"
	@echo "    make test-coverage Run Jest with coverage"
	@echo "    make test-all      Run unit + e2e sequentially with summary"
	@echo "    make test-budgets  Check test performance budgets"
	@echo ""

.PHONY: test
test: ## Run Jest tests
	npm run test

.PHONY: test-unit
test-unit: ## Run unit tests only
	npm run test:unit

.PHONY: test-e2e
test-e2e: ## Run Playwright E2E tests
	npm run test:e2e

.PHONY: test-coverage
test-coverage: ## Run Jest with coverage
	npm run test:coverage

.PHONY: test-all
test-all: ## Run all tests (unit + e2e) with summary
	@bash $(SCRIPTS_DIR)/testing/run-all-tests.sh

.PHONY: test-budgets
test-budgets: ## Check test performance budgets
	@bash $(SCRIPTS_DIR)/testing/check-budgets.sh

# ============================================================================
# Section 5: Setup
# ============================================================================

.PHONY: setup-help
setup-help: ## Show setup targets
	@echo ""
	@echo "  Setup Targets"
	@echo "  ============="
	@echo "    make setup              Full setup (install + verify + playwright)"
	@echo "    make install            Install npm dependencies"
	@echo "    make verify-env         Verify Node, npm, TypeScript versions"
	@echo "    make setup-playwright   Install Playwright browsers"
	@echo ""

.PHONY: setup
setup: install verify-env setup-playwright ## Full project setup

.PHONY: install
install: ## Install npm dependencies
	npm install

.PHONY: verify-env
verify-env: ## Verify development environment
	@bash $(SCRIPTS_DIR)/setup/verify-env.sh

.PHONY: setup-playwright
setup-playwright: ## Install Playwright browsers
	@bash $(SCRIPTS_DIR)/setup/install-playwright.sh

# ============================================================================
# Section 6: Status
# ============================================================================

.PHONY: status-help
status-help: ## Show status targets
	@echo ""
	@echo "  Status Targets"
	@echo "  =============="
	@echo "    make status        Project health overview"
	@echo ""

.PHONY: status
status: ## Show project health
	@bash $(SCRIPTS_DIR)/status/project-health.sh

# ============================================================================
# Section 7: Clean
# ============================================================================

.PHONY: clean-help
clean-help: ## Show clean targets
	@echo ""
	@echo "  Clean Targets"
	@echo "  ============="
	@echo "    make clean         Remove build artifacts (.next, coverage, tsbuildinfo)"
	@echo "    make clean-hard    Remove everything including node_modules"
	@echo ""

.PHONY: clean
clean: ## Clean build artifacts
	@bash $(SCRIPTS_DIR)/clean/clean-all.sh

.PHONY: clean-hard
clean-hard: ## Clean everything including node_modules
	@bash $(SCRIPTS_DIR)/clean/clean-all.sh --hard

# ============================================================================
# Section 8: Infrastructure
# ============================================================================

.PHONY: infra-help
infra-help: ## Show infrastructure targets
	@echo ""
	@echo "  Infrastructure Targets"
	@echo "  ======================"
	@echo "    make infra-up      Start PostgreSQL + Redis (Docker Compose)"
	@echo "    make infra-down    Stop infrastructure containers"
	@echo "    make db-migrate    Run Prisma migrations"
	@echo "    make db-studio     Open Prisma Studio (database browser)"
	@echo "    make db-seed       Seed database with sample data"
	@echo "    make health        Check service health endpoint"
	@echo ""

.PHONY: infra-up
infra-up: ## Start PostgreSQL + Redis via Docker Compose
	docker compose up -d

.PHONY: infra-down
infra-down: ## Stop infrastructure containers
	docker compose down

.PHONY: db-migrate
db-migrate: ## Run Prisma migrations
	npx prisma migrate dev

.PHONY: db-studio
db-studio: ## Open Prisma Studio
	npx prisma studio

.PHONY: db-seed
db-seed: ## Seed database
	npx prisma db seed

.PHONY: health
health: ## Check service health
	@curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || echo "Service not running"

# ============================================================================
# Section 9: MCP (Future)
# ============================================================================

.PHONY: mcp-help
mcp-help: ## Show MCP targets
	@echo ""
	@echo "  MCP Targets (Future)"
	@echo "  ===================="
	@echo "    make mcp-status    Check MCP server connectivity"
	@echo ""
	@echo "  Not yet configured. See src/server/mcp/ for integration scaffolding."
	@echo ""

.PHONY: mcp-status
mcp-status: ## Check MCP server connectivity
	@bash $(SCRIPTS_DIR)/mcp/mcp-status.sh

# ============================================================================
# Section 10: Docker (Future)
# ============================================================================

.PHONY: docker-help
docker-help: ## Show Docker targets
	@echo ""
	@echo "  Docker Targets (Future)"
	@echo "  ======================="
	@echo "    make docker-build  Build container image"
	@echo ""
	@echo "  Not yet configured."
	@echo ""

.PHONY: docker-build
docker-build: ## Build Docker image
	@bash $(SCRIPTS_DIR)/docker/docker-build.sh
