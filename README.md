# Kantor Consulting Hub

Electron 31 + React 18 + TypeScript + Tailwind desktop app. See
`PROJECT_SUMMARY.txt` for the full architecture/feature overview and
`CLAUDE.md` for working conventions.

## Build & release

| Command | What it does |
|---|---|
| `npm run dev` | electron-vite dev (hot reload) |
| `npm run build` | compile only (no package) |
| `npm run make:mac` | build universal macOS DMG locally |
| `npm run package` | build installers locally (no publish) |
| `npm run release` | build + publish mac & win installers to GitHub Releases |
| `npm run prune:installers` | manually run the installer retention prune |

`npm run release` auto-loads `GH_TOKEN` from the gitignored `.env` (falling back
to an already-set env var).

## Build-installer retention rule

**Retain only the latest + one previous build installer; older installers are
auto-pruned on build. Never deletes source, config, env, databases,
node_modules, or caches.**

- Implemented in `scripts/prune-installers.mjs` and wired into the `package`,
  `make:mac`, and `release` npm scripts (runs after each build/publish).
- **Strictly scoped:** it only ever operates on installer files
  (`*.dmg`, `*.exe`, `*.AppImage`, `*.zip`, `*.blockmap`) at the top level of the
  build-output directory (`dist/`, per `electron-builder.yml` →
  `directories.output`). The target directory is hard-coded relative to the
  script and is **not** taken from any argument or environment variable, so the
  prune cannot be pointed elsewhere. It does not recurse, runs no cron, and does
  nothing unattended outside a build.
- Files without a parseable `x.y.z` version are never touched, and a protected
  extension denylist (`.db`/`.sqlite`/`.sqlite3`/`.yml`/`.json`/`.env`/source)
  hard-blocks non-installers as defense-in-depth.
- To change how many builds are kept, edit `KEEP_VERSIONS` in
  `scripts/prune-installers.mjs`.
