#!/usr/bin/env python3
"""Write metafor_input.csv — one row per study (per migrant subgroup, unresolved)
per outcome, for outcomes with >=3 distinct studies. Values transcribed from the
project database; harmonisation decisions documented per row. DRAFT for validation.
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "metafor_input.csv")

COLS = ["study_id", "subgroup", "outcome_group", "effect_measure", "effect_size",
        "CI_lower", "CI_upper", "adjusted", "p0_ref", "conversion_applied", "flag", "esid"]

# each row: study_id, subgroup, outcome_group, measure, effect, CI_lo, CI_hi,
#           adjusted, p0_ref, conversion_applied, flag    (esid added automatically)
# CI/p0 blank = "" (never imputed). subgroup = cluster-aware label for rma.mv RVE.
ROWS = [
 # ---------------- HbA1c_control ----------------
 ("Adekunte_2025","overall","HbA1c_control","RR",0.977,0.970,0.984,"unadjusted_only",0.485,"none","<=7% target; RR from crude proportions (no adjustment reported)"),
 ("Fosse-Edorh_2014","overall","HbA1c_control","OR",2.0,1.2,3.3,"yes",0.15,"none","INVERSE construct: HbA1c>8% (poor control), cutpoint 8% not 7%; OR adjusted (article); must invert + harmonise cutpoint in R before pooling"),
 ("Kristensen_2007","Lebanese","HbA1c_control","RR",0.736,0.602,0.90,"unadjusted_only",0.72,"none","cutpoint <8%; crude proportions"),
 ("Kristensen_2007","Turkish","HbA1c_control","RR",0.708,0.606,0.828,"unadjusted_only",0.72,"none","cutpoint <8%; crude proportions"),
 ("Strooij_2026","Turkish","HbA1c_control","OR",0.61,0.57,0.64,"yes",0.831,"none","GEE-adjusted; non-migrant baseline 83% => lenient target, verify cutpoint"),
 ("Strooij_2026","Moroccan","HbA1c_control","OR",0.67,0.63,0.72,"yes",0.831,"none","GEE-adjusted"),
 ("Strooij_2026","Surinamese","HbA1c_control","OR",0.79,0.75,0.84,"yes",0.831,"none","GEE-adjusted"),
 ("Strooij_2026","European","HbA1c_control","OR",0.82,0.77,0.86,"yes",0.831,"none","GEE-adjusted"),
 ("Consolazio_2025","Europe","HbA1c_control","RR",0.93,0.88,0.99,"unadjusted_only",0.682,"none","<=7%; RR from proportions (adjustment not stated)"),
 ("Consolazio_2025","Africa","HbA1c_control","RR",0.80,0.77,0.84,"unadjusted_only",0.682,"none","<=7%"),
 ("Consolazio_2025","East_Asia","HbA1c_control","RR",0.81,0.78,0.86,"unadjusted_only",0.682,"none","<=7%"),
 ("Consolazio_2025","Other_Asia","HbA1c_control","RR",0.72,0.67,0.77,"unadjusted_only",0.682,"none","<=7%"),
 ("Consolazio_2025","CS_America","HbA1c_control","RR",0.83,0.78,0.83,"unadjusted_only",0.682,"none","CI_upper=point (0.83) as reported — possible extraction error, verify source (NOT imputed)"),
 # ---------------- HbA1c_monitoring ----------------
 ("Adekunte_2025","overall","HbA1c_monitoring","RR",0.954,0.949,0.958,"unadjusted_only",0.541,"none","HbA1c testing (any); crude"),
 ("Fosse-Edorh_2014","overall","HbA1c_monitoring","RR",0.89,0.76,1.03,"unadjusted_only",0.44,"none",">=3 measurements/yr (high-intensity threshold differs from others); crude RR"),
 ("Kristensen_2007","Lebanese","HbA1c_monitoring","RR",1.036,0.954,1.125,"unadjusted_only",0.84,"none",">=1 measurement; crude"),
 ("Kristensen_2007","Turkish","HbA1c_monitoring","RR",0.988,0.919,1.062,"unadjusted_only",0.84,"none",">=1 measurement; crude"),
 ("Strooij_2026","Turkish","HbA1c_monitoring","OR",1.08,1.01,1.15,"yes",0.811,"none","annual monitoring; ISOLATED OR in majority-RR outcome -> R may convert OR->RR (p0 given, rule 3)"),
 ("Strooij_2026","Moroccan","HbA1c_monitoring","OR",1.36,1.27,1.46,"yes",0.811,"none","OPPOSITE direction (migrants monitored MORE)"),
 ("Strooij_2026","Surinamese","HbA1c_monitoring","OR",1.28,1.21,1.36,"yes",0.811,"none","migrants monitored more"),
 ("Strooij_2026","European","HbA1c_monitoring","OR",0.92,0.88,0.97,"yes",0.811,"none",""),
 ("Consolazio_2025","Europe","HbA1c_monitoring","RR",0.73,0.73,0.86,"unadjusted_only","","none",">=2 tests/yr; CI_lower=point (0.73) as reported — verify (NOT imputed)"),
 ("Consolazio_2025","Africa","HbA1c_monitoring","RR",0.72,0.68,0.77,"unadjusted_only","","none",">=2 tests/yr"),
 ("Consolazio_2025","East_Asia","HbA1c_monitoring","RR",0.64,0.60,0.69,"unadjusted_only","","none",">=2 tests/yr"),
 ("Consolazio_2025","Other_Asia","HbA1c_monitoring","RR",0.58,0.53,0.63,"unadjusted_only","","none",">=2 tests/yr"),
 ("Consolazio_2025","CS_America","HbA1c_monitoring","RR",0.71,0.65,0.78,"unadjusted_only","","none",">=2 tests/yr"),
 # ---------------- Retinopathy_screening ----------------
 ("Adekunte_2025","overall","Retinopathy_screening","RR",0.884,"","","unadjusted_only",0.728,"none","Eye exam (2-yr); SOURCE 95% CI corrupted/implausible [0.887, 0.01196] -> CI omitted (NOT imputed); variance unavailable, verify source"),
 ("Fosse-Edorh_2014","overall","Retinopathy_screening","RR",0.86,0.75,0.99,"unadjusted_only",0.51,"none",">=1 ophthalmologist visit/yr; crude RR (only p adjusted)"),
 ("Kristensen_2007","Lebanese","Retinopathy_screening","RR",0.818,0.515,1.299,"unadjusted_only",0.33,"none","subcohort (small N_L=49); >=1 ophthalmological exam; crude"),
 ("Kristensen_2007","Turkish","Retinopathy_screening","RR",0.515,0.323,0.821,"unadjusted_only",0.33,"none",">=1 ophthalmological exam; crude"),
 ("Lovshin_2017","overall","Retinopathy_screening","OR",0.76,0.75,0.77,"yes",0.505,"none","screening within 1 yr; adjusted (age,sex,income,rural); comparison = recent immigrants vs LONG-TERM residents (mostly Canadian-born); ISOLATED OR -> R may convert (p0 given); 2nd outcome >=3 screenings/6yr (OR 0.77) held as sensitivity"),
 # ---------------- All-cause_mortality  (POST-HOC, Amendment 1) ----------------
 ("Hunt_2011","first_gen_Mexican","All-cause_mortality","HR",1.08,0.59,1.97,"unadjusted_only","","none","POST-HOC; MIGRANT=first-generation Mexican-born ONLY (2nd-gen US-born EXCLUDED as non-migrant); adjustment model for first-gen estimate not specified in extraction"),
 ("Tran_2014","overall","All-cause_mortality","HR",1.42,1.07,1.88,"yes","","none","POST-HOC; adjusted model used; crude also reported (HR 1.53)"),
 ("Rawshani_2016","Non_Western","All-cause_mortality","HR",0.55,0.48,0.63,"yes","","none","POST-HOC; Cox Model 3 (most adjusted); strong protective = healthy-migrant effect"),
 ("Rawshani_2016","Low_income_European","All-cause_mortality","HR",0.76,0.62,0.83,"yes","","none","POST-HOC; Cox Model 3"),
 # ---------------- CV_disease ----------------
 ("Cho_2022","overall","CV_disease","HR",1.384,1.021,1.881,"yes","","none","composite CCV (cardio+cerebrovascular), ALL subjects (adjusted Cox, 3-yr FU); sex/age subgroups available but overall used"),
 ("Fiorini_2020","overall","CV_disease","RR",0.163,0.10,0.27,"unadjusted_only",0.41,"none","OUTLIER: undocumented migrants (NGO clinic) vs Italian-born — severe selection/healthy-migrant bias; UNADJUSTED; recommend exclusion or sensitivity-only"),
 ("Enguita-German_2024","male","CV_disease","HR",0.75,0.62,0.90,"yes","","none","Fine-Gray adjusted; no overall estimate reported"),
 ("Enguita-German_2024","female","CV_disease","HR",1.07,0.66,1.75,"yes","","none","Fine-Gray adjusted"),
 ("Kristensen_2007","Lebanese","CV_disease","RR",1.185,0.868,1.619,"unadjusted_only","","none","'any CV diagnosis' cumulative; crude"),
 ("Kristensen_2007","Turkish","CV_disease","RR",1.222,0.972,1.537,"unadjusted_only",0.27,"none","'any CV diagnosis' cumulative; crude"),
]

with open(OUT, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(COLS)
    for i, r in enumerate(ROWS, 1):
        w.writerow(list(r) + [i])   # append esid

# report
from collections import defaultdict
by = defaultdict(set)
nrows = defaultdict(int)
for r in ROWS:
    by[r[2]].add(r[0]); nrows[r[2]] += 1   # r[2]=outcome_group, r[0]=study_id
print(f"Wrote {OUT}  ({len(ROWS)} rows)")
print(f"{'outcome_group':24} {'distinct_studies':16} rows")
for g in ["HbA1c_control","HbA1c_monitoring","Retinopathy_screening","All-cause_mortality","CV_disease"]:
    print(f"  {g:22} {len(by[g]):^16} {nrows[g]}")
