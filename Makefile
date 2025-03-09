.PHONY: all build install clean test deploy publish bump-version

# Default n8n custom nodes directory (can be overridden via environment variable)
N8N_CUSTOM_EXTENSIONS ?= ~/.n8n/custom

# Version increment type (patch, minor, or major)
VERSION_INCREMENT ?= patch

all: clean bump-version build deploy publish

# Bump version
bump-version:
	@echo "Bumping package version ($(VERSION_INCREMENT))..."
	cd $(CURDIR) && npm version $(VERSION_INCREMENT) --no-git-tag-version
	@echo "Version updated"

# Install dependencies
install:
	@echo "Installing dependencies..."
	cd $(CURDIR) && npm install

# Build the module
build: install
	@echo "Building module..."
	cd $(CURDIR) && npm run build

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cd $(CURDIR) && rm -rf dist node_modules

# Run tests
test: build
	@echo "Running tests..."
	cd $(CURDIR) && npm test

# Deploy to n8n custom nodes directory
deploy: build
	@echo "Deploying to n8n custom nodes directory: $(N8N_CUSTOM_EXTENSIONS)"
	@mkdir -p $(N8N_CUSTOM_EXTENSIONS)
	@echo "Running the install.js script to deploy correctly..."
	cd $(CURDIR) && node install.js
	@echo "Deployment complete! Restart n8n for changes to take effect."

# Publish package to npm registry
publish: build test
	@echo "Publishing package to npm registry..."
	cd $(CURDIR) && npm publish
	@echo "Package published successfully!"

# Help command
help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build the module"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make test         - Run tests"
	@echo "  make deploy       - Deploy to n8n custom nodes directory"
	@echo "  make publish      - Publish package to npm registry"
	@echo "  make bump-version - Bump package version"
	@echo "  make all          - Bump version, build and deploy (default)"
	@echo ""
	@echo "Environment variables:"
	@echo "  N8N_CUSTOM_EXTENSIONS - Custom location for n8n extensions (default: ~/.n8n/custom)"
	@echo "  VERSION_INCREMENT     - Version increment type (default: patch, options: patch, minor, major)" 