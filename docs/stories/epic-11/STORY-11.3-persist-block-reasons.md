---
status: Draft
story_id: 11.3
epic: 11
title: "Persist block_reason + regime per rejected signal (auditability)"
owner: "@dev"
acceptance_criteria:
  - Every rejected signal carries a machine-readable reason in the state file
  - The rejected_signals array is capped (no unbounded growth)
  - Daily report can cite why each profile did not trade
---

# Story 11.3: Persist rejection reasons (auditability)

## Summary

`EngineResult.block_reason` (highest-severity reason a trade was blocked) is produced by the
engine but never persisted. Daily performance reports are blind to *why* conservative/moderate
sit in cash. Persist per-symbol rejection records each cycle into the per-profile state file.

(Overlaps with 11.2's runner wiring — this story owns the *state schema*; 11.2 owns *conservative
gate values*. Merge order: 11.3 can merge before or after 11.2 independently.)

## Acceptance Criteria

- [ ] `RejectedSignal` schema: `{ symbol, profile, action, confidence, block_reason, regime?, alignment_score?, ts }`
- [ ] Executor/runner appends to `portfolio.rejected_signals`, cap 200 (drop oldest)
- [ ] Restore-from-state keeps rejected_signals intact
- [ ] Unit tests: append + cap behavior; NO_TRADE → record present
- [ ] `npm test` green

## Files

- `src/paper-trading/executor.ts` — `RejectedSignal` type + append/cap logic
- `src/main.ts` — feed engine NO_TRADE results into the record
- `src/__tests__/paper-trading-executor.test.ts` — append/cap tests

## Validation Gates

1. `npm test` green
2. Live check: next daily report cites block reasons ("why no trade") for flat profiles.