#!/bin/bash
# Kantor Consulting Hub — Installer
# Usage: curl -sL https://raw.githubusercontent.com/Doriankantor/kantor-consulting-hub/main/install.sh | bash

set -e

REPO="Doriankantor/kantor-consulting-hub"
APP_NAME="Kantor Consulting Hub"
VOLUME="/Volumes/${APP_NAME}"
INSTALL_PATH="/Applications/${APP_NAME}.app"
TMP_DMG="/tmp/KantorConsultingHub.dmg"

echo ""
echo "  Installing ${APP_NAME}..."
echo ""

# Get latest version tag
VERSION=$(curl -sfL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
  echo "  ✗ Could not fetch latest version. Check your internet connection."
  exit 1
fi

VERSION_NUM="${VERSION#v}"
DMG_URL="https://github.com/${REPO}/releases/download/${VERSION}/KantorConsultingHub-${VERSION_NUM}.dmg"

echo "  Version: ${VERSION}"
echo "  Downloading..."

# Download DMG
curl -sL --progress-bar "${DMG_URL}" -o "${TMP_DMG}"

# Strip macOS quarantine so it opens without security warnings
xattr -cr "${TMP_DMG}" 2>/dev/null || true

# Mount DMG
hdiutil attach "${TMP_DMG}" -nobrowse -quiet

# Copy to Applications (replace existing if present)
if [ -d "${INSTALL_PATH}" ]; then
  rm -rf "${INSTALL_PATH}"
fi
cp -R "${VOLUME}/${APP_NAME}.app" /Applications/

# Strip quarantine from installed app
xattr -cr "${INSTALL_PATH}" 2>/dev/null || true

# Unmount and clean up
hdiutil detach "${VOLUME}" -quiet 2>/dev/null || true
rm -f "${TMP_DMG}"

echo ""
echo "  ✓ ${APP_NAME} ${VERSION} installed successfully."
echo "  Open it from your Applications folder."
echo ""
