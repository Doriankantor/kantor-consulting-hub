#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Kantor Consulting Hub — New Device Setup
#
#  Run this once on any new Mac after iCloud syncs the project folder.
#  It creates the .nosync directories (excluded from iCloud) and the symlinks
#  that npm, electron-vite, and electron-builder expect.
#
#  Usage:
#    cd ~/Library/Mobile\ Documents/com\~apple\~CloudDocs/newsroom-pm
#    bash setup-new-device.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET}  $*"; }
warn() { echo -e "${YELLOW}•${RESET}  $*"; }
fail() { echo -e "${RED}✗${RESET}  $*"; }

# Always run from this script's directory
cd "$(dirname "$0")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Kantor Consulting Hub — Device Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: Create .nosync directories ───────────────────────────────────────
# iCloud never uploads folders ending in .nosync.
# These hold node_modules, dist/, and out/ so they stay local-only.

warn "Creating .nosync directories (excluded from iCloud sync)..."
mkdir -p node_modules.nosync
mkdir -p dist.nosync
mkdir -p out.nosync
ok "Directories ready"

# ── Step 2: Create symlinks if they don't exist ───────────────────────────────
# npm, electron-vite, and electron-builder use these paths.

if [ ! -L "node_modules" ]; then
  ln -s node_modules.nosync node_modules
  ok "Symlink created: node_modules → node_modules.nosync"
else
  ok "node_modules symlink already exists"
fi

if [ ! -L "dist" ]; then
  ln -s dist.nosync dist
  ok "Symlink created: dist → dist.nosync"
else
  ok "dist symlink already exists"
fi

if [ ! -L "out" ]; then
  ln -s out.nosync out
  ok "Symlink created: out → out.nosync"
else
  ok "out symlink already exists"
fi

# ── Step 3: Install npm dependencies ─────────────────────────────────────────
warn "Installing npm dependencies (this takes ~30s)..."
npm install
ok "Dependencies installed"

# ── Step 4: Verify build ──────────────────────────────────────────────────────
warn "Running a quick build to verify everything works..."
npm run build > /dev/null 2>&1 && ok "Build verified" || { fail "Build failed — run 'npm run build' manually to see errors"; exit 1; }

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Setup complete! You're ready to develop."
echo ""
echo "  Development:  npm run dev"
echo "  Build:        npm run build"
echo "  Release:      double-click publish.command"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
