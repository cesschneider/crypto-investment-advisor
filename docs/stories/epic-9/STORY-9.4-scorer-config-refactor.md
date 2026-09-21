---
status: Done
story_id: 9.4
epic: 9
title: "SignalScorer accepts ScorerConfig"
owner: "@dev"
acceptance_criteria:
  - All scorer thresholds/weights come from ScorerConfig
  - No inline literals (RSI 30/70, MACD 10, volume ratios, action thresholds)
  - DEFAULT_SCORER_CONFIG preserves current behavior
---

# Story 9.4: SignalScorer accepts ScorerConfig

## Summary

SignalScorer accepts ScorerConfig. Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [x] All scorer thresholds/weights come from ScorerConfig
- [x] No inline literals (RSI 30/70, MACD 10, volume ratios, action thresholds)
- [x] DEFAULT_SCORER_CONFIG preserves current behavior

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
