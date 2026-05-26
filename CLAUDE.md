# Kantor Consulting Hub — Claude Instructions

## Project
Electron 31 + React 18 + TypeScript + Tailwind CSS desktop app.
Local SQLite via better-sqlite3. IPC: `ipcMain.handle` → preload → `window.api.*`.

## Publish Workflow
**Whenever the user says "publish update", "create new release", "ship this version", or similar — run ALL of the following steps automatically without asking:**

1. `git add .` — stage everything
2. `git commit -m "Update: [describe what changed]"` — commit with a descriptive message
3. Check `git status --porcelain` — if anything remains, stage and commit it too
4. `npm version patch --no-git-tag-version` — bump patch version
5. `git add package.json package-lock.json && git commit -m "Bump version to v$(node -p "require('./package.json').version")"` — commit version bump
6. `npm run release` — build and publish to GitHub Releases
7. Confirm the new version number to the user

Do not ask for confirmation between steps. Run the full sequence end-to-end.

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
