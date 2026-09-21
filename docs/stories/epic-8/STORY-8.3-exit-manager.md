---
status: Done
story_id: 8.3
epic: 8
title: "ExitManager position lifecycle"
owner: "@dev"
acceptance_criteria:
  - STOP_LOSS / TAKE_PROFIT / TRAILING_STOP / SIGNAL_FLIP exits
  - Cascaded take-profit (fractional close)
  - Deterministic exit decisions with logged reason
---

# Story 8.3: ExitManager position lifecycle

## Summary

ExitManager position lifecycle. Part of Epic 8 (Investor Profile & Signal Engine Integration).

## Acceptance Criteria

- [x] STOP_LOSS / TAKE_PROFIT / TRAILING_STOP / SIGNAL_FLIP exits
- [x] Cascaded take-profit (fractional close)
- [x] Deterministic exit decisions with logged reason

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #8 (Investor Profile & Signal Engine Integration)
