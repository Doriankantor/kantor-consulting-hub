# Publish Update

Run all steps automatically in order — no manual input needed.

## Steps

```bash
# 1. Stage all changes
git add .

# 2. Commit with descriptive message
git commit -m "Update: $ARGUMENTS"

# 3. Check for any remaining uncommitted changes and commit them
git status --porcelain | grep -q . && git add . && git commit -m "Update: additional changes" || true

# 4. Bump the patch version (no git tag)
npm version patch --no-git-tag-version

# 5. Commit the version bump
git add package.json package-lock.json
NEW_VERSION=$(node -p "require('./package.json').version")
git commit -m "Bump version to v$NEW_VERSION"

# 6. Build and publish to GitHub Releases
npm run release

# 7. Confirm
echo "Released v$NEW_VERSION successfully"
```

## Trigger phrases
Run this workflow whenever the user says any of:
- "publish update"
- "create new release"
- "ship this version"
- "publish this"
- "release this"

## Notes
- If `npm run release` fails due to a missing GH_TOKEN, remind the user to set `GH_TOKEN` in their environment.
- Always confirm the final version number at the end.
- The commit message for step 2 should summarize what actually changed in this update, not just say "Update:".
