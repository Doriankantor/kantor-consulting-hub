#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Kantor Consulting Hub — One-click publisher
#  Double-click this file in Finder to build & release a new version.
# ─────────────────────────────────────────────────────────────────────────────

# ── Load shell environment (picks up GH_TOKEN, nvm, etc.) ────────────────────
source ~/.zprofile 2>/dev/null || true
source ~/.zshrc    2>/dev/null || true

# ── Always cd to this script's directory (works from any Finder location) ────
cd "$(dirname "$0")"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET}  $*"; }
warn() { echo -e "${YELLOW}•${RESET}  $*"; }
fail() { echo -e "${RED}✗${RESET}  $*"; }

# ── macOS notification helper ─────────────────────────────────────────────────
notify() { osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null || true; }

# ── On any error: notify, print message, keep window open ────────────────────
trap 'fail "Release failed — see above for details."; \
      notify "Release Failed ✗" "Kantor Hub release failed — check Terminal."; \
      echo ""; read -p "Press Enter to close..." _' ERR

set -e   # exit on first error (trap above catches it)

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Kantor Consulting Hub — Release Publisher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Guard: GH_TOKEN must be set ───────────────────────────────────────────────
if [ -z "$GH_TOKEN" ]; then
  fail "GH_TOKEN is not set."
  echo "  Add this line to ~/.zprofile and reopen Terminal:"
  echo "  export GH_TOKEN=ghp_yourtoken"
  echo ""
  read -p "Press Enter to close..." _
  exit 1
fi
ok "GH_TOKEN found"

# ── Stage everything ──────────────────────────────────────────────────────────
git add .

# ── Commit only when there are staged changes ─────────────────────────────────
if git diff --cached --quiet; then
  warn "No source changes — skipping commit"
else
  COMMIT_MSG="Update: $(date '+%Y-%m-%d %H:%M')"
  git commit -m "$COMMIT_MSG"
  ok "Committed: $COMMIT_MSG"
fi

# ── Bump patch version ────────────────────────────────────────────────────────
npm version patch --no-git-tag-version --silent
NEW_VERSION=$(node -p "require('./package.json').version")
ok "Version bumped to v$NEW_VERSION"

# ── Commit version bump ───────────────────────────────────────────────────────
git add package.json package-lock.json
git commit -m "Bump version to v$NEW_VERSION"
ok "Version commit created"

# ── Push to GitHub ────────────────────────────────────────────────────────────
echo ""
warn "Pushing to GitHub..."
git push origin main
ok "Pushed to GitHub"

# ── Build + publish ───────────────────────────────────────────────────────────
echo ""
warn "Building universal DMG and publishing to GitHub Releases..."
warn "(This takes 3–5 minutes — do not close this window)"
echo ""

notify "Publishing Kantor Hub..." "Building v$NEW_VERSION — this takes a few minutes."

npm run release

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "v$NEW_VERSION published to GitHub Releases!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

notify "Release Published ✓" "Kantor Hub v$NEW_VERSION is live on GitHub Releases."

read -p "Press Enter to close..." _
