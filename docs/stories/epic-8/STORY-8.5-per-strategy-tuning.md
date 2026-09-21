---
status: Done
story_id: 8.5
epic: 8
title: "Per-strategy tuning dimension"
owner: "@dev"
acceptance_criteria:
  - StrategyTuning: enabled + indicator params + entry/exit thresholds + regime weights
  - Conservative disables mean-reversion; aggressive loosens thresholds
  - Engine vetoes entry when regime maps to no enabled strategy
---

# Story 8.5: Per-strategy tuning dimension

## Summary

Per-strategy tuning dimension. Part of Epic 8 (Investor Profile & Signal Engine Integration).

## Acceptance Criteria

- [x] StrategyTuning: enabled + indicator params + entry/exit thresholds + regime weights
- [x] Conservative disables mean-reversion; aggressive loosens thresholds
- [x] Engine vetoes entry when regime maps to no enabled strategy

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #8 (Investor Profile & Signal Engine Integration)
