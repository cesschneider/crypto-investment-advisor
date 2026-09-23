# Crypto Advisor — Paper Trading Integrity Recap (Sep 23, 2026)

## What changed this session
Built the profile-aware paper-trading runner (Story 10.1) and fixed two data-integrity bugs:

1. **Story 10.1** — `src/main.ts` runner driving SignalEngine + PaperTradingExecutor across 3 risk profiles.
2. **Story 10.2** — fixed zero-quantity phantom positions: removed redundant `Math.min` sizing clamp; `openPosition` rejects non-positive/invalid size; added `cleanupPositions()`.
3. **Story 10.3** — fixed cascaded take-profit re-fire: the executor now consumes the hit TP level so positions scale out once per level instead of every cycle (was producing 570 phantom "trades" from 10 real positions).

## Current verified state
- Aggressive: 2 open (ADA, XRP), 0 closed, cash $8.6k
- Moderate: flat (0 open)
- Conservative: flat (0 open)
- Cron: 7AM brief (54288efe), 9AM report (ab2c8e0c), Sat weekly (300650b3) — all profile-aware.
