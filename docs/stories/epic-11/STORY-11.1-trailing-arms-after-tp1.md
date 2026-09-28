---
status: Draft
story_id: 11.1
epic: 11
title: "Trailing stop arms only after TP1 (breakeven → trail)"
owner: "@dev"
acceptance_criteria:
  - Trailing stop is INACTIVE until TP1 price is reached
  - Once TP1 is hit, stop moves to entry (breakeven) and trailing activates
  - A position that never reaches TP1 exits only via STOP_LOSS or SIGNAL_FLIP
  - Existing jest suites stay green
---

# Story 11.1: Trailing stop arms only after TP1

## Summary

Today `trailing_stop_pct` (fixed % per profile) trails from entry, so in HIGH_VOL regimes the
trail fires before TP1 (1.8×ATR) — 5 of 8 aggressive losses were TRAILING_STOP, −$18 to −$20.
Change the exit logic so the trail arms only after TP1 is reached: below TP1, only the
hard STOP_LOSS (ATR-based) and SIGNAL_FLIP apply; at TP1, stop jumps to breakeven and the
trailing stop takes over.

## Acceptance Criteria

- [ ] `ExitManager` accepts `trail_activation` config (default: `tp1` — activates trailing at TP1)
- [ ] Below TP1: no trailing; exits only on STOP_LOSS (ATR stop) or SIGNAL_FLIP
- [ ] At/after TP1: stop = max(entry, trail from best price); trailing per profile pct
- [ ] Unit tests cover: (a) never-TP1 position exits at STOP_LOSS not TRAILING_STOP, (b) TP1-hit
      position trails from best price, (c) no double-exit at TP1 (allocation math unchanged)
- [ ] `npm test` all suites green

## Files

- `src/engine/exit-manager.ts` — add `trail_activation` option; gate trailing on TP1 reached
- `src/paper-trading/executor.ts` — pass `trail_activation` through from config
- `src/config/advisor-config.ts` — add `exit.trail_activation` ('tp1' default)
- `src/__tests__/exit-manager.test.ts` — new cases
- `src/__tests__/paper-trading-executor.test.ts` — regression case

## Validation Gates

1. `npx jest src/__tests__/exit-manager.test.ts` green
2. `npm test` (all) green
3. Backtest sanity (optional, post-merge): re-run last 7 days of Binance OHLCV through the
   executor offline — expect trailing-stop share of losses to drop from 62.5%.