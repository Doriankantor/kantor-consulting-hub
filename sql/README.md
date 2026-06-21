# `sql/` — database baseline & change log

This folder is the repo's record of the Supabase database for the Kantor
Consulting Hub (project ref `iatcafrpkpvyaekoxuao`). It exists because all
schema changes to date were run ad-hoc in the Supabase SQL editor and were
**never tracked anywhere** — so the database was undocumented and a rebuild
would have silently lost realtime config (the exact failure debugged on
2026-06-20).

## What's here

- **`schema_baseline.sql`** — tables, columns, primary keys, foreign keys, RLS
  enablement, and RLS policies, as of 2026-06-20. Catalog-derived snapshot
  (read-only `information_schema` / `pg_catalog` queries), **not** a `pg_dump`.
- **`realtime_config.sql`** — the `supabase_realtime` publication membership and
  `REPLICA IDENTITY FULL` settings. These are the database-side bits the app
  release doesn't carry and that schema dumps tend to miss.

## Honest scope — read this

This is a **forward-from-today baseline, not a full historical migration log.**
It captures the *current state* accurately, but it does NOT reconstruct the
step-by-step history of every change ever made, and `schema_baseline.sql` does
NOT include indexes (beyond PKs), triggers, functions, check constraints,
sequences, storage buckets, or auth config. To rebuild from zero it is a strong
starting point, not a guaranteed-complete one.

For a guaranteed-faithful full schema dump later (recommended if reproducibility
ever becomes important), install path is already done — run locally:

    supabase db dump --db-url "<DIRECT-CONNECTION-URI>" --schema public -f sql/schema_baseline.sql

(The direct connection URI is in the dashboard's **Connect** button → URI →
direct/5432. It contains the DB password — run only in your own terminal, never
paste it anywhere.)

## Going forward (the discipline this folder starts)

When you run schema SQL in the Supabase editor, **also save it here** as a dated
file, e.g. `2026-07-04_add_todo_cloud_tables.sql`, and commit it. That way the
database stays documented and every future change is reproducible — which the
boards/contacts/permissions history (pre-2026-06-20) is not.

## Realtime gotcha (bears repeating)

After adding any table to the `supabase_realtime` publication, **fully quit and
relaunch the app on every machine** before testing — a running app won't pick up
newly-published tables until its socket reconnects.
