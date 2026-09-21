---
status: Done
story_id: 8.2
epic: 8
title: "SignalEngine decision pipeline"
owner: "@dev"
acceptance_criteria:
  - Wires RegimeClassifier, MultiTimeframeAnalyzer, SignalScorer, Derivatives, OnChain, Sentiment, Macro, ATR risk, Volatility sizing, Drawdown breaker in order
  - Emits structured EngineResult with action + trade_setup
  - INSUFFICIENT_DATA / NO_TRADE are first-class outcomes
---

# Story 8.2: SignalEngine decision pipeline

## Summary

SignalEngine decision pipeline. Part of Epic 8 (Investor Profile & Signal Engine Integration).

## Acceptance Criteria

- [x] Wires RegimeClassifier, MultiTimeframeAnalyzer, SignalScorer, Derivatives, OnChain, Sentiment, Macro, ATR risk, Volatility sizing, Drawdown breaker in order
- [x] Emits structured EngineResult with action + trade_setup
- [x] INSUFFICIENT_DATA / NO_TRADE are first-class outcomes

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #8 (Investor Profile & Signal Engine Integration)
