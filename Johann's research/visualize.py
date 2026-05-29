#!/usr/bin/env python3
"""Charts for diabetes_migrants.db. Saves PNGs to ./charts/.

Reusable functions:
    forest_plot(filter_sql=None)      effect estimates + CI, one row per outcome
    direction_by_category()           stacked bars: direction within each category
    quality_overview()                study quality + health-system summary
    significance_breakdown()          significant vs not, overall and per category
"""
import os
import sqlite3

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diabetes_migrants.db")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "charts")
os.makedirs(OUT, exist_ok=True)

# Okabe-Ito colorblind-safe palette
OI = {
    "black": "#000000", "orange": "#E69F00", "skyblue": "#56B4E9",
    "green": "#009E73", "yellow": "#F0E442", "blue": "#0072B2",
    "vermillion": "#D55E00", "purple": "#CC79A7", "grey": "#999999",
}
DIR_COLOR = {
    "Worse in migrants": OI["vermillion"],
    "Better in migrants": OI["green"],
    "Equal": OI["skyblue"],
    "Inconclusive": OI["orange"],
}
DIR_ORDER = ["Worse in migrants", "Better in migrants", "Equal", "Inconclusive"]
SIG_COLOR = {"Significant": OI["blue"], "Not significant": OI["grey"]}


def q(sql, params=()):
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        cur = conn.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return cols, cur.fetchall()
    finally:
        conn.close()


def _short(txt, n):
    txt = "" if txt is None else str(txt)
    return txt if len(txt) <= n else txt[: n - 1] + "…"


# ---------------------------------------------------------------- 1. forest
def forest_plot(filter_sql=None, outfile="forest.png"):
    where = f"WHERE {filter_sql}" if filter_sql else ""
    sql = f"""
        SELECT o.outcome_id, s.author, o.outcome_name, o.effect_estimate,
               o.ci_low, o.ci_high, o.measure_type_norm, o.direction_norm
        FROM outcomes o JOIN studies s ON s.study_id = o.study_id
        {where}
        ORDER BY o.study_id, o.outcome_id
    """
    _, rows = q(sql)
    plotted = [r for r in rows if r[3] is not None]
    skipped = len(rows) - len(plotted)
    no_ci = sum(1 for r in plotted if r[4] is None or r[5] is None)

    n = len(plotted)
    fig, ax = plt.subplots(figsize=(11, max(3.5, 0.27 * n + 1.5)))
    ys = list(range(n, 0, -1))  # top = first row
    labels = []
    for y, r in zip(ys, plotted):
        _id, author, name, eff, lo, hi, meas, direction = r
        color = DIR_COLOR.get(direction, OI["black"])
        if lo is not None and hi is not None:
            ax.errorbar(eff, y, xerr=[[max(eff - lo, 0)], [max(hi - eff, 0)]],
                        fmt="o", color=color, ecolor=color, elinewidth=1.3,
                        capsize=3, markersize=5)
        else:
            ax.plot(eff, y, marker="D", color=color, markersize=6)  # no-CI marker
        author0 = str(author).split(",")[0].split(" et al")[0]
        labels.append(f"{_short(author0, 18)} — {_short(name, 40)}")

    ax.axvline(1.0, color=OI["black"], ls="--", lw=1, zorder=0)
    ax.set_yticks(ys)
    ax.set_yticklabels(labels, fontsize=7)
    ax.set_ylim(0.5, n + 0.5)
    ax.set_xlabel("Effect estimate  (OR / RR / HR; ratio reference = 1.0. MD outcomes share the axis.)")
    title = "Forest plot of effect estimates"
    if filter_sql:
        title += f"  [{filter_sql}]"
    ax.set_title(title, fontsize=12, weight="bold")
    handles = [plt.Line2D([0], [0], marker="o", ls="", color=c, label=d)
               for d, c in DIR_COLOR.items()]
    if no_ci:
        handles.append(plt.Line2D([0], [0], marker="D", ls="", color=OI["black"],
                                  label="No CI reported"))
    ax.legend(handles=handles, loc="lower right", fontsize=7, framealpha=0.9)
    ax.grid(axis="x", ls=":", alpha=0.5)
    fig.tight_layout()
    path = os.path.join(OUT, outfile)
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path, len(plotted), skipped, no_ci


# ------------------------------------------------ 2. direction by category
def direction_by_category(outfile="direction_by_category.png"):
    _, rows = q("""
        SELECT outcome_category_norm, direction_norm, COUNT(*)
        FROM outcomes GROUP BY outcome_category_norm, direction_norm
    """)
    cats = sorted({r[0] for r in rows},
                  key=lambda c: -sum(r[2] for r in rows if r[0] == c))
    data = {d: [0] * len(cats) for d in DIR_ORDER}
    for cat, direction, cnt in rows:
        if direction in data:
            data[direction][cats.index(cat)] = cnt

    fig, ax = plt.subplots(figsize=(10, 6))
    bottom = [0] * len(cats)
    x = range(len(cats))
    for d in DIR_ORDER:
        vals = data[d]
        if sum(vals) == 0:
            continue
        ax.bar(x, vals, bottom=bottom, label=d, color=DIR_COLOR[d])
        for xi, (v, b) in enumerate(zip(vals, bottom)):
            if v:
                ax.text(xi, b + v / 2, str(v), ha="center", va="center",
                        fontsize=8, color="white", weight="bold")
        bottom = [b + v for b, v in zip(bottom, vals)]
    ax.set_xticks(list(x))
    ax.set_xticklabels(cats, rotation=20, ha="right")
    ax.set_ylabel("Number of outcomes")
    ax.set_xlabel("Outcome category")
    ax.set_title("Direction of effect within each outcome category",
                 fontsize=13, weight="bold")
    ax.legend(title="Direction (migrants vs comparators)", fontsize=9)
    ax.grid(axis="y", ls=":", alpha=0.5)
    fig.tight_layout()
    path = os.path.join(OUT, outfile)
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


# --------------------------------------------------------- 3. quality overview
def quality_overview(outfile="quality_overview.png"):
    _, ql = q("SELECT quality_class, COUNT(*) FROM studies GROUP BY quality_class")
    qmap = {r[0]: r[1] for r in ql}
    qorder = ["High", "Moderate", "Low"]
    qvals = [qmap.get(k, 0) for k in qorder]

    _, hs = q("""
        SELECT s.health_system_type, COUNT(DISTINCT s.study_id),
               COUNT(o.outcome_id)
        FROM studies s LEFT JOIN outcomes o ON o.study_id = s.study_id
        GROUP BY s.health_system_type ORDER BY COUNT(o.outcome_id) DESC
    """)
    hs_labels = [r[0] for r in hs]
    n_studies = [r[1] for r in hs]
    n_outcomes = [r[2] for r in hs]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.5))
    qc = [OI["green"], OI["orange"], OI["vermillion"]]
    bars = ax1.bar(qorder, qvals, color=qc)
    ax1.bar_label(bars, padding=2)
    ax1.set_ylabel("Number of studies")
    ax1.set_xlabel("Quality classification")
    ax1.set_title("Study quality (NOS / JBI)", fontsize=12, weight="bold")
    ax1.grid(axis="y", ls=":", alpha=0.5)

    x = range(len(hs_labels))
    w = 0.38
    b1 = ax2.bar([i - w / 2 for i in x], n_studies, w, label="Studies", color=OI["blue"])
    b2 = ax2.bar([i + w / 2 for i in x], n_outcomes, w, label="Outcomes", color=OI["skyblue"])
    ax2.bar_label(b1, padding=2)
    ax2.bar_label(b2, padding=2)
    ax2.set_xticks(list(x))
    ax2.set_xticklabels([_short(l, 18) for l in hs_labels])
    ax2.set_ylabel("Count")
    ax2.set_xlabel("Health-system type")
    ax2.set_title("Studies & outcomes by health-system type", fontsize=12, weight="bold")
    ax2.legend()
    ax2.grid(axis="y", ls=":", alpha=0.5)
    fig.tight_layout()
    path = os.path.join(OUT, outfile)
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


# --------------------------------------------------- 4. significance breakdown
def significance_breakdown(outfile="significance_breakdown.png"):
    _, rows = q("""
        SELECT COALESCE(outcome_category_norm,'(uncategorized)'),
               COALESCE(significance,'(unknown)'), COUNT(*)
        FROM outcomes GROUP BY 1, 2
    """)
    cats = {}
    for cat, sig, cnt in rows:
        cats.setdefault(cat, {})[sig] = cnt
    # overall row first, then categories by total desc
    order = ["Overall"] + sorted(cats, key=lambda c: -sum(cats[c].values()))
    overall = {}
    for c in cats.values():
        for k, v in c.items():
            overall[k] = overall.get(k, 0) + v
    cats["Overall"] = overall

    sig_keys = ["Significant", "Not significant"]
    fig, ax = plt.subplots(figsize=(10, 0.6 * len(order) + 2))
    ys = range(len(order))
    left = [0] * len(order)
    for sk in sig_keys:
        vals = [cats[c].get(sk, 0) for c in order]
        totals = [sum(cats[c].get(k, 0) for k in sig_keys) or 1 for c in order]
        frac = [v / t for v, t in zip(vals, totals)]
        ax.barh(list(ys), frac, left=left, color=SIG_COLOR[sk], label=sk)
        for yi, (f, v) in enumerate(zip(frac, vals)):
            if v:
                ax.text(left[yi] + f / 2, yi, f"{v}\n({f*100:.0f}%)",
                        ha="center", va="center", fontsize=7,
                        color="white", weight="bold")
        left = [l + f for l, f in zip(left, frac)]
    ax.set_yticks(list(ys))
    ax.set_yticklabels(order)
    ax.invert_yaxis()
    ax.set_xlim(0, 1)
    ax.set_xlabel("Share of outcomes")
    ax.set_title("Statistical significance: overall and by outcome category",
                 fontsize=13, weight="bold")
    ax.legend(loc="lower right", fontsize=9)
    fig.tight_layout()
    path = os.path.join(OUT, outfile)
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path


if __name__ == "__main__":
    fp, n, skipped, no_ci = forest_plot()
    print(f"[1] forest_plot -> {fp}")
    print(f"    plotted {n} outcomes; skipped {skipped} with NULL effect_estimate; "
          f"{no_ci} plotted without CI whiskers (NULL ci_low/ci_high).")
    print(f"[2] direction_by_category -> {direction_by_category()}")
    print(f"[3] quality_overview -> {quality_overview()}")
    print(f"[4] significance_breakdown -> {significance_breakdown()}")
