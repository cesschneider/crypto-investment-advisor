---
status: Done
story_id: 8.1
epic: 8
title: "InvestorProfile risk templates (low/mid/high)"
owner: "@dev"
acceptance_criteria:
  - Three named profiles: conservative/moderate/aggressive
  - Profile parameterizes sizing, stops, TPs, min R:R, confidence, drawdown, exposure, confirmations
  - getProfile(name, overrides) resolves a template with field-level overrides
---

# Story 8.1: InvestorProfile risk templates (low/mid/high)

## Summary

InvestorProfile risk templates (low/mid/high). Part of Epic 8 (Investor Profile & Signal Engine Integration).

## Acceptance Criteria

- [x] Three named profiles: conservative/moderate/aggressive
- [x] Profile parameterizes sizing, stops, TPs, min R:R, confidence, drawdown, exposure, confirmations
- [x] getProfile(name, overrides) resolves a template with field-level overrides

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #8 (Investor Profile & Signal Engine Integration)
