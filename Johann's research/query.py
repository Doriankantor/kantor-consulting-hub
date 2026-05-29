#!/usr/bin/env python3
"""Query diabetes_migrants.db.

Usage:
    python3 query.py "SELECT * FROM studies LIMIT 5"
    python3 query.py --question "which studies found worse mortality in migrants?"

SQL runs read-only. --question translates English to SQL via the Anthropic API
(needs ANTHROPIC_API_KEY); it prints the generated SQL before running it.
"""
import argparse
import json
import os
import sqlite3
import sys
import urllib.request

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diabetes_migrants.db")
MODEL = os.environ.get("QUERY_MODEL", "claude-sonnet-4-6")
MAX_W = 60  # display truncation width per column


def connect_ro():
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)


def schema_text(conn):
    """Live CREATE statements so the NL prompt never drifts from the DB."""
    rows = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('studies','outcomes')"
    ).fetchall()
    return "\n\n".join(r[0] for r in rows)


def run_sql(conn, sql):
    cur = conn.execute(sql)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    return cols, rows


def fmt_cell(v):
    if v is None:
        return "NULL"
    t = str(v)
    return t if len(t) <= MAX_W else t[: MAX_W - 1] + "…"


def print_table(cols, rows):
    if not cols:
        print("(no result set)")
        return
    disp = [[fmt_cell(v) for v in row] for row in rows]
    widths = [len(c) for c in cols]
    for row in disp:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    line = lambda cells: " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells))
    print(line(cols))
    print("-+-".join("-" * w for w in widths))
    for row in disp:
        print(line(row))


def translate(question, conn):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit(
            "ANTHROPIC_API_KEY not set — --question needs it.\n"
            "Either export the key, or just ask Claude in-session to translate "
            "your question and run it with this script."
        )
    system = (
        "You translate questions into a single read-only SQLite SELECT query for this schema. "
        "Output ONLY the SQL — no markdown, no commentary, no trailing semicolon needed. "
        "Join studies and outcomes when the question spans both. "
        "Prefer the *_norm / normalized columns for categorical grouping "
        "(direction_norm, outcome_category_norm, measure_type_norm, quality_class, "
        "health_system_type).\n\nSCHEMA:\n" + schema_text(conn)
    )
    payload = {
        "model": MODEL,
        "max_tokens": 600,
        "system": [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
        ],
        "messages": [{"role": "user", "content": question}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req) as resp:
        body = json.load(resp)
    sql = "".join(b.get("text", "") for b in body.get("content", [])).strip()
    if sql.startswith("```"):
        sql = sql.strip("`")
        sql = sql[sql.find("\n") + 1 :] if "\n" in sql else sql
        sql = sql.replace("sql", "", 1).strip() if sql.lstrip().startswith("sql") else sql
    return sql.strip().rstrip(";")


def main():
    ap = argparse.ArgumentParser(description="Query diabetes_migrants.db")
    ap.add_argument("sql", nargs="?", help="SQL string to run (read-only)")
    ap.add_argument("--question", "-q", help="Natural-language question (needs ANTHROPIC_API_KEY)")
    args = ap.parse_args()

    if not args.sql and not args.question:
        ap.error("provide a SQL string or --question \"...\"")

    conn = connect_ro()
    try:
        if args.question:
            sql = translate(args.question, conn)
            print(f"SQL:\n  {sql}\n")
        else:
            sql = args.sql
        cols, rows = run_sql(conn, sql)
    except sqlite3.Error as e:
        sys.exit(f"SQL error: {e}")
    finally:
        conn.close()

    print_table(cols, rows)
    print(f"\n{len(rows)} row{'s' if len(rows) != 1 else ''}")


if __name__ == "__main__":
    main()
