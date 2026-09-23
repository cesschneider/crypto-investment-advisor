---
status: Done
story_id: 10.3
epic: 10
title: "Fix cascaded take-profit re-fire (runaway phantom trades)"
owner: "@dev"
acceptance_criteria:
  - Prevents a cascaded TP level from firing repeatedly on consecutive cycles while price stays above the threshold
  - Consume hit TP level so each position scales out at most once per level
  - Guards zero-quantity / float error closes
  - Regression test added and passing
---

# Story 10.3: Fix cascaded take-profit re-fire

## Summary

Investigation of paper-trading integrity exposed the aggressive profile with
**570 "closed trades" from only 10 real positions**, 181 exact duplicates, 565
paper wins, and a trailing-stop record with quantity `4.7e-138`.

Root cause: the cascaded take-profit in `ExitManager.evaluate()` returns a
TAKE_PROFIT decision whenever `price >= TP.price`. The executor closed `tp.percent`
per cycle but never consumed the hit TP level. As long as price stayed above TP1,
each hourly cycle closed another 50% of the position → infinite partial closes,
each logged as a new "trade" → runaway duplicate records and fake win-rate.

## Changes

- `src/paper-trading/executor.ts` `closePosition()`:
  - Consume the hit TP level (`pos.take_profits` filtered by `tp_index`) so a
    level can only fire once per position.
  - Guard against closing effectively-zero quantities (float-error / phantom).
  - Clamp `closeQty` to `pos.quantity`; drop position when remaining <= epsilon.
- `src/__tests__/paper-trading-executor.test.ts` — +1 regression test proving a
  consumed TP1 does not re-fire on the next cycles.

## Validation Gates

- [x] All 344 tests passing (21 suites)
- [x] `tsc --noEmit` clean
- [x] Executor suite: 12/12 (incl. cascaded-TP regression)

## Related Issues

- Epic #10 (Profile-aware production runner)
- Follows Stories 10.1, 10.2
