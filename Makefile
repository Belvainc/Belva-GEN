# ============================================================================
# Belva-GEN Makefile
# ============================================================================
# This Makefile is a menu system and developer guide. All non-trivial logic
# lives in scripts/ — the Makefile only delegates.
#
# Infrastructure: Homebrew (PostgreSQL@15, Redis)
# Matches belva-goat2 pattern. No Docker required for dev.
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

# Infrastructure
PG_SERVICE    := postgresql@15
REDIS_SERVICE := redis
DB_NAME       := belva_gen_dev
DB_USER       := james
DB_HOST       := localhost
DB_PORT       := 5432

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
	@echo "    make infra-help    Infrastructure (database, redis)"
	@echo "    make mcp-help      MCP integrations (future)"
	@echo ""
	@echo "  Quick start:"
	@echo "    make setup         Install deps + verify environment"
	@echo "    make infra-up      Start PostgreSQL + Redis (brew services)"
	@echo "    make db-create     Create belva_gen_dev database"
	@echo "    make db-migrate    Run Prisma migrations"
	@echo "    make db-seed       Seed admin user"
	@echo "    make dev           Start dev server"
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
	@echo "    make setup-env          Create .env.local from .env.example"
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

.PHONY: setup-env
setup-env: ## Create .env.local from .env.example (if not exists)
	@if [ -f .env.local ]; then \
		echo "  .env.local already exists — skipping"; \
	else \
		cp .env.example .env.local; \
		echo "  Created .env.local from .env.example"; \
		echo "  Review and update values as needed."; \
	fi

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
# Section 8: Infrastructure (Homebrew)
# ============================================================================
# Uses Homebrew services for PostgreSQL@15 and Redis (same as belva-goat2).
# Database: belva_gen_dev (separate from belva_goat_dev to avoid collision).
# User: james (local macOS user, matches goat2 convention).
# ============================================================================

.PHONY: infra-help
infra-help: ## Show infrastructure targets
	@echo ""
	@echo "  Infrastructure Targets (Homebrew)"
	@echo "  =================================="
	@echo ""
	@echo "  Services:"
	@echo "    make infra-up        Start PostgreSQL + Redis (brew services)"
	@echo "    make infra-down      Stop PostgreSQL + Redis (brew services)"
	@echo "    make infra-status    Check service status"
	@echo ""
	@echo "  Database:"
	@echo "    make db-create       Create belva_gen_dev database"
	@echo "    make db-drop         Drop belva_gen_dev database"
	@echo "    make db-migrate      Run Prisma migrations"
	@echo "    make db-seed         Seed admin user (admin@belva.dev)"
	@echo "    make db-reset        Drop + create + migrate + seed"
	@echo "    make db-studio       Open Prisma Studio (database browser)"
	@echo ""
	@echo "  Health:"
	@echo "    make db-health       Check PostgreSQL + Redis connectivity"
	@echo "    make health          Check service health endpoint"
	@echo ""

# ─── Service Management ─────────────────────────────────────────────────────

.PHONY: infra-up
infra-up: ## Start PostgreSQL + Redis via Homebrew
	@echo "Starting PostgreSQL@15..."
	@brew services start $(PG_SERVICE) 2>/dev/null || true
	@echo "Starting Redis..."
	@brew services start $(REDIS_SERVICE) 2>/dev/null || true
	@sleep 1
	@$(MAKE) --no-print-directory infra-status

.PHONY: infra-down
infra-down: ## Stop PostgreSQL + Redis via Homebrew
	@echo "Stopping PostgreSQL@15..."
	@brew services stop $(PG_SERVICE) 2>/dev/null || true
	@echo "Stopping Redis..."
	@brew services stop $(REDIS_SERVICE) 2>/dev/null || true
	@echo "Services stopped."

.PHONY: infra-status
infra-status: ## Check PostgreSQL + Redis service status
	@echo ""
	@echo "  Service Status"
	@echo "  =============="
	@printf "  PostgreSQL@15:  "
	@if pg_isready -h $(DB_HOST) -p $(DB_PORT) -q 2>/dev/null; then \
		echo "✓ running (port $(DB_PORT))"; \
	else \
		echo "✗ not running"; \
	fi
	@printf "  Redis:          "
	@if redis-cli ping 2>/dev/null | grep -q PONG; then \
		echo "✓ running (port 6379)"; \
	else \
		echo "✗ not running"; \
	fi
	@printf "  Database:       "
	@if psql -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) -d $(DB_NAME) -c "SELECT 1" >/dev/null 2>&1; then \
		echo "✓ $(DB_NAME) exists"; \
	else \
		echo "✗ $(DB_NAME) not found (run: make db-create)"; \
	fi
	@echo ""

# ─── Database Management ─────────────────────────────────────────────────────

.PHONY: db-create
db-create: ## Create belva_gen_dev database
	@if psql -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) -lqt | cut -d \| -f 1 | grep -qw $(DB_NAME); then \
		echo "  Database $(DB_NAME) already exists."; \
	else \
		createdb -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) $(DB_NAME); \
		echo "  Created database: $(DB_NAME)"; \
	fi

.PHONY: db-drop
db-drop: ## Drop belva_gen_dev database (with confirmation)
	@echo "This will permanently delete the $(DB_NAME) database."
	@read -p "  Type '$(DB_NAME)' to confirm: " confirm; \
	if [ "$$confirm" = "$(DB_NAME)" ]; then \
		dropdb -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) --if-exists $(DB_NAME); \
		echo "  Dropped database: $(DB_NAME)"; \
	else \
		echo "  Aborted."; \
	fi

.PHONY: db-migrate
db-migrate: ## Run Prisma migrations
	npx prisma migrate dev

.PHONY: db-seed
db-seed: ## Seed admin user
	npx prisma db seed

.PHONY: db-reset
db-reset: ## Drop + create + migrate + seed (full reset)
	@echo "Resetting database $(DB_NAME)..."
	@dropdb -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) --if-exists $(DB_NAME)
	@createdb -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) $(DB_NAME)
	@echo "  Database recreated."
	npx prisma migrate dev
	npx prisma db seed
	@echo "  Database reset complete."

.PHONY: db-studio
db-studio: ## Open Prisma Studio
	npx prisma studio

# ─── Health Checks ───────────────────────────────────────────────────────────

.PHONY: db-health
db-health: ## Check PostgreSQL + Redis connectivity
	@echo ""
	@echo "  Database Health"
	@echo "  ==============="
	@printf "  PostgreSQL:  "
	@if pg_isready -h $(DB_HOST) -p $(DB_PORT) -q 2>/dev/null; then \
		echo "✓ accepting connections"; \
	else \
		echo "✗ not accepting connections (run: make infra-up)"; \
	fi
	@printf "  Redis:       "
	@if redis-cli ping 2>/dev/null | grep -q PONG; then \
		echo "✓ PONG"; \
	else \
		echo "✗ not responding (run: make infra-up)"; \
	fi
	@printf "  Database:    "
	@if psql -U $(DB_USER) -h $(DB_HOST) -p $(DB_PORT) -d $(DB_NAME) -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" -t 2>/dev/null; then \
		echo "tables in public schema"; \
	else \
		echo "✗ cannot connect to $(DB_NAME)"; \
	fi
	@echo ""

.PHONY: health
health: ## Check service health endpoint
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
# Section 10: Docker (Optional — for CI/production)
# ============================================================================

.PHONY: docker-help
docker-help: ## Show Docker targets
	@echo ""
	@echo "  Docker Targets (CI/Production)"
	@echo "  ==============================="
	@echo "    make docker-build  Build container image"
	@echo ""
	@echo "  Local dev uses Homebrew services (make infra-up)."
	@echo "  Docker is for CI pipelines and production deployment."
	@echo ""

.PHONY: docker-build
docker-build: ## Build Docker image
	@bash $(SCRIPTS_DIR)/docker/docker-build.sh
