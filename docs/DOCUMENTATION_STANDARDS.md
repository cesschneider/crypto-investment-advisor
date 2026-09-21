# Documentation Standards — Crypto Investment Advisor

**Version:** 1.0  
**Effective Date:** 2026-09-20  
**Author:** B.IA (Professional Advisor)  
**Status:** Active

---

## Overview

All project documentation follows institutional-grade standards with a focus on:
- **Reproducibility** — All findings backed by data
- **Auditability** — Version control, dated, sourced
- **Clarity** — Executive summaries, structured sections
- **Actionability** — Specific recommendations with timelines
- **Organization** — Type-based folder structure with consistent naming

---

## Folder Structure

```
/root/projects/crypto-investment-advisor/
├── docs/
│   ├── analysis/           # Detailed data analysis (performance, backtests, signals)
│   ├── reports/            # Daily/weekly performance reports & summaries
│   ├── guides/             # How-to docs (setup, running, interpreting results)
│   ├── research/           # Experimental findings, strategy research
│   └── logs/               # Execution logs, trade records, audit trails
├── src/
├── tests/
├── DEPLOYMENT_CHECKLIST.md (root level only)
└── README.md (root level only)
```

**Rules:**
- ❌ NO docs at project root (except README.md, DEPLOYMENT_CHECKLIST.md)
- ✅ ALL analysis → `/docs/analysis/`
- ✅ ALL reports → `/docs/reports/`
- ✅ ALL guides → `/docs/guides/`
- ✅ ALL research → `/docs/research/`

---

## Naming Convention

### Format
```
{type}_{YYYYMMDD}_{brief-description}.md
```

### Examples

| Type | Filename | Purpose |
|------|----------|---------|
| **analysis** | `analysis_20260920_performance.md` | Performance breakdown & metrics |
| **analysis** | `analysis_20260920_signal-comparison.md` | Signal criteria comparison |
| **reports** | `report_20260920_daily-summary.md` | Daily performance summary |
| **reports** | `report_20260921_weekly-wrap.md` | Weekly performance wrap-up |
| **guides** | `guide_setup-paper-trading.md` | Setup instructions (no date) |
| **guides** | `guide_interpret-reports.md` | How to read performance reports |
| **research** | `research_20260920_backtest-rsi-only.md` | Backtest results & findings |
| **research** | `research_20260921_multi-indicator-test.md` | New strategy research |
| **logs** | `log_20260920_trades.jsonl` | Trade execution log (one-per-day) |

---

## Document Format Template

### 1. Header Section
```markdown
# [Document Title]

**Date:** YYYY-MM-DD  
**Author:** B.IA (Professional Advisor)  
**Status:** [DRAFT | REVIEW | FINAL | ARCHIVED]  
**Related Files:** [link to related analysis]

---
```

### 2. Executive Summary (150-200 words max)
```markdown
## Executive Summary

[Clear, single-paragraph summary of findings]

**Key Finding:** [1-2 sentences on main takeaway]
**Recommendation:** [What to do about it]
**Impact:** [What happens if we implement]
```

### 3. Metrics & Data (Tables)
```markdown
## Performance Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Win Rate | 45% | ✅ Target |
| Profit Factor | 1.8 | ✅ Healthy |
```

### 4. Analysis (Sections with headers)
```markdown
## Root Cause Analysis

### Problem 1
[Detail]

### Problem 2
[Detail]
```

### 5. Recommendations (Priority-ordered)
```markdown
## Recommendations

### 🔴 URGENT (Today)
- [ ] Action 1
- [ ] Action 2

### 🟡 HIGH PRIORITY (This Week)
- [ ] Action 3

### 🟠 MEDIUM PRIORITY (Next Week)
- [ ] Action 4
```

### 6. Implementation Plan
```markdown
## Implementation Timeline

| Date | Action | Owner | Status |
|------|--------|-------|--------|
| 2026-09-20 | Implement stops | B.IA | ⏳ In Progress |
```

### 7. Financial Impact
```markdown
## Financial Impact Projection

**Current Path:** -$100/week if unchanged  
**With Recommendations:** +$25/week potential  
```

---

## File Versioning

- **All docs committed to git** with descriptive messages
- **Naming includes date** for quick reference (YYYYMMDD)
- **Old versions kept** (don't delete, mark as ARCHIVED in status)
- **Superseded docs cross-linked** (e.g., "See updated analysis_20260921_*.md")

### Example Git Commits
```bash
# Analysis commit
git commit -m "docs: add performance analysis - Sep 20 (-10% loss, signal issues)"

# Report commit
git commit -m "docs: daily performance report - Sep 20 (6 open positions)"

# Guide commit
git commit -m "docs: add guide for interpreting signal logs"
```

---

## Data Sources & Attribution

Every analysis must cite:
- **Data source:** Where did metrics come from? (e.g., `/tmp/crypto-advisor-paper-trading/performance-report.json`)
- **Time range:** What dates does this cover?
- **Sample size:** How many trades/days analyzed?
- **Assumptions:** What did we assume to be true?

### Example
```markdown
**Data Sources:**
- Performance data: `/tmp/crypto-advisor-paper-trading/performance-report.json`
- Trade logs: `/tmp/crypto-advisor-paper-trading/paper-trading-2026-09-20.json`
- Date range: 2026-09-19 to 2026-09-20 (24 hours)
- Sample size: 35 trades, 1 closed position
- Analysis tool: Custom Python scripts in `/src/analysis/`
```

---

## Quality Standards

### Before Publishing

- [ ] Title clearly describes content
- [ ] Executive summary is <200 words
- [ ] All tables are properly formatted
- [ ] All recommendations have clear actions
- [ ] Financial impact is quantified
- [ ] Data sources are cited
- [ ] File saved in correct `/docs/` subfolder
- [ ] Filename follows convention
- [ ] Committed to git with descriptive message

### Peer Review Checklist

When another analyst reviews your doc:
- [ ] Findings are reproducible
- [ ] Data sources are clear
- [ ] Assumptions are stated
- [ ] Recommendations are actionable
- [ ] No contradictions with previous reports
- [ ] Language is clear & professional

---

## Example: How This Report Was Saved

**Task:** Save performance analysis

**Process:**
1. ✅ Write comprehensive analysis
2. ✅ Move to correct folder: `docs/analysis/`
3. ✅ Name with convention: `analysis_20260920_performance.md`
4. ✅ Add header with date, status, related files
5. ✅ Include exec summary (key findings)
6. ✅ Cite data sources (trade logs, performance reports)
7. ✅ Priority recommendations (urgent → medium)
8. ✅ Financial impact projections
9. ✅ Commit to git: `"docs: add performance analysis - Sep 20 (-10% loss, signal issues)"`

**Result:** Professional, versioned, auditable documentation

---

## Archive Policy

When a report is superseded:
1. **Mark OLD doc:** Add `**[ARCHIVED]**` to header + link to new version
2. **Keep in repo:** Don't delete, maintain full history
3. **Link new doc:** Add cross-reference in new version back to old

Example:
```markdown
# [ARCHIVED] Performance Analysis — Sep 20

**⚠️ See updated version:** analysis_20260921_performance.md

[Original content below...]
```

---

## Tools & Integration

**Version Control:** Git (all docs committed)  
**Format:** Markdown (.md)  
**Logs:** JSON-Lines (.jsonl) for machine-readable data  
**Storage:** Project `/docs/` folders (never root)  
**Delivery:** Reports copied to WhatsApp/Telegram for alerts

---

## References

- **Project:** Crypto Investment Advisor (`/root/projects/crypto-investment-advisor/`)
- **Performance data:** `/tmp/crypto-advisor-paper-trading/`
- **Active reports:** Generated daily at 7 AM & 9 AM
- **B.IA role:** Professional advisor, institutional documentation standards

---

**Last Updated:** 2026-09-20  
**Next Review:** 2026-10-01 (after 2 weeks of reports)
