#!/usr/bin/env python3
"""Build diabetes_migrants.db from Solo_resultados.xlsx (Sheet1)."""
import os
import re
import sqlite3
from pathlib import Path

import openpyxl

XLSX = "/Users/doriankantor/Downloads/Solo_resultados.xlsx"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diabetes_migrants.db")

NULL_TOKENS = {"", "nr", "na", "n/a", "-", "—", "–"}
NUM_RE = re.compile(r"[-−]?\d[\d,]*\.?\d*")
NEQ_RE = re.compile(r"^[Nn]\s*=\s*")


def s(v):
    """Stripped string or None."""
    if v is None:
        return None
    t = str(v).strip()
    return t if t else None


def num(v):
    """Parse leading numeric from a value; NR-family/blank -> None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    t = str(v).strip()
    # leading token (before first space/paren) — catches "NR (note...)" etc.
    lead = re.split(r"[\s(]", t.lower(), 1)[0]
    if lead in NULL_TOKENS:
        return None
    t = NEQ_RE.sub("", t)              # drop a leading "N=" / "n ="
    m = NUM_RE.match(t)               # anchored: only parse when value starts numeric
    if not m:
        return None
    tok = m.group(0).replace(",", "").replace("−", "-")
    try:
        f = float(tok)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def year_int(v):
    n = num(v)
    return int(n) if n is not None else None


# --- normalizers ---
def norm_quality(v):
    t = (s(v) or "").lower()
    if t.startswith("high"):
        return "High"
    if t.startswith("mod"):
        return "Moderate"
    if t.startswith("low"):
        return "Low"
    return None


def norm_measure(v):
    t = (s(v) or "").upper()
    if not t:
        return None
    if "HR" in t:
        return "HR"
    if "RR" in t:
        return "RR"
    if "OR" in t:
        return "OR"
    if "MD" in t or "MEAN DIFF" in t:
        return "MD"
    if "PROPORTION" in t:
        return "Proportion"
    return None


def norm_direction(v):
    t = (s(v) or "").lower()
    if not t:
        return None
    if t.startswith("inconclusive"):
        return "Inconclusive"
    if t.startswith("equal"):
        return "Equal"
    if "worse" in t:
        return "Worse in migrants"
    if "better" in t:
        return "Better in migrants"
    return None


def norm_category(v, name=None):
    t = (s(v) or "").lower()
    nm = (s(name) or "").lower()
    if not t:
        return None
    if "process" in t:
        return "Process-of-Care"
    if "glycemic" in t or "glycaemic" in t:
        return "Glycemic Control"
    if "utiliz" in t or "utilis" in t:
        return "Healthcare Utilization"
    if "acute" in t:
        return "Acute"
    if "microvascular" in t:
        return "Microvascular"
    has_macro = "macrovascular" in t
    has_mort = "mortality" in t
    if has_macro and has_mort:
        # MACE composite (nonfatal+fatal) -> Macrovascular; pure cause-specific death -> Mortality
        is_composite = "composite" in t or "composite" in nm or "event or" in nm
        return "Macrovascular" if is_composite else "Mortality"
    if has_mort:
        return "Mortality"
    if has_macro:
        return "Macrovascular"
    return None


def norm_health(v):
    t = (s(v) or "").lower()
    if not t:
        return None
    if t.startswith("universal"):
        return "Universal"
    if t.startswith("mixed"):
        return "Mixed"
    if "fragmented" in t or "private" in t:
        return "Fragmented-Private"
    return None


# column indices (1-based) keyed by field label
C = {
    "author": 1, "year": 2, "data_period": 3, "title": 4, "migrant_definition": 5,
    "dest_country": 6, "origin_region": 7, "health_system": 8, "study_design": 9,
    "journal": 10, "n_total": 11, "n_migrants": 12, "n_comparators": 13,
    "mean_age": 14, "pct_women": 15, "migration_type": 16, "mean_length_stay": 17,
    "other_pop": 18, "quality_tool": 19, "quality_class": 20, "quality_limitations": 21,
    "comparison_desc": 22, "outcome_name": 23, "outcome_category": 24, "measure_type": 25,
    "migrants_value": 26, "comparator_value": 27, "effect_estimate": 28, "ci_low": 29,
    "ci_high": 30, "p_value": 31, "significance": 32, "direction": 33, "magnitude": 34,
    "supports_hypothesis": 35, "barriers": 36, "strategies_policies": 37,
    "primary_outcome": 38,
}

STUDY_LEVEL = [
    "author", "year", "data_period", "title", "migrant_definition", "dest_country",
    "origin_region", "health_system", "study_design", "journal", "n_total", "n_migrants",
    "n_comparators", "mean_age", "pct_women", "migration_type", "mean_length_stay",
    "other_pop", "quality_tool", "quality_class", "quality_limitations", "barriers",
    "strategies_policies", "primary_outcome",
]

FIRST_DATA_ROW, LAST_DATA_ROW = 4, 121


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["Sheet1"]

    def g(r, key):
        return ws.cell(r, C[key]).value

    # --- pass 1: identify study blocks & gather study-level snapshots ---
    studies = []          # list of dicts
    row_to_study = {}     # data row -> study_id
    last_comparison = None
    for r in range(FIRST_DATA_ROW, LAST_DATA_ROW + 1):
        if s(g(r, "author")):                      # new study begins
            sid = len(studies) + 1
            snap = {k: g(r, k) for k in STUDY_LEVEL}
            studies.append({"study_id": sid, "_raw": snap})
            last_comparison = None
        row_to_study[r] = len(studies)             # current study id

    # --- build & populate DB ---
    Path(DB).unlink(missing_ok=True)
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE studies (
            study_id INTEGER PRIMARY KEY,
            author TEXT, year INTEGER, data_period TEXT, title TEXT,
            migrant_definition TEXT, dest_country TEXT, origin_region TEXT,
            health_system TEXT, health_system_type TEXT,
            study_design TEXT, journal TEXT,
            n_total INTEGER, n_total_raw TEXT,
            n_migrants INTEGER, n_migrants_raw TEXT,
            n_comparators INTEGER, n_comparators_raw TEXT,
            mean_age TEXT, pct_women TEXT, migration_type TEXT,
            mean_length_stay TEXT, other_pop TEXT,
            quality_tool TEXT, quality_class_raw TEXT, quality_class TEXT,
            quality_limitations TEXT,
            barriers TEXT, strategies_policies TEXT, primary_outcome TEXT
        );
        CREATE TABLE outcomes (
            outcome_id INTEGER PRIMARY KEY,
            study_id INTEGER NOT NULL REFERENCES studies(study_id),
            comparison_desc TEXT,
            outcome_name TEXT,
            outcome_category TEXT, outcome_category_norm TEXT,
            measure_type TEXT, measure_type_norm TEXT,
            migrants_value REAL, migrants_value_raw TEXT,
            comparator_value REAL, comparator_value_raw TEXT,
            effect_estimate REAL, effect_estimate_raw TEXT,
            ci_low REAL, ci_low_raw TEXT,
            ci_high REAL, ci_high_raw TEXT,
            p_value TEXT,
            significance TEXT,
            direction TEXT, direction_norm TEXT,
            magnitude TEXT,
            supports_hypothesis TEXT
        );
        """
    )

    for st in studies:
        raw = st["_raw"]
        cur.execute(
            """INSERT INTO studies VALUES (
                :study_id,:author,:year,:data_period,:title,:migrant_definition,
                :dest_country,:origin_region,:health_system,:health_system_type,
                :study_design,:journal,
                :n_total,:n_total_raw,:n_migrants,:n_migrants_raw,
                :n_comparators,:n_comparators_raw,
                :mean_age,:pct_women,:migration_type,:mean_length_stay,:other_pop,
                :quality_tool,:quality_class_raw,:quality_class,:quality_limitations,
                :barriers,:strategies_policies,:primary_outcome)""",
            {
                "study_id": st["study_id"],
                "author": s(raw["author"]),
                "year": year_int(raw["year"]),
                "data_period": s(raw["data_period"]),
                "title": s(raw["title"]),
                "migrant_definition": s(raw["migrant_definition"]),
                "dest_country": s(raw["dest_country"]),
                "origin_region": s(raw["origin_region"]),
                "health_system": s(raw["health_system"]),
                "health_system_type": norm_health(raw["health_system"]),
                "study_design": s(raw["study_design"]),
                "journal": s(raw["journal"]),
                "n_total": num(raw["n_total"]),
                "n_total_raw": s(raw["n_total"]),
                "n_migrants": num(raw["n_migrants"]),
                "n_migrants_raw": s(raw["n_migrants"]),
                "n_comparators": num(raw["n_comparators"]),
                "n_comparators_raw": s(raw["n_comparators"]),
                "mean_age": s(raw["mean_age"]),
                "pct_women": s(raw["pct_women"]),
                "migration_type": s(raw["migration_type"]),
                "mean_length_stay": s(raw["mean_length_stay"]),
                "other_pop": s(raw["other_pop"]),
                "quality_tool": s(raw["quality_tool"]),
                "quality_class_raw": s(raw["quality_class"]),
                "quality_class": norm_quality(raw["quality_class"]),
                "quality_limitations": s(raw["quality_limitations"]),
                "barriers": s(raw["barriers"]),
                "strategies_policies": s(raw["strategies_policies"]),
                "primary_outcome": s(raw["primary_outcome"]),
            },
        )

    # --- pass 2: outcome rows with comparison_desc forward-fill within study ---
    oid = 0
    last_comparison = None
    cur_study = None
    for r in range(FIRST_DATA_ROW, LAST_DATA_ROW + 1):
        sid = row_to_study[r]
        if sid != cur_study:                # entered a new study block
            cur_study = sid
            last_comparison = None
        comp = s(g(r, "comparison_desc"))
        if comp:
            last_comparison = comp
        oid += 1
        cur.execute(
            """INSERT INTO outcomes VALUES (
                :outcome_id,:study_id,:comparison_desc,:outcome_name,
                :outcome_category,:outcome_category_norm,:measure_type,:measure_type_norm,
                :migrants_value,:migrants_value_raw,:comparator_value,:comparator_value_raw,
                :effect_estimate,:effect_estimate_raw,:ci_low,:ci_low_raw,
                :ci_high,:ci_high_raw,:p_value,:significance,
                :direction,:direction_norm,:magnitude,:supports_hypothesis)""",
            {
                "outcome_id": oid,
                "study_id": sid,
                "comparison_desc": last_comparison,
                "outcome_name": s(g(r, "outcome_name")),
                "outcome_category": s(g(r, "outcome_category")),
                "outcome_category_norm": norm_category(
                    g(r, "outcome_category"), g(r, "outcome_name")
                ),
                "measure_type": s(g(r, "measure_type")),
                "measure_type_norm": norm_measure(g(r, "measure_type")),
                "migrants_value": num(g(r, "migrants_value")),
                "migrants_value_raw": s(g(r, "migrants_value")),
                "comparator_value": num(g(r, "comparator_value")),
                "comparator_value_raw": s(g(r, "comparator_value")),
                "effect_estimate": num(g(r, "effect_estimate")),
                "effect_estimate_raw": s(g(r, "effect_estimate")),
                "ci_low": num(g(r, "ci_low")),
                "ci_low_raw": s(g(r, "ci_low")),
                "ci_high": num(g(r, "ci_high")),
                "ci_high_raw": s(g(r, "ci_high")),
                "p_value": s(g(r, "p_value")),
                "significance": s(g(r, "significance")),
                "direction": s(g(r, "direction")),
                "direction_norm": norm_direction(g(r, "direction")),
                "magnitude": s(g(r, "magnitude")),
                "supports_hypothesis": s(g(r, "supports_hypothesis")),
            },
        )

    conn.commit()

    # --- report ---
    def q(sql):
        return cur.execute(sql).fetchall()

    print("=== ROW COUNTS ===")
    nst = q("SELECT COUNT(*) FROM studies")[0][0]
    nout = q("SELECT COUNT(*) FROM outcomes")[0][0]
    print(f"studies : {nst}  ({'OK' if nst == 13 else 'MISMATCH! expected 13'})")
    print(f"outcomes: {nout}  ({'OK' if nout == 118 else 'MISMATCH! expected 118'})")

    print("\n=== AUTHORS & OUTCOME COUNTS ===")
    for sid, auth, n in q(
        """SELECT s.study_id, s.author, COUNT(o.outcome_id)
           FROM studies s LEFT JOIN outcomes o ON o.study_id=s.study_id
           GROUP BY s.study_id ORDER BY s.study_id"""
    ):
        print(f"  {sid:2}. {auth[:45]:45} {n:3}")

    print("\n=== OUTCOMES BY direction_norm ===")
    for d, n in q(
        "SELECT COALESCE(direction_norm,'(null)'), COUNT(*) FROM outcomes "
        "GROUP BY direction_norm ORDER BY COUNT(*) DESC"
    ):
        print(f"  {n:3} | {d}")

    print("\n=== OUTCOMES BY outcome_category_norm ===")
    for cval, n in q(
        "SELECT COALESCE(outcome_category_norm,'(null)'), COUNT(*) FROM outcomes "
        "GROUP BY outcome_category_norm ORDER BY COUNT(*) DESC"
    ):
        print(f"  {n:3} | {cval}")

    conn.close()


if __name__ == "__main__":
    main()
