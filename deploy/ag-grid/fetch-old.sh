#!/usr/bin/env bash
# Fetches the old app, electron/devtron (MIT), at the commit this migration was made against, and builds its devtools panel.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT=e6a45e31e739b1de1ca095284c7f87e9f1d4fbb5
[ -d "$DIR/old/.git" ] || git clone --quiet https://github.com/electron/devtron.git "$DIR/old"
git -C "$DIR/old" fetch --quiet --depth 1 origin "$COMMIT" && git -C "$DIR/old" checkout --quiet "$COMMIT"
(cd "$DIR/old" && corepack yarn install --immutable && corepack yarn build:browser)
# The panel's own source, without the Electron main-process library (src/index.ts, src/lib) and its specs: what --source scans.
rm -rf "$DIR/old-panel" && mkdir -p "$DIR/old-panel"
(cd "$DIR/old" && tar cf - package.json tsconfig.json tailwind.config.js postcss.config.js manifest.json webpack.extension.config.ts src/extension src/types src/common) | (cd "$DIR/old-panel" && tar xf -)
ln -s ../old/node_modules "$DIR/old-panel/node_modules"
