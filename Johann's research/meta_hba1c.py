#!/usr/bin/env python3
"""Random-effects (DerSimonian-Laird) meta-analysis of HbA1c glycaemic-target
attainment: migrants vs non-migrants. Harmonised to RR (migrant relative
likelihood of ACHIEVING target). Pure-stdlib implementation.
"""
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
Z = 1.959963985

# ---- harmonisation helpers ----
def zhang_yu(or_, p0):
    """OR -> RR given baseline risk p0 in the reference group."""
    return or_ / ((1 - p0) + p0 * or_)

def invert(est, lo, hi):
    """Flip reference group: OR(event) -> OR(complement)."""
    return 1 / est, 1 / hi, 1 / lo  # bounds swap

def se_logratio(lo, hi):
    return (math.log(hi) - math.log(lo)) / (2 * Z)

# ---- input rows: (label, kind, threshold, [(est,lo,hi),...], p0_for_conv) ----
# kind: 'RR' already a risk ratio for ACHIEVING target
#       'OR' odds ratio for achieving target -> convert with p0
#       'OR>8' odds ratio for >8% (poor control) -> invert then convert (p0 = P(<=8%))
STUDIES = [
    ("S1 Adekunte (Canada)",      "RR",   "<=7%", [(0.977, 0.97, 0.984)], None),
    ("S12 Strooij (Netherlands)", "OR",   "<=7%", [(0.61, 0.57, 0.64), (0.67, 0.63, 0.72),
                                                   (0.79, 0.75, 0.84), (0.82, 0.77, 0.86)], 0.831),
    ("S13 Consolazio (Italy)",    "RR",   "<=7%", [(0.93, 0.88, 0.99), (0.80, 0.77, 0.84),
                                                   (0.81, 0.78, 0.86), (0.72, 0.67, 0.77),
                                                   (0.83, 0.78, 0.88)], None),
    ("S10 Kristensen (Denmark)",  "RR",   "<8%",  [(0.736, 0.602, 0.90), (0.708, 0.606, 0.828)], None),
    ("S6 Fosse-Edorh (France)",   "OR>8", "<=8%", [(2.0, 1.2, 3.3)], 0.85),
]

def to_rr(kind, triplets, p0):
    """Return list of (lnRR, SE) for each subgroup row, harmonised to 'achieving target'."""
    out = []
    for est, lo, hi in triplets:
        if kind == "RR":
            r, l, h = est, lo, hi
        elif kind == "OR":
            r = zhang_yu(est, p0); l = zhang_yu(lo, p0); h = zhang_yu(hi, p0)
        elif kind == "OR>8":
            e2, l2, h2 = invert(est, lo, hi)          # OR for <=8% (achieving)
            r = zhang_yu(e2, p0); l = zhang_yu(l2, p0); h = zhang_yu(h2, p0)
        out.append((math.log(r), se_logratio(l, h)))
    return out

def fe_combine(rows):
    """Fixed-effect inverse-variance combine subgroup lnRRs within a study."""
    ws = [1 / se ** 2 for _, se in rows]
    y = sum(w * ln for w, (ln, _) in zip(ws, rows)) / sum(ws)
    se = math.sqrt(1 / sum(ws))
    return y, se

def dl(points):
    """DerSimonian-Laird random effects on list of (y, se). Returns dict."""
    k = len(points)
    w = [1 / se ** 2 for _, se in points]
    ybar_fe = sum(wi * y for wi, (y, _) in zip(w, points)) / sum(w)
    Q = sum(wi * (y - ybar_fe) ** 2 for wi, (y, _) in zip(w, points))
    df = k - 1
    C = sum(w) - sum(wi ** 2 for wi in w) / sum(w)
    tau2 = max(0.0, (Q - df) / C) if C > 0 else 0.0
    wr = [1 / (se ** 2 + tau2) for _, se in points]
    ybar = sum(wi * y for wi, (y, _) in zip(wr, points)) / sum(wr)
    se_re = math.sqrt(1 / sum(wr))
    I2 = max(0.0, (Q - df) / Q) * 100 if Q > 0 else 0.0
    # weights as % of total random-effects weight
    wpct = [100 * wi / sum(wr) for wi in wr]
    return dict(k=k, rr=math.exp(ybar), lo=math.exp(ybar - Z * se_re),
                hi=math.exp(ybar + Z * se_re), I2=I2, tau2=tau2, Q=Q, df=df, wpct=wpct,
                y=ybar, se=se_re)

# ---- build per-study harmonised estimates ----
study_pts = []   # (label, threshold, y, se, n_subgroups)
for label, kind, thr, trip, p0 in STUDIES:
    rows = to_rr(kind, trip, p0)
    if len(rows) == 1:
        y, se = rows[0]
    else:
        y, se = fe_combine(rows)
    study_pts.append((label, thr, y, se, len(trip)))

def run(subset, name):
    pts = [(y, se) for (_, _, y, se, _) in subset]
    res = dl(pts)
    print(f"\n=== {name}  (k={res['k']}) ===")
    for (label, thr, y, se, ns), wp in zip(subset, res["wpct"]):
        rr = math.exp(y); lo = math.exp(y - Z * se); hi = math.exp(y + Z * se)
        print(f"  {label:30} [{thr:5}] RR={rr:.3f} ({lo:.3f}-{hi:.3f})  w={wp:4.1f}%"
              + (f"  [{ns} subgroups combined]" if ns > 1 else ""))
    print(f"  >> POOLED RR = {res['rr']:.3f} (95% CI {res['lo']:.3f}-{res['hi']:.3f})")
    print(f"     I2 = {res['I2']:.1f}%   tau2 = {res['tau2']:.4f}   "
          f"Q = {res['Q']:.2f} (df={res['df']})")
    return res

primary = run(study_pts[:3], "PRIMARY: HbA1c <=7% target attainment")
allfive = run(study_pts, "SENSITIVITY: all glycaemic-target studies (mixed threshold)")
sub7 = dl([(y, se) for (_, t, y, se, _) in study_pts if t == "<=7%"])
sub8 = dl([(y, se) for (_, t, y, se, _) in study_pts if t in ("<8%", "<=8%")])
print(f"\nThreshold subgroups (all-5 model):")
print(f"  <=7%: RR {sub7['rr']:.3f} ({sub7['lo']:.3f}-{sub7['hi']:.3f}), I2 {sub7['I2']:.1f}%")
print(f"  ~8% : RR {sub8['rr']:.3f} ({sub8['lo']:.3f}-{sub8['hi']:.3f}), I2 {sub8['I2']:.1f}%")

# ---- forest plot (all 5 + overall diamond) ----
OI = {"green": "#009E73", "blue": "#0072B2", "navy": "#1F4E79", "grey": "#666666"}
fig, ax = plt.subplots(figsize=(9.2, 4.8))
labels, rrs, los, his, wps = [], [], [], [], []
for (label, thr, y, se, ns), wp in zip(study_pts, allfive["wpct"]):
    labels.append(f"{label}  [{thr}]" + (f"  ×{ns}" if ns > 1 else ""))
    rrs.append(math.exp(y)); los.append(math.exp(y - Z * se)); his.append(math.exp(y + Z * se)); wps.append(wp)

n = len(labels)
ys = list(range(n, 0, -1))
for yi, rr, lo, hi, wp in zip(ys, rrs, los, his, wps):
    ax.plot([lo, hi], [yi, yi], color=OI["grey"], lw=1.4, zorder=2)
    ax.plot([lo, lo], [yi - .08, yi + .08], color=OI["grey"], lw=1.4)
    ax.plot([hi, hi], [yi - .08, yi + .08], color=OI["grey"], lw=1.4)
    ax.scatter([rr], [yi], s=30 + wp * 14, color=OI["blue"], zorder=3, edgecolor="white", lw=.6)

# overall diamond
rr, lo, hi = allfive["rr"], allfive["lo"], allfive["hi"]
yd = 0
ax.fill([lo, rr, hi, rr], [yd, yd + .28, yd, yd - .28], color=OI["green"], zorder=4)
ax.axvline(1.0, color="black", ls="--", lw=1, zorder=1)
ax.set_yticks(ys + [yd])
ax.set_yticklabels(labels + [f"Random-effects pooled (k={allfive['k']})"], fontsize=9)
ax.get_yticklabels()[-1].set_fontweight("bold")
ax.set_ylim(-0.8, n + 0.7)
ax.set_xscale("log")
ax.minorticks_off()
ax.set_xticks([0.5, 0.7, 0.85, 1.0, 1.2])
ax.get_xaxis().set_major_formatter(plt.matplotlib.ticker.ScalarFormatter())
ax.set_xlim(0.45, 1.25)
ax.set_xlabel("RR of achieving HbA1c target  (migrants vs non-migrants) — log scale")
ax.set_title("HbA1c glycaemic-target attainment: random-effects meta-analysis",
             fontsize=12, weight="bold")
ax.text(0.46, -0.72, "← migrants less likely to achieve target", fontsize=8, color=OI["grey"])
ax.annotate(f"Pooled RR {rr:.2f} (95% CI {lo:.2f}–{hi:.2f})\n"
            f"I² = {allfive['I2']:.0f}%   τ² = {allfive['tau2']:.3f}",
            xy=(0.47, n - 0.2), fontsize=9, color=OI["navy"],
            bbox=dict(boxstyle="round,pad=0.4", fc="#EAF6F1", ec=OI["green"]))
ax.grid(axis="x", ls=":", alpha=0.4)
fig.tight_layout()
out = os.path.join(HERE, "charts", "forest_hba1c_pool.png")
fig.savefig(out, dpi=150)
print("\nSaved", out)

# expose results for the PDF builder
RESULTS = dict(primary=primary, allfive=allfive, sub7=sub7, sub8=sub8,
               studies=[(l, t, math.exp(y), math.exp(y - Z * se), math.exp(y + Z * se), ns)
                        for (l, t, y, se, ns) in study_pts],
               wpct_all=allfive["wpct"])

if __name__ == "__main__":
    pass
