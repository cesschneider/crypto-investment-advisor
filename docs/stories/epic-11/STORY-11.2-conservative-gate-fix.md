---
status: Draft
story_id: 11.2
epic: 11
title: "Conservative profile gate fix + moderate block-reason logging"
owner: "@dev"
acceptance_criteria:
  - conservative.json no longer requires on-chain confirmation (unwired data source)
  - Conservative min_confidence lowered 75 → 65
  - Moderate/conservative rejection reasons logged every cycle
  - Existing jest suites stay green
---

# Story 11.2: Conservative gate fix + rejection logging

## Summary

The conservative profile is structurally dead: `require_on_chain_confirmation: true` can never
pass because on-chain data is not wired (Etherscan V1 deprecated), and `min_confidence: 75` is
near-unreachable (weak cap = 75). 0 trades in 9 days — dead capital, no differentiation data.

Additionally (carried from audit): moderate/conservative rejections are invisible — reports
cannot say *why* a profile didn't trade.

## Acceptance Criteria

- [ ] `config/profiles/conservative.json`: `require_on_chain_confirmation: false`,
      `min_confidence: 65`
- [ ] Engine emits `block_reason` on every NO_TRADE/INSUFFICIENT_DATA (already in `EngineResult`)
- [ ] Runner (`src/main.ts`) persists the last cycle's per-symbol `block_reason` + regime into
      the per-profile state file (`rejected_signals` array, capped at 200 entries)
- [ ] Unit test: NO_TRADE result produces a persisted `block_reason` record
- [ ] `npm test` all suites green

## Files

- `config/profiles/conservative.json` — gate fix
- `src/main.ts` — persist `rejected_signals` (symbol, action, confidence, block_reason, regime, ts)
- `src/__tests__/config.test.ts` — conservative gates assert
- `src/__tests__/signal-engine.test.ts` — block_reason present on NO_TRADE

## Validation Gates

1. `npm test` green
2. Post-merge live: conservative produces ≥ 1 tradeable signal within 72h (else re-tune).