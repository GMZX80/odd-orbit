#!/usr/bin/env bash
set -euo pipefail

CHROMIUM_LIB_ROOT="/home/node/.openclaw/tools/chromium-libs/root"
if [[ -d "$CHROMIUM_LIB_ROOT" ]]; then
  CHROMIUM_LOCAL_LIBS="$CHROMIUM_LIB_ROOT/usr/lib/x86_64-linux-gnu:$CHROMIUM_LIB_ROOT/lib/x86_64-linux-gnu"
  export LD_LIBRARY_PATH="$CHROMIUM_LOCAL_LIBS${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export FONTCONFIG_FILE="/home/node/.openclaw/tools/chromium-libs/fonts.conf"
  export XDG_DATA_DIRS="$CHROMIUM_LIB_ROOT/usr/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
fi

if [[ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" && -d "/home/node/.openclaw/ms-playwright" ]]; then
  export PLAYWRIGHT_BROWSERS_PATH="/home/node/.openclaw/ms-playwright"
fi

node scripts/smoke-test.mjs
