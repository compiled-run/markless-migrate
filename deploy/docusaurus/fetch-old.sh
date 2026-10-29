#!/usr/bin/env bash
# Fetches the old site into old/static: docusaurus.io's own build (facebook/docusaurus website/ at 7b6826b, `BUILD_FAST=true
# docusaurus build --locale en`, analytics tags removed by build.ts old), the build deployed as mm-docusaurus-old, from a release.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE=https://github.com/compiled-run/markless-migrate/releases/download/docusaurus-old-7b6826b/docusaurus-old-7b6826b.tar.gz
rm -rf "$DIR/old/static" && mkdir -p "$DIR/old"
curl -fsSL "$ARCHIVE" | tar -xz -C "$DIR/old"
