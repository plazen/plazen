# Makefile for Plazen developer commands
# Targets:
#   install   - install project dependencies (detects npm / yarn / pnpm)
#   generate  - run Prisma client generation
#   push-db   - generate Prisma client then push schema to the database
#   check     - verify .env and test database connectivity via Prisma
#   start     - run development server (npm run dev)
#
# Usage:
#   make install
#   make generate
#   make push-db
#   make check
#   make start
#
# Notes:
# - Commands use `npx prisma ...` so ensure Node is installed.
# - .env file is expected at the repo root. `check` looks for DATABASE_URL in .env.
# - Adjust PRISMA_SCHEMA variable if your schema path differs.

PRISMA_SCHEMA := ./prisma/schema.prisma
NPM := npm
YARN := yarn
PNPM := pnpm

.PHONY: help install generate push-db check start

help:
	@echo "Available targets:"
	@echo "  install   - install project dependencies (npm / yarn / pnpm detected)"
	@echo "  generate  - run 'npx prisma generate' to generate Prisma client"
	@echo "  push-db   - generate Prisma client and push the schema to the database"
	@echo "  check     - basic environment & DB health checks (.env and prisma connect)"
	@echo "  start     - run the development server (npm run dev)"
	@echo "  dev       - run the development server with dev mode enabled"

# Install dependencies using the project's lockfile if present.
install:
	@echo "Detecting package manager..."
	@if [ -f yarn.lock ]; then \
		echo "Using yarn (yarn.lock found)"; \
		$(YARN) install; \
	elif [ -f pnpm-lock.yaml ]; then \
		echo "Using pnpm (pnpm-lock.yaml found)"; \
		$(PNPM) install; \
	else \
		echo "Using npm (default)"; \
		$(NPM) ci; \
	fi
	@echo "Installing finished."

# Generate Prisma client
generate:
	@echo "Running prisma generate..."
	@npx prisma generate --schema=$(PRISMA_SCHEMA)
	@echo "Prisma generate complete."

# Push DB: generate client then push schema to the database
push-db: generate
	@echo "Pushing Prisma schema to the database..."
	@npx prisma db push --schema=$(PRISMA_SCHEMA)
	@echo "Database schema pushed."

# Basic checks:
#  - .env file exists
#  - DATABASE_URL is present in .env
#  - attempt to connect to DB using `prisma db pull`
check:
	@echo "Checking for .env file..."
	@if [ ! -f .env ]; then \
		echo "ERROR: .env file not found in repo root."; \
		echo "Copy env.example to .env and update it before running `make check`."; \
		exit 1; \
	fi
	@echo ".env found."
	@echo "Checking for DATABASE_URL in .env..."
	@if ! grep -qE '^\s*DATABASE_URL=' .env; then \
		echo "ERROR: DATABASE_URL not found in .env."; \
		exit 1; \
	fi
	@echo "DATABASE_URL found in .env."
	@echo "Attempting to connect to the database via Prisma (this will try to read DATABASE_URL from env)..."
	# Load .env into environment for the prisma command. Use `set -o allexport` to export variables.
	@set -o allexport; . ./.env; set +o allexport; \
	echo "Running: npx prisma db pull --schema=$(PRISMA_SCHEMA)"; \
	npx prisma db pull --schema=$(PRISMA_SCHEMA)
	@echo "Prisma DB check completed."

# Start dev server
start:
	@echo "Starting development server..."
	$(NPM) run dev

fulldev:
	rm .env
	cp .env.sensitive .env
	$(NPM) run dev

dev:
	cp .env .env.sensitive
	cp env.dev .env
	$(NPM) run dev
