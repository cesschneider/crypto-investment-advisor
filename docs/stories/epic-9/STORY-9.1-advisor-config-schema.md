---
status: Done
story_id: 9.1
epic: 9
title: "AdvisorConfig schema + defaults"
owner: "@dev"
acceptance_criteria:
  - Full nested config schema (scorer/sizing/risk/drawdown/strategy/macro/derivatives/onchain/sentiment/freshness)
  - DEFAULT_ADVISOR_CONFIG + mergeConfig deep-merge helper
  - No business logic hardcodes a threshold
---

# Story 9.1: AdvisorConfig schema + defaults

## Summary

AdvisorConfig schema + defaults. Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [x] Full nested config schema (scorer/sizing/risk/drawdown/strategy/macro/derivatives/onchain/sentiment/freshness)
- [x] DEFAULT_ADVISOR_CONFIG + mergeConfig deep-merge helper
- [x] No business logic hardcodes a threshold

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
