#!/usr/bin/env python3
"""Generate the poolability assessment PDF report."""
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                PageBreak, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Migrant_T2DM_Poolability_Report.pdf")

# fonts (full Unicode coverage)
pdfmetrics.registerFont(TTFont("Arial", "/Library/Fonts/Arial Unicode.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))
registerFontFamily("Arial", normal="Arial", bold="Arial-Bold",
                   italic="Arial-Italic", boldItalic="Arial-Bold")

NAVY = colors.HexColor("#1F4E79")
LBLUE = colors.HexColor("#E8F1FB")
GREEN = colors.HexColor("#009E73")
ORANGE = colors.HexColor("#E69F00")
RED = colors.HexColor("#C0392B")
GREY = colors.HexColor("#666666")
LGREY = colors.HexColor("#F2F2F2")

ss = getSampleStyleSheet()


def st(name, **kw):
    base = dict(fontName="Arial", fontSize=9.5, leading=13, textColor=colors.black)
    base.update(kw)
    return ParagraphStyle(name, **base)


S_TITLE = st("t", fontName="Arial-Bold", fontSize=20, leading=24, textColor=NAVY)
S_SUB = st("sub", fontSize=11, leading=15, textColor=GREY)
S_H1 = st("h1", fontName="Arial-Bold", fontSize=14, leading=18, textColor=NAVY,
          spaceBefore=14, spaceAfter=6)
S_H2 = st("h2", fontName="Arial-Bold", fontSize=11, leading=14, textColor=colors.black,
          spaceBefore=8, spaceAfter=3)
S_BODY = st("body", spaceAfter=6)
S_SMALL = st("small", fontSize=8.5, leading=11.5, textColor=GREY)
S_CELL = st("cell", fontSize=8.8, leading=11.5)
S_CELLB = st("cellb", fontSize=8.8, leading=11.5, fontName="Arial-Bold")
S_FIELD = st("field", fontSize=8.8, leading=11.5, fontName="Arial-Bold", textColor=NAVY)
S_BADGE = st("badge", fontName="Arial-Bold", fontSize=10, leading=12,
             textColor=colors.white, alignment=TA_CENTER)
S_CARDH = st("cardh", fontName="Arial-Bold", fontSize=10.5, leading=13, textColor=colors.white)
S_CAP = st("cap", fontSize=8.5, leading=11, textColor=GREY, alignment=TA_CENTER)

VCOLOR = {"YES": GREEN, "CONDITIONAL": ORANGE, "NO": RED}


def verdict_color(v):
    for k, c in VCOLOR.items():
        if v.startswith(k):
            return c
    return GREY


story = []


def P(txt, style=S_BODY):
    story.append(Paragraph(txt, style))


# ---------------- title block ----------------
story.append(Spacer(1, 8))
P("Meta-Analysis Poolability Assessment", S_TITLE)
P("Health inequities in migrants with type 2 diabetes mellitus (T2DM)", S_SUB)
story.append(Spacer(1, 4))
meta_tbl = Table([
    [Paragraph("Systematic review", S_CELLB), Paragraph("Effect of healthcare inequities on complications in migrants with T2DM", S_CELL)],
    [Paragraph("Registration", S_CELLB), Paragraph("PROSPERO CRD420261377625", S_CELL)],
    [Paragraph("Framework", S_CELLB), Paragraph("Cochrane Handbook · PRISMA 2020 · SWiM (synthesis without meta-analysis)", S_CELL)],
    [Paragraph("Evidence base", S_CELLB), Paragraph("13 studies · 118 extracted outcomes (Blocks D+E)", S_CELL)],
    [Paragraph("Scope", S_CELLB), Paragraph("Poolability screening, effect-measure &amp; unit harmonisation, pre-model flags", S_CELL)],
], colWidths=[3.3 * cm, 12.5 * cm])
meta_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), LBLUE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
]))
story.append(meta_tbl)
story.append(Spacer(1, 12))

# ---------------- executive summary ----------------
P("Executive summary", S_H1)
P("Row counts in the extraction table are misleading for synthesis. Three studies "
  "(Strooij = 36 rows, Consolazio = 10, Kristensen = 9) contribute most rows as "
  "<i>within-study subgroups</i> (ethnicity, region, sex, calendar year). When outcomes are "
  "counted by <b>distinct study</b>, only <b>8 of 23</b> clinical outcome groups reach the "
  "non-negotiable threshold of ≥3 studies — and several of those fail on clinical "
  "homogeneity, comparison direction, or confounding.")
P("<b>Two outcomes are defensibly meta-analysable</b>: HbA1c glycaemic control (5 studies, "
  "<b>unanimous direction</b> — migrants consistently worse) and HbA1c monitoring / eye "
  "screening (process-of-care access). The hard clinical endpoints (composite CVD, all-cause "
  "mortality, stroke) are underpowered, confounded by the healthy-migrant effect, or "
  "compromised by within-migrant comparisons — these belong in <b>narrative / SWiM "
  "synthesis</b>, with the glycaemic-control pool as the quantitative centrepiece.")

# two cross-cutting exclusions
P("Cross-cutting exclusions applied to every pool", S_H2)
excl = Table([
    [Paragraph("Study 7 (Okrainec)", S_CELLB),
     Paragraph("Compares immigrants <i>with vs. without language barrier</i> — a "
               "<b>within-migrant</b> contrast, not migrants vs. non-migrants. Fails Criterion 2 "
               "→ excluded from all pools (eligible only for a separate language-barrier "
               "narrative strand).", S_CELL)],
    [Paragraph("Study 5 (Fiorini)", S_CELLB),
     Paragraph("Undocumented migrants at an NGO clinic vs. Italian-born nationals; RR 0.16–0.32 "
               "for CVD (84–68% lower). Textbook <b>healthy-migrant + undercount selection "
               "bias</b> → flagged as an outlier; never pooled naively.", S_CELL)],
    [Paragraph("Unit conversions", S_CELLB),
     Paragraph("<b>None triggered.</b> Every poolable outcome is a dimensionless ratio (OR/RR/HR) "
               "or proportion. Section 2 SI conversions apply only if continuous "
               "HbA1c% / glucose / lipid means are added later — absent from poolable groups here.", S_CELL)],
], colWidths=[3.3 * cm, 12.5 * cm])
excl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), LGREY),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
]))
story.append(excl)

# ---------------- summary verdict table ----------------
summary_flow = [Paragraph("Poolability verdicts — all qualifying outcome groups", S_H1)]
rows = [
    ["Outcome group", "Distinct studies", "Verdict"],
    ["HbA1c glycaemic control (target / level)", "5  (1, 6, 10, 12, 13)", "CONDITIONAL — best candidate"],
    ["HbA1c testing / monitoring", "5  (1, 6, 10, 12, 13)", "CONDITIONAL"],
    ["Retinopathy / eye screening", "4  (1, 6, 10, 11)", "CONDITIONAL"],
    ["CVD / composite CV events", "5 → 3 after exclusions", "CONDITIONAL (expect I² > 75%)"],
    ["All-cause mortality (T2DM) — POST-HOC", "3  (3, 4, 8)", "CONDITIONAL"],
    ["Nephropathy / renal", "3  (1, 5, 6)", "NO — heterogeneous constructs"],
    ["Retinopathy disease &amp; treatment", "3  (5, 6, 11)", "NO — disease vs. procedures"],
    ["Stroke", "3 → 2 after S7 excluded", "NO — < 3 studies"],
    ["15 other groups", "1–2", "NO — < 3 studies → narrative"],
]
tdata = [[Paragraph(c, S_CELLB if i == 0 else S_CELL) for c in r] for i, r in enumerate(rows)]
vt = Table(tdata, colWidths=[7.4 * cm, 4.0 * cm, 4.4 * cm], repeatRows=1)
tstyle = [
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Arial-Bold"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]
for i in range(1, len(rows)):
    v = rows[i][2]
    tstyle.append(("TEXTCOLOR", (2, i), (2, i), verdict_color(v)))
    tstyle.append(("FONTNAME", (2, i), (2, i), "Arial-Bold"))
    if i % 2 == 0:
        tstyle.append(("BACKGROUND", (0, i), (-1, i), LGREY))
vt.setStyle(TableStyle(tstyle))
summary_flow.append(vt)
story.append(KeepTogether(summary_flow))
story.append(Spacer(1, 12))

# ---------------- detailed assessment cards ----------------
P("Detailed assessment — poolable / conditional groups", S_H1)
P("Each card follows the protocol output template (Section 5). Study IDs in parentheses; "
  "“use o##” refers to the extraction outcome_id to select per study.", S_SMALL)
story.append(Spacer(1, 4))

CARDS = [
    {
        "name": "HbA1c glycaemic control — % at / above target",
        "verdict": "CONDITIONAL", "tag": "strongest candidate",
        "studies": "5 — S1, S6, S10, S12, S13",
        "reason": "Five studies, dichotomous-proportion family, <b>unanimous direction</b> "
                  "(migrants worse glycaemic control). Measures convertible; P<sub>0</sub> available.",
        "measure": "RR (primary)",
        "conv": "OR→RR (Zhang &amp; Yu) for S6 (OR 2.0) and S12 (OR 0.61–0.82). "
                "P<sub>0</sub> = comparator %-at-target is reported (~40–55%, <b>not</b> rare) "
                "→ conversion <b>required</b>; OR overestimates RR, especially S6 "
                "(OR > 2, P<sub>0</sub> > 10%). S6 reports “HbA1c &gt; 8%” = complement "
                "(poor control) → Section 4A inversion / declare valence.",
        "dir": "YES — all indicate worse control in migrants after valence harmonisation.",
        "units": "YES — dimensionless proportions (N/A).",
        "model": "Random-effects (DerSimonian–Laird), per protocol.",
        "flag": "Threshold heterogeneity (≤7% in S1/S12/S13 vs. &lt;8% in S10) → run as "
                "subgroup. Within-study multiplicity: S12 (4 ethnic), S13 (5 region), S10 (2 origin) "
                "must be combined to ONE estimate per study before pooling, or the reference group "
                "is double-counted and study weight inflated.",
    },
    {
        "name": "HbA1c testing / monitoring (received guideline monitoring)",
        "verdict": "CONDITIONAL", "tag": "",
        "studies": "5 — S1, S6, S10, S12, S13",
        "reason": "≥3 studies, but the construct splits by monitoring <b>frequency</b> threshold.",
        "measure": "RR",
        "conv": "OR→RR for S12 (P<sub>0</sub> = comparator monitoring rate, high ~70–90% "
                "→ conversion required). S6 “no HbA1c value reported” = complement "
                "→ invert (Section 4A) to “monitored” before pooling.",
        "dir": "PARTIAL — most lower in migrants, but S12 Turkish/Moroccan OR > 1 (more "
               "monitoring) → genuine clinical heterogeneity by host country.",
        "units": "YES (N/A).",
        "model": "Random-effects (DerSimonian–Laird).",
        "flag": "Homogeneous poolable core = “≥1/yr monitoring” (S1, S10, S12 = 3 studies). "
                "≥2/yr (S13) and ≥3/yr (S6) are different intensities → separate subgroups. "
                "Combine within-study subgroups first.",
    },
    {
        "name": "Retinopathy / eye screening (received screening)",
        "verdict": "CONDITIONAL", "tag": "",
        "studies": "4 — S1, S6, S10, S11",
        "reason": "Four studies, consistent direction (all <b>lower</b> screening in migrants).",
        "measure": "RR",
        "conv": "OR→RR for S11 (Cox-derived OR; P<sub>0</sub> available).",
        "dir": "YES — S1 0.88, S6 0.86, S10 0.82/0.52, S11 0.76/0.77, all &lt; 1.",
        "units": "YES (N/A).",
        "model": "Random-effects (DerSimonian–Laird).",
        "flag": "<b>S1 (Adekunte) “Eye examination” 95% CI is corrupted in the source</b> "
                "[0.887, 0.01196] — upper &lt; lower, variance unusable → use point estimate "
                "only or drop S1 from inverse-variance weighting. Screening-interval heterogeneity "
                "(annual / 2-yr / 6-yr). Combine within-study subgroups (S10 ×2, S11 ×2 thresholds).",
    },
    {
        "name": "Cardiovascular disease / composite CV events",
        "verdict": "CONDITIONAL", "tag": "high heterogeneity expected",
        "studies": "5 nominal → 3 usable (S2, S9, S10)",
        "reason": "After excluding S7 (within-migrant comparison) and S5 (selection-bias outlier), "
                  "3 studies remain with divergent effects.",
        "measure": "Ratio measures (HR S2/S9 + RR S10) on the log scale",
        "conv": "None — HR/RR pooled together as ratio measures (Section 3C fallback); "
                "estimates are <b>not</b> all within 0.7–1.4, so justify cautiously.",
        "dir": "NO — S2 1.38 (worse), S9 0.75–1.13 (mixed by sex), S10 1.22 (worse).",
        "units": "YES (N/A).",
        "model": "Random-effects (DerSimonian–Laird).",
        "flag": "Use S2 o10 (all subjects) ONLY; drop sex/age subgroups o11–14. S9 reports "
                "sex-stratified only → combine to one estimate. Varying composite definitions and "
                "follow-up (3 yr vs. 6-yr cumulative). Likely I² &gt; 75% → if so, do NOT "
                "interpret the pooled estimate; narrative synthesis per SWiM.",
    },
    {
        "name": "All-cause mortality (within T2DM)  —  POST-HOC (Amendment 1)",
        "verdict": "CONDITIONAL", "tag": "label post-hoc",
        "studies": "3 — S3, S4, S8",
        "reason": "Three studies, all HR (compatible), all T2DM — but directions diverge sharply.",
        "measure": "HR",
        "conv": "None (all HR).",
        "dir": "NO — S3 1.08 (NS), S4 1.42 (worse), S8 0.55–0.76 (<b>better</b>; "
               "healthy-migrant / survivor effect, Sweden).",
        "units": "YES (N/A).",
        "model": "Random-effects (DerSimonian–Laird).",
        "flag": "<b>S3</b> — use o15 (first-generation Mexican-<i>born</i>) only; o16–19 are "
                "2nd-generation US-<i>born</i> = not foreign-born migrants. <b>S4</b> — use o23 "
                "(adjusted), not o22 (crude), per Priority Rule 1. <b>S8</b> — combine 2 origin "
                "groups to one estimate. Mortality is confounding-sensitive (age structures differ "
                "sharply) + mixed adjustment sets → I² &gt; 75% likely → narrative per SWiM. "
                "Must be labelled POST-HOC in the synthesis.",
    },
]


def card(c):
    badge = Table([[Paragraph(c["verdict"], S_BADGE)]], colWidths=[3.1 * cm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), verdict_color(c["verdict"])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    title = c["name"] + (f"  —  <font size=8>{c['tag']}</font>" if c["tag"] else "")
    head = Table([[Paragraph(title, S_CARDH), badge]],
                 colWidths=[12.7 * cm, 3.1 * cm])
    head.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (0, -1), 6), ("BOTTOMPADDING", (0, 0), (0, -1), 6),
        ("LEFTPADDING", (0, 0), (0, -1), 8),
    ]))
    fields = [
        ("Studies (n)", c["studies"]),
        ("Reason", c["reason"]),
        ("Effect measure used", c["measure"]),
        ("Conversions applied", c["conv"]),
        ("Direction verified", c["dir"]),
        ("Units verified", c["units"]),
        ("Primary model", c["model"]),
        ("Flags", c["flag"]),
    ]
    body = [[Paragraph(k, S_FIELD), Paragraph(v, S_CELL)] for k, v in fields]
    bt = Table(body, colWidths=[3.5 * cm, 12.3 * cm])
    bt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), LBLUE),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (1, 0), (1, -1), [colors.white, colors.HexColor("#FAFAFA")]),
    ]))
    return KeepTogether([head, bt, Spacer(1, 11)])


for c in CARDS:
    story.append(card(c))

# ---------------- not poolable ----------------
P("Not poolable — key reasons", S_H1)
np_items = [
    ("Nephropathy / renal (3 studies)", "Clinically different constructs: S1 normoalbuminuria "
     "(favourable result), S5 nephropathy diagnosis, S6 renal failure / ESRD. Mixed direction. "
     "Fails Criterion 3 → narrative."),
    ("Retinopathy disease &amp; treatment (3 studies)", "S5 / S6 = retinopathy disease &amp; "
     "complications; S11 = surgical procedures (laser, vitrectomy). Disease prevalence ≠ "
     "procedure utilisation; three different measures (RR / OR / HR) → narrative."),
    ("Stroke", "Drops to 2 studies once S7 is excluded; S9 / S10 stroke estimates are sparse and "
     "extreme (RR 0.14, CI to 3.17) → narrative."),
    ("15 single- / two-study groups", "BP monitoring &amp; target, LDL monitoring &amp; target, "
     "lipid testing, kidney monitoring, foot exam, GP visits, hospital utilisation, glycosuria, "
     "diabetic foot, CHD, CV mortality, diabetes-specific mortality, acute complications: "
     "&lt; 3 studies → narrative only (Rule 2). Most BP / LDL / foot / kidney rows are all "
     "Study 12 — high row counts, a single study."),
]
np_tbl = Table([[Paragraph(k, S_CELLB), Paragraph(v, S_CELL)] for k, v in np_items],
               colWidths=[4.6 * cm, 11.2 * cm])
np_tbl.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FBEAE6")),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
]))
story.append(np_tbl)

# ---------------- bottom line ----------------
P("Bottom line &amp; recommended next steps", S_H1)
P("• <b>Quantitative core:</b> the HbA1c glycaemic-control pool (5 studies, unanimous "
  "direction) is the defensible headline meta-analysis; HbA1c monitoring and eye-screening "
  "pools support a process-of-care access narrative.", S_BODY)
P("• <b>Narrative / SWiM:</b> composite CVD, all-cause mortality and stroke — underpowered, "
  "confounded by the healthy-migrant effect, or built on within-migrant comparisons.", S_BODY)
P("• <b>Before modelling:</b> (1) apply OR→RR conversions (S6, S11, S12) using the reported "
  "comparator proportions as P<sub>0</sub>; (2) collapse within-study subgroups to one estimate per "
  "study; (3) select adjusted over crude estimates (S4 o23, S3 o15); (4) compute I² and abandon "
  "pooled interpretation where I² &gt; 75% (SWiM).", S_BODY)
P("• <b>Declare every transformation</b> — no silent conversions (Priority Rule 3).", S_BODY)

# ---------------- quantitative synthesis (worked pool) ----------------
from meta_hba1c import RESULTS as R

story.append(PageBreak())
P("Quantitative synthesis — HbA1c glycaemic-target attainment", S_H1)
P("Worked random-effects meta-analysis of the headline pool. Outcome harmonised to the "
  "<b>relative risk (RR) of a migrant achieving the HbA1c target vs a non-migrant</b> "
  "(RR &lt; 1 = migrants less likely to achieve control). Model: <b>DerSimonian–Laird "
  "random effects</b> on the log scale. All transformations are declared (Priority Rule 3).", S_BODY)

conv = {
    "S1": "None — RR reported directly",
    "S12": "OR→RR (Zhang–Yu, P<sub>0</sub> = 0.83); 4 ethnic subgroups combined (fixed-effect)",
    "S13": "None — RR; 5 region subgroups combined (fixed-effect)",
    "S10": "None — RR; 2 origin subgroups combined (fixed-effect)",
    "S6": "OR(&gt;8%) inverted → OR(≤8%) → RR (Zhang–Yu, P<sub>0</sub> = 0.85)",
}
def cv(label):
    return next((v for k, v in conv.items() if label.startswith(k + " ")), "")

hdr = ["Study (setting)", "Thresh.", "Harmonised RR (95% CI)", "Wt %", "Harmonisation applied"]
trows = [[Paragraph(h, S_CELLB) for h in hdr]]
for (label, thr, rr, lo, hi, ns), w in zip(R["studies"], R["wpct_all"]):
    trows.append([
        Paragraph(label, S_CELL), Paragraph(thr, S_CELL),
        Paragraph(f"{rr:.3f} ({lo:.3f}–{hi:.3f})", S_CELL),
        Paragraph(f"{w:.1f}", S_CELL), Paragraph(cv(label), S_CELL),
    ])
mt = Table(trows, colWidths=[4.0 * cm, 1.5 * cm, 3.5 * cm, 1.1 * cm, 5.7 * cm], repeatRows=1)
mt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LGREY]),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
story.append(mt)
story.append(Spacer(1, 8))

pr, af, s7, s8 = R["primary"], R["allfive"], R["sub7"], R["sub8"]
prows = [[Paragraph(h, S_CELLB) for h in ["Model", "k", "Pooled RR (95% CI)", "I²", "τ²"]]]
for nm, d in [("Primary — HbA1c ≤7% target", pr), ("Sensitivity — all studies (mixed threshold)", af),
              ("Subgroup: ≤7% threshold", s7), ("Subgroup: ~8% threshold", s8)]:
    prows.append([Paragraph(nm, S_CELL), Paragraph(str(d["k"]), S_CELL),
                  Paragraph(f"{d['rr']:.3f} ({d['lo']:.3f}–{d['hi']:.3f})", S_CELLB),
                  Paragraph(f"{d['I2']:.1f}%", S_CELL), Paragraph(f"{d['tau2']:.4f}", S_CELL)])
pt = Table(prows, colWidths=[6.6 * cm, 0.9 * cm, 4.0 * cm, 1.8 * cm, 1.5 * cm], repeatRows=1)
pt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#117A65")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EAF6F1")]),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
]))
story.append(pt)
story.append(Spacer(1, 8))

fp = os.path.join(HERE, "charts/forest_hba1c_pool.png")
if os.path.exists(fp):
    img = Image(fp)
    scale = min(1.0, (15.8 * cm) / img.imageWidth)
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    story.append(img)

# critical interpretation box
warn = Table([[Paragraph(
    "<b>Interpretation &amp; mandatory caveat (Priority Rule 5/7).</b>  Heterogeneity is "
    f"extreme — I² = {af['I2']:.0f}%, far above the 75% ceiling. Per SWiM, the pooled point "
    "estimate must <b>not</b> be reported as a single reliable effect. The robust, "
    "interpretable finding is the <b>unanimous direction</b>: in all five health systems "
    "migrants are less likely to achieve glycaemic control, with study-level RRs ranging "
    "~0.72–0.98. The I² inflation is expected here — these are very large administrative "
    "cohorts (n up to millions), so within-study CIs are extremely tight and even modest, "
    "genuine between-setting differences in the disparity produce enormous Q. This is "
    "precise estimation of <i>different</i> effects, not noisy data. <b>Conclusion:</b> "
    "report as a consistent-direction disparity (narrative + this forest plot), not as a "
    "pooled RR headline.", S_CELL)]], colWidths=[15.8 * cm])
warn.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FDF3E0")),
    ("BOX", (0, 0), (-1, -1), 1, ORANGE),
    ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
]))
story.append(Spacer(1, 8))
story.append(warn)

# ---------------- appendix figures ----------------
story.append(PageBreak())
P("Appendix — supporting figures", S_H1)
figs = [
    ("charts/direction_by_category.png",
     "Figure 1. Direction of effect within each outcome category. The Glycemic Control bar is "
     "entirely “worse in migrants” (14/14) — the consistency underpinning the headline pool."),
    ("charts/significance_breakdown.png",
     "Figure 2. Statistical significance, overall and by category. Glycemic Control outcomes are "
     "100% significant; macrovascular outcomes are only 43% significant (underpowered hard endpoints)."),
]
for rel, cap in figs:
    p = os.path.join(HERE, rel)
    if os.path.exists(p):
        img = Image(p)
        maxw = 15.8 * cm
        scale = min(1.0, maxw / img.imageWidth)
        img.drawWidth = img.imageWidth * scale
        img.drawHeight = img.imageHeight * scale
        story.append(img)
        story.append(Paragraph(cap, S_CAP))
        story.append(Spacer(1, 14))

# ---------------- build with header/footer ----------------
def deco(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(NAVY)
    canvas.setLineWidth(2)
    canvas.line(2 * cm, A4[1] - 1.35 * cm, A4[0] - 2 * cm, A4[1] - 1.35 * cm)
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(2 * cm, A4[1] - 1.25 * cm, "Migrant T2DM systematic review · PROSPERO CRD420261377625")
    canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.25 * cm, "Poolability assessment")
    canvas.drawString(2 * cm, 1.1 * cm, "Methodological screening — not a substitute for the registered protocol")
    canvas.drawRightString(A4[0] - 2 * cm, 1.1 * cm, f"Page {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, topMargin=1.8 * cm, bottomMargin=1.7 * cm,
                      leftMargin=2 * cm, rightMargin=2 * cm, title="Poolability Assessment",
                      author="Systematic review team")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="t", frames=[frame], onPage=deco)])
doc.build(story)
print("Saved", OUT)
