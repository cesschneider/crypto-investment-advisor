---
status: Done
story_id: 10.1
epic: 10
title: "Profile-aware paper-trading runner (3 risk profiles)"
owner: "@dev"
acceptance_criteria:
  - Builds a persistent runner entrypoint (src/main.ts) that drives the SignalEngine + PaperTradingExecutor
  - Generates signals and paper-trades independently for conservative, moderate, and aggressive profiles
  - Tags every signal and portfolio snapshot with its profile
  - Persists per-profile portfolio state so the 24/7 service survives restarts
  - No fabricated data — all quantitative inputs derive from live Binance OHLCV
---

# Story 10.1: Profile-aware paper-trading runner

## Summary

Restores a production signal/paper-trading loop after Story 9.6 deleted the legacy
single-profile `main.ts`. The new runner drives all three risk profiles
(conservative / moderate / aggressive) through the post-audit SignalEngine and
PaperTradingExecutor, persisting per-profile state and writing profile-tagged
signals + performance snapshots.

## Acceptance Criteria

- [x] Runner entrypoint (`src/main.ts`) drives SignalEngine + PaperTradingExecutor
- [x] Signals + paper trades generated independently for all 3 risk profiles
- [x] Every signal and portfolio snapshot tagged with its profile
- [x] Per-profile portfolio state persisted (`/tmp/crypto-advisor-paper-trading/state-<profile>.json`) for restart survival
- [x] No fabricated data — deterministic indicator math over live Binance OHLCV; absent dimensions → non-contributing → lower confidence (per engine contract)

## Files

- `src/main.ts` — NEW profile-aware runner (hourly loop + `--once` mode)
- `src/utils/indicators.ts` — NEW pure RSI/MACD/SMA/Bollinger/ATR/trend math
- `src/paper-trading/executor.ts` — ADD `exportState()` / `restoreState()` for persistence
- `src/__tests__/paper-trading-executor.test.ts` — ADD 2 tests (round-trip, idempotent restore)

## Validation Gates

- [x] All test suites passing (339 tests before, +2 executor tests = 341)
- [x] `tsc --noEmit` clean
- [x] Live one-off run (`--once`) produces 30 profile-tagged signals, 3 profiles; aggressive opens positions while conservative/moderate gate on confirmation thresholds

## Related Issues

- Epic #10 (Profile-aware production runner)
- Depends on PR #30 (Epics 8–9 engine foundation)
