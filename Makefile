.DEFAULT_GOAL := help

.PHONY: help install sync run dev test lock clean catalog-count

help: ## Show this help menu
	@echo "======================================================"
	@echo " Open-Card Development & Management Commands"
	@echo "======================================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo "======================================================"

install: ## Install dependencies and sync virtualenv using uv
	uv sync

sync: install ## Alias for install

run: ## Start the Open-Card Flask server
	uv run app.py

dev: run ## Alias for run

test: ## Run the full unit and integration test suite
	uv run python -m unittest discover tests -v

lock: ## Update dependencies and generate uv.lock
	uv lock

clean: ## Remove temporary python cache and OS artifacts
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.py[cod]" -delete 2>/dev/null || true
	find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	@echo "Cleaned up cache and temporary files."

catalog-count: ## Count total card images indexed in the catalog/ directory
	@count=$$(find catalog -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.webp" \) | wc -l | tr -d ' '); \
	echo "Total card images in catalog/: $$count"
