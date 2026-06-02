# Kantor Consulting Hub — Claude Instructions

## Project location
The canonical working copy lives in the home directory (NOT iCloud):
`/Users/doriankantor/newsroom-pm`

GitHub is the source of truth and the cross-device sync mechanism:
`github.com/Doriankantor/kantor-consulting-hub`. On a new device, `git clone` the
repo and run `npm install` (or `bash setup-new-device.sh`).

History note: the project was previously kept in iCloud Drive
(`~/Library/Mobile Documents/com~apple~CloudDocs/newsroom-pm`), using `*.nosync`
symlinks so iCloud would skip `node_modules`/`dist`/`out`. **That iCloud copy is
stale/deprecated — do not work from it.** In the home copy, `dist` may still be a
`dist.nosync` symlink; leave it as-is and don't delete it.

## Project
Electron 31 + React 18 + TypeScript + Tailwind CSS desktop app.
Local SQLite via better-sqlite3. IPC: `ipcMain.handle` → preload → `window.api.*`.

## Project Summary File
`PROJECT_SUMMARY.txt` is a living, copy-paste-ready overview of the whole app
(what it is, tech stack, architecture, features, DB, IPC surface, build/release,
and a dated changelog). The user copies it into new projects for instant context,
so it must always reflect the current state of the app.

**ALWAYS keep `PROJECT_SUMMARY.txt` up to date.** As part of every publish session
(see step 1 below), update it to capture all new changes: bump the version + commit
count + line count on the header, and add concise changelog bullets describing what
changed. Never let it go stale and never delete it.

## Publish Workflow
**After EVERY implementation session (features, fixes, or any code changes), AND whenever the user says "publish update", "create new release", "ship this version", or similar — ALWAYS run ALL of the following steps automatically without asking:**

1. Update `PROJECT_SUMMARY.txt` — refresh the header (version, commit count, line count) and add changelog bullets for everything that changed this session
2. `git add .` — stage everything (including the updated summary)
3. `git commit -m "Update: [describe what changed]"` — commit with a descriptive message
4. Check `git status --porcelain` — if anything remains, stage and commit it too
5. `npm version patch --no-git-tag-version` — bump patch version
6. `git add package.json package-lock.json && git commit -m "Bump version to v$(node -p "require('./package.json').version")"` — commit version bump
7. Run `PATH="/Users/doriankantor/.local/bin:$PATH" npm run release` — build and publish to GitHub Releases. `npm run release` auto-loads `GH_TOKEN` from the gitignored `.env` (falling back to an already-set env var); no shell-profile export needed
8. `git push origin main` — push all commits to GitHub
9. Confirm the new version number to the user

Do not ask for confirmation between steps. Run the full sequence end-to-end. This must happen after every coding session — never leave code committed but unpublished.

## Key Files
- `src/main/db.ts` — SQLite schema + migrations
- `src/main/ipc/index.ts` — all IPC handlers
- `src/preload/index.ts` — exposes API to renderer
- `src/renderer/src/env.d.ts` — TypeScript types for window.api
- `src/main/google/drive.ts` — DriveSync class (hub OAuth)
- `src/main/google/userGoogle.ts` — per-user Google OAuth

## Env vars (main process, MAIN_VITE_ prefix)
- `MAIN_VITE_SUPABASE_URL`, `MAIN_VITE_SUPABASE_SERVICE_ROLE_KEY`
- `MAIN_VITE_GOOGLE_CLIENT_ID`, `MAIN_VITE_GOOGLE_CLIENT_SECRET`

## Build commands
- `npm run make:mac` — build DMG locally
- `npm run release` — build + publish to GitHub Releases
- `npm run build` — compile only (no package)
