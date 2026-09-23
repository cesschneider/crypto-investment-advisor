---
status: Done
story_id: 10.2
epic: 10
title: "Position sizing bug fix + corrupted state cleanup"
owner: "@dev"
acceptance_criteria:
  - Fixes the zero-quantity position sizing bug (NaN/0 size creating phantom positions)
  - Adds defensive guard in openPosition rejecting non-positive/invalid size
  - Adds cleanupPositions to remove corrupted zero-quantity and repair future-dated entries
  - Regression tests added and passing
---

# Story 10.2: Position sizing bug fix + corrupted state cleanup

## Summary

After launching Story 10.1, open-position inspection revealed a corrupted
`DOGE` position with quantity `4.74e-87` (effectively zero) and an `XRP` entry
timestamped in the future. The root cause: the runner applied a redundant
`Math.min(position_size, max_position_pct * equity)` overlay that could yield a
near-zero / NaN size when equity was a transient snapshot.

## Root Cause

`src/main.ts` re-clamped the engine's already-correct `position_size` against a
recomputed equity value that could be fleeting. The engine's
`VolatilityScaledSizer` already enforces `max_position_pct` and cash
constraints, so the overlay was unnecessary and harmful.

## Changes

- `src/main.ts` — remove the harmful `Math.min` overlay; use the engine's
  `position_size` directly; guard non-positive/NaN sizes with a block_reason log.
- `src/paper-trading/executor.ts`
  - `openPosition`: reject any trade_setup with non-positive/invalid size or price.
  - add `cleanupPositions()`: drop zero-quantity positions and repair future-dated `entry_time`.
  - wire `cleanupPositions()` into the restore path in `main.ts`.
- `src/__tests__/paper-trading-executor.test.ts` — +2 regression tests
  (reject invalid size; cleanup removes zero-qty + repairs future dates).

## Validation Gates

- [x] All 343 tests passing (21 suites)
- [x] `tsc --noEmit` clean
- [x] Executor suite: 11/11 (incl. 2 new regression tests)

## Related Issues

- Epic #10 (Profile-aware production runner)
- Follows Story 10.1
