---
status: Draft
epic: 11
title: "Paper-Trading Strategy Improvements (post 9-day differentiation audit)"
owner: "@dev"
created: 2026-09-28
---

# Epic 11: Paper-Trading Strategy Improvements

## Problem / Evidence (9 days of paper data, 2026-09-19 → 09-28)

Three structural weaknesses surfaced in the profile differentiation test:

1. **Executor is long-only** — `executor.ts:164` hardcodes `side: 'long'` even when the
   SignalEngine emits `SELL/WEAK_SELL`. In a DOWNTREND week (9/10 assets), the bearish side
   of the strategy is unrepresented. 11/11 closed trades are long.
2. **Trailing stops suffocate winners before TP1** — 5 of 8 losses are `TRAILING_STOP`
   (−$18 to −$20 each). The fixed 2% trailing (aggressive) fires before TP1 (1.8×ATR) is
   reached in HIGH_VOL regimes. Winners: 3 SOL take-profits (+$27 net) — the only trades
   given room to breathe.
3. **Conservative profile is structurally dead** — `conservative.json` requires
   `require_on_chain_confirmation: true`, but on-chain data is not wired (Etherscan V1
   deprecated). The gate can never pass → 0 trades in 9 days. `min_confidence: 75`
   is near-unreachable (weak cap 75, strong base 60 minus macro penalties).
4. **Rejection reasons are not persisted** — `EngineResult.block_reason` exists but is never
   written to state/JSON. Daily reports cannot explain why moderate/conservative didn't trade.
5. **No per-symbol cooldown after stop-out** — ADA stopped out 3× in a row (−$4.44, −$19.89,
   −$20.21). Re-entry on the same falling pattern is allowed immediately.
6. **Oversold RSI longs in DOWNTREND without higher-TF filter** — mean-reversion entries
   catch falling knives in persistent downtrends; the regime adjusts stops but doesn't block entry.

## Goals

- All three profiles produce tradeable decisions (differentiation test has data to rank)
- Loss profile shifts from "trailing-stop suffocation" to "risk-budgeted stops"
- Every NO_TRADE is explainable from persisted state (auditability)
- No regression in the 22 existing jest suites (test gates per story)

## Stories (priority order)

| # | Story | Files | Tests |
|---|-------|-------|-------|
| 1 | STORY-11.1 Trailing stop arms only after TP1 (breakeven → trail) | exit-manager.ts, executor.ts | exit-manager, paper-trading-executor |
| 2 | STORY-11.2 Conservative profile: gate fix (on-chain off, confidence 65) + daytrade off audit | config/profiles/conservative.json | config |
| 11.2b | (part of 11.2) Moderate: log block reasons every cycle | main.ts, executor.ts | signal-engine, main-cycle |
| 3 | STORY-11.3 Persist block_reason + regime per rejected signal | signal-engine.ts, main.ts | signal-engine |
| 4 | STORY-11.4 Long/short executor (paper shorting) | executor.ts, main.ts | paper-trading-executor |
| 5 | STORY-11.5 Per-symbol cooldown 24h after STOP_LOSS/TRAILING_STOP | executor.ts | paper-trading-executor |
| 6 | STORY-11.6 Regime-conditional entries (block oversold longs in DOWNTREND without higher-TF alignment) | signal-engine.ts | signal-engine |

## Validation strategy

Per-story jest gates (listed in each story file). Epic-level validation:

1. All existing suites green (`npm test` → 22 suites) after each story merge.
2. Post-merge live validation: 72h observation window on the live runner — expect
   conservative ≥ 1 trade / moderate ≥ 2 trades / aggressive unchanged or better.
   (Paper money; no capital at risk.)
3. Success metric: win rate on closed trades ≥ the 9-day baseline (27.3%) and trailing-stop
   share of losses < 50% (was 62.5%).
4. Any story that regresses a jest suite is rolled back before the next story starts.

## Out of scope

- On-chain data source rewiring (needs a new provider; tracked separately)
- Short-side strategy tuning beyond executor capability
- Live-trading integration (paper only)