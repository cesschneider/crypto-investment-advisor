---
status: Draft
story_id: 11.5
epic: 11
title: "Per-symbol cooldown after stop-out (24h)"
owner: "@dev"
acceptance_criteria:
  - A symbol stopped out (STOP_LOSS or TRAILING_STOP) cannot re-enter for 24h
  - TAKE_PROFIT exits do NOT trigger cooldown
  - Cooldown survives state restore (restart-safe)
  - All jest suites green
---

# Story 11.5: Per-symbol cooldown after stop-out

## Summary

ADA was stopped out 3× consecutively (−$4.44, −$19.89, −$20.21) — same falling pattern, immediate
re-entry each time. Add a per-symbol cooldown: after STOP_LOSS/TRAILING_STOP, that symbol is
blocked from opening for 24h (per profile). TAKE_PROFIT exits don't cool down (winners may re-enter).

## Acceptance Criteria

- [ ] Executor tracks `cooldowns: { [symbol]: expiry_ts }` (persisted in state)
- [ ] On close with exit_reason STOP_LOSS or TRAILING_STOP → symbol cooldown 24h
- [ ] `openPosition` rejects entries for symbols in cooldown (returns false + reason)
- [ ] Restored state keeps cooldowns active
- [ ] Unit tests: blocked re-entry inside window; allowed after expiry; TP exit → no cooldown
- [ ] `npm test` green

## Files

- `src/paper-trading/executor.ts` — cooldown map + open gate + persistence
- `src/__tests__/paper-trading-executor.test.ts` — cooldown cases

## Validation Gates

1. `npx jest src/__tests__/paper-trading-executor.test.ts` green
2. `npm test` green
3. Live: no symbol stops out > 2× within 24h in the next week (was 3×).