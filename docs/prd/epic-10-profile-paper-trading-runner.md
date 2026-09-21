# Epic 10 — Profile-Aware Production Runner

## Objective

Restore a production signal/paper-trading loop after Story 9.6 deleted the legacy
single-profile `main.ts`, and upgrade it to run all three risk profiles
(conservative / moderate / aggressive) independently through the post-audit
SignalEngine + PaperTradingExecutor.

## Context

The audit remediation sprint (Epics 3–7) + investor-profile/signal-engine work
(Epics 8–9) built a profile-aware decision engine but left no running entrypoint.
The production systemd service still pointed at a deleted `src/main.ts`, so the
live process was the stale legacy RSI-only engine producing no profile-tagged data.

## Scope

- Persistent hourly runner over live Binance OHLCV
- Independent paper-trading simulation per risk profile
- Profile-tagged signals + portfolio snapshots
- Persisted per-profile portfolio state (restart-safe)

## Deliverables

- `src/main.ts` runner (Story 10.1)
- `src/utils/indicators.ts` deterministic math
- Executor serialization (`exportState` / `restoreState`)
- Profile-aware signal + performance output feeds consumed by cron briefs

## Status

- Story 10.1: **Done** (runner + indicators + persistence + tests)

## Next (out of scope for Epic 10)

- Wire macro / sentiment / on-chain external feeds into the runner inputs
- Per-profile FreqUI-style review dashboard
