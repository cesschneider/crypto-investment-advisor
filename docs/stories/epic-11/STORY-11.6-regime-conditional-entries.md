---
status: Draft
story_id: 11.6
epic: 11
title: "Regime-conditional entries: block oversold longs in DOWNTREND without higher-TF alignment"
owner: "@dev"
acceptance_criteria:
  - In DOWNTREND regime, mean-reversion longs (RSI oversold) are blocked unless higher-TF alignment is bullish
  - Regime is already detected (RegimeClassifier); entry gate consumes it
  - UPTREND/RANGE regimes unaffected
  - All jest suites green
---

# Story 11.6: Regime-conditional entries

## Summary

The swing strategy opens longs on oversold RSI even in persistent DOWNTRENDs (falling knives).
The regime is detected and only widens stops today — it doesn't gate the entry. Make the entry
regime-aware: in DOWNTREND, mean-reversion longs require higher-timeframe alignment bullish
(or are blocked outright if alignment is bearish). UPTREND/RANGE behavior unchanged.

## Acceptance Criteria

- [ ] `SignalEngine.evaluate()` consumes `regime` in the entry decision
- [ ] DOWNTREND + no higher-TF bullish alignment → NO_TRADE with block_reason
      `REGIME_BLOCKED_MEAN_REVERSION` (confidence preserved in evidence)
- [ ] DOWNTREND + bullish higher-TF alignment → allowed (existing flow)
- [ ] UPTREND/RANGE → unchanged
- [ ] Unit tests: 3 regime × 2 alignment combinations
- [ ] `npm test` gate green

## Files

- `src/engine/signal-engine.ts` — regime entry gate
- `src/__tests__/signal-engine.test.ts` — regime cases

## Validation Gates

1. `npx jest src/__tests__/signal-engine.test.ts` green
2. `npm test` green
3. Live: oversold-long entries in DOWNTREND drop to ~0 over the next week.