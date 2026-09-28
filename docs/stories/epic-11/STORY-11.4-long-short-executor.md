---
status: Draft
story_id: 11.4
epic: 11
title: "Long/short executor (paper shorting)"
owner: "@dev"
acceptance_criteria:
  - SELL/WEAK_SELL signals open SHORT positions (not long)
  - Short P&L math is correct (entry−exit), stops/TP mirrored
  - Trailing/TP logic is side-aware
  - All jest suites green
---

# Story 11.4: Long/short executor

## Summary

`executor.ts:164` hardcodes `side: 'long'` even for SELL signals. In a DOWNTREND week the
bearish side was unrepresentable — 11/11 closed trades were long. Make the executor side-aware:
SELL/WEAK_SELL open shorts with mirrored risk math (stop above, TPs below, trailing on the
downside), sizing unchanged.

## Acceptance Criteria

- [ ] `openPosition()` derives side from `EngineResult.action` (BUY*→long, SELL*→short)
- [ ] Short stop/TP mirrored: stop_loss > entry, take_profits < entry
- [ ] Short P&L: `(entry − exit) × qty` (paper — no borrow cost modeling, documented)
- [ ] Trailing tracks *lowest* price for shorts; best_price update mirrored
- [ ] `ExitManager`/`executor` short-path unit tests: stop, TP, trailing, flip-exit
- [ ] `npm test` green

## Files

- `src/paper-trading/executor.ts` — side-aware open/close/P&L/trailing
- `src/engine/exit-manager.ts` — side-aware stop/TP/trail comparisons (if not already)
- `src/__tests__/paper-trading-executor.test.ts` — short-path cases

## Validation Gates

1. `npx jest src/__tests__/paper-trading-executor.test.ts` green
2. `npm test` green
3. Live: in the next DOWNTREND window, shorts appear in closed trades (else re-check engine
   SELL emission rate).