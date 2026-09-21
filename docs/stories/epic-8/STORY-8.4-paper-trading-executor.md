---
status: Done
story_id: 8.4
epic: 8
title: "Profile-aware paper trading executor"
owner: "@dev"
acceptance_criteria:
  - Uses SignalEngine + ExitManager + InvestorProfile
  - Enforces max exposure + max drawdown from profile
  - Replaces legacy RSI-only fixed-2% engine
---

# Story 8.4: Profile-aware paper trading executor

## Summary

Profile-aware paper trading executor. Part of Epic 8 (Investor Profile & Signal Engine Integration).

## Acceptance Criteria

- [x] Uses SignalEngine + ExitManager + InvestorProfile
- [x] Enforces max exposure + max drawdown from profile
- [x] Replaces legacy RSI-only fixed-2% engine

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #8 (Investor Profile & Signal Engine Integration)
