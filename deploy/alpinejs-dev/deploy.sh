#!/usr/bin/env bash
# Builds and deploys the alpinejs.dev migration: deploy/alpinejs-dev/deploy.sh new|front (see deploy/htmx-org/deploy.sh).
exec "$(dirname "${BASH_SOURCE[0]}")/../htmx-org/deploy.sh" "${1:-}" alpinejs-dev https://alpinejs.dev
