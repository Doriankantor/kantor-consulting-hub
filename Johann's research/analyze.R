# =====================================================================
# Migrant T2DM systematic review (PROSPERO CRD420261377625)
# Recommended synthesis: 3-level random-effects (rma.mv) + cluster-robust
# variance (RVE / CR2, clubSandwich) at the STUDY level.
# One row per migrant subgroup; study_id is the cluster.
#
#   install.packages(c("metafor","clubSandwich"))
#   Rscript analyze.R
# =====================================================================
suppressMessages({library(metafor); library(clubSandwich)})

dat <- read.csv("metafor_input.csv", stringsAsFactors = FALSE)

# ---- harmonisation choices that need YOUR validation (toggle here) ----
# Rows excluded from the PRIMARY model, documented in `flag`:
#  - Fosse-Edorh in HbA1c_control = inverse construct (HbA1c>8%, cutpoint 8%)
#  - Fiorini in CV_disease       = selection-bias outlier (undocumented/NGO)
exclude_primary <- data.frame(
  outcome_group = c("HbA1c_control", "CV_disease"),
  study_id      = c("Fosse-Edorh_2014", "Fiorini_2020"),
  stringsAsFactors = FALSE)

# OR -> RR conversion (Zhang & Yu 1998), applied ONLY when p0_ref is available.
or_to_rr <- function(or, p0) or / ((1 - p0) + p0 * or)

run_outcome <- function(og, drop_flagged = TRUE) {
  d <- subset(dat, outcome_group == og)
  d <- d[d$CI_lower != "" & !is.na(suppressWarnings(as.numeric(d$CI_lower))), ]
  d$effect_size <- as.numeric(d$effect_size)
  d$CI_lower <- as.numeric(d$CI_lower); d$CI_upper <- as.numeric(d$CI_upper)
  d$p0_ref <- suppressWarnings(as.numeric(d$p0_ref))

  if (drop_flagged) {
    ex <- exclude_primary$study_id[exclude_primary$outcome_group == og]
    d <- d[!(d$study_id %in% ex), ]
  }

  # convert isolated OR -> RR where p0_ref present (rule 3); HR & RR kept as-is
  conv <- d$effect_measure == "OR" & !is.na(d$p0_ref)
  d$est <- d$effect_size; d$lo <- d$CI_lower; d$hi <- d$CI_upper
  d$est[conv] <- or_to_rr(d$effect_size[conv], d$p0_ref[conv])
  d$lo[conv]  <- or_to_rr(d$CI_lower[conv],  d$p0_ref[conv])
  d$hi[conv]  <- or_to_rr(d$CI_upper[conv],  d$p0_ref[conv])

  measures <- unique(d$effect_measure)
  d$yi  <- log(d$est)
  d$sei <- (log(d$hi) - log(d$lo)) / (2 * 1.96)
  d$vi  <- d$sei^2

  k_studies <- length(unique(d$study_id)); k_est <- nrow(d)
  cat(sprintf("\n=== %s ===\n", og))
  cat(sprintf("  studies=%d  estimates=%d  measures={%s}\n",
              k_studies, k_est, paste(measures, collapse = ",")))
  if (any(conv)) cat(sprintf("  OR->RR (Zhang-Yu) applied to %d estimate(s)\n", sum(conv)))
  if (length(setdiff(measures, c("OR","RR"))) > 0 && length(measures) > 1)
    cat("  NOTE: HR pooled with RR as 'ratio measures' (interpret with caution)\n")
  if (k_studies < 3) { cat("  <3 studies after exclusions -> NARRATIVE ONLY\n"); return(invisible()) }

  m <- rma.mv(yi, vi, random = ~ 1 | study_id/esid, data = d, method = "REML")
  rob <- conf_int(m, vcov = "CR2", cluster = d$study_id)   # cluster-robust CI (CR2)

  # multilevel I^2 (Cheung 2014): share of total variance that is between/within study
  W <- diag(1 / d$vi); X <- model.matrix(m)
  P <- W - W %*% X %*% solve(t(X) %*% W %*% X) %*% t(X) %*% W
  typ_v <- (m$k - m$p) / sum(diag(P))
  I2_total <- 100 * sum(m$sigma2) / (sum(m$sigma2) + typ_v)

  b <- as.numeric(coef(m))
  cat(sprintf("  POOLED %s = %.3f   (naive 95%% CI %.3f-%.3f)\n",
              if ("OR" %in% measures && !all(conv)) "ratio" else "RR",
              exp(b), exp(m$ci.lb), exp(m$ci.ub)))
  cat(sprintf("  CLUSTER-ROBUST (CR2) 95%% CI: %.3f - %.3f   [df=%.1f]\n",
              exp(rob$CI_L[1]), exp(rob$CI_U[1]), rob$df[1]))
  cat(sprintf("  sigma^2 (study)=%.4f  sigma^2 (within)=%.4f  I^2_total=%.1f%%\n",
              m$sigma2[1], m$sigma2[2], I2_total))
  if (I2_total > 75) cat("  I^2 > 75% -> do NOT interpret pooled estimate; narrative/SWiM.\n")
  invisible(m)
}

for (og in c("HbA1c_control","HbA1c_monitoring","Retinopathy_screening",
             "All-cause_mortality","CV_disease"))
  try(run_outcome(og), silent = FALSE)

cat("\nNOTE: cluster-robust inference with <5 studies is low-powered (CR2 + Satterthwaite df).\n")
cat("Validate study inclusion and the exclude_primary toggles before reporting.\n")
