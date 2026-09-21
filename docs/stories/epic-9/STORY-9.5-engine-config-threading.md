---
status: InProgress
story_id: 9.5
epic: 9
title: "SignalEngine threads AdvisorConfig"
owner: "@dev"
acceptance_criteria:
  - Engine constructs every service from the resolved AdvisorConfig
  - Profile config flows into ATR risk, sizing, drawdown, strategy weights
  - Removes inline multipliers (0.8/1.5 stop scaling)
---

# Story 9.5: SignalEngine threads AdvisorConfig

## Summary

SignalEngine threads AdvisorConfig. Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [ ] Engine constructs every service from the resolved AdvisorConfig
- [ ] Profile config flows into ATR risk, sizing, drawdown, strategy weights
- [ ] Removes inline multipliers (0.8/1.5 stop scaling)

## Validation Gates

- [ ] Unit tests passing
- [ ] No type errors
- [ ] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
