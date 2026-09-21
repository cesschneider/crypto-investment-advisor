# Performance Report vs New Advisor Implementation — Coverage Analysis

**Date**: 2026-09-20
**Source report**: `docs/analysis/PERFORMANCE_ANALYSIS_20260920.md` (paper trading, RSI-only era)
**New implementation**: Epics 3–7 merged to `master` (multi-factor SignalScorer + regime + data + risk + backtesting)

This document maps every recommendation in the legacy performance report to the new
advisor implementation: which are already covered, how they were fixed, and which
remain open (with a proposed solution).

---

## 1. Coverage Matrix

| # | Report finding (root cause) | New implementation | Status |
|---|---|---|---|
| 1 | **RSI-only signal** → false entries | `SignalScorer` (Story 3.1): 8-dimension scoring, 2+ supporting dimensions required | ✅ Covered |
| 2 | **No take-profit** → holds forever | `ATRRiskCalculator` (6.1): cascaded TP1/TP2 (50% @ 1.5 ATR, 50% @ 2.5 ATR) | ✅ Covered |
| 3 | **No stop-loss** → losses compound | `ATRRiskCalculator` (6.1): ATR-scaled stop (regime-aware multiplier) | ✅ Covered |
| 4 | **No macro filter** → trades in any condition | `MacroAnalyzer` (5.3): RISK_ON/NEUTRAL/RISK_OFF + contradiction confidence-reduction | ✅ Covered |
| 5 | **2% fixed position size** → too aggressive | `VolatilityScaledSizer` (6.2): inverse-volatility sizing + caps | ✅ Covered |
| 6 | **Entry logic (buy oversold, never exit overbought)** | `SignalScorer` + `ATRRiskCalculator` + exit logic (see below) | ⚠️ Partial |
| 7 | **Signal-reality mismatch (own assets flipping to SELL)** | `StrategyWeighter` (4.3) resolves conflicts; exit rules pending (see §3) | ⚠️ Partial |
| 8 | **No multi-indicator confirmation** | `SignalScorer`: momentum = RSI + MACD histogram jointly | ✅ Covered |
| 9 | **No regime detection** | `RegimeClassifier` (4.1): 9-state + UNKNOWN | ✅ Covered |
| 10 | **No multi-timeframe alignment** | `MultiTimeframeAnalyzer` (4.2): 5-TF alignment + 30–50% penalty | ✅ Covered |
| 11 | **No derivatives confirmation** | `DerivativesAnalyzer` (5.1): OI/funding/liq → CONFIRM/CONTRADICT | ✅ Covered |
| 12 | **No on-chain data** | `OnChainAnalyzer` (5.2): MVRV/SOPR/netflow/stablecoin → verdict | ✅ Covered |
| 13 | **No sentiment** | `SentimentAnalyzer` (5.4): Fear & Greed → CONFIRM/CONTRARIAN | ✅ Covered |
| 14 | **No backtest / no validation** | `backtest_runner.py` + `walk_forward.py` + `ground_truth.py` (Epic 7) | ✅ Covered |
| 15 | **No data freshness / staleness gate** | `InputValidator` (3.4): max age + future-ts + cross-source checks | ✅ Covered |
| 16 | **No exit-reason logging / macro-at-trade logging** | `operation-logger.ts` + `macro-context.ts` exist but **not wired into new engine** | ❌ Open |
| 17 | **No investor risk profile / parameter tuning** | **Not implemented anywhere** | ❌ Open (this task) |

---

## 2. How each covered topic was fixed

| Topic | Legacy (RSI-only) | New implementation |
|---|---|---|
| **Signal generation** | `RSI<30 → BUY`, `RSI>70 → SELL`, ±30/15/20 conf | 8 weighted dimensions; `<3 contributing → INSUFFICIENT_DATA`; confidence = evidence strength |
| **Stop-loss** | none | ATR(14) × regime multiplier (1.5× high-vol, 0.8× low-vol) |
| **Take-profit** | none | 50% at 1.5 ATR, 50% at 2.5 ATR (blended R:R checked ≥ min) |
| **Risk/reward gate** | none | `ATRRiskCalculator` rejects trades with R:R < min (default 1.5) → `INADEQUATE_RR` |
| **Position sizing** | fixed 2% | inverse-volatility, capped by max-position + portfolio-risk + correlation |
| **Drawdown guard** | none | `DrawdownCircuitBreaker` (6.3): blocks new entries >15% DD, signals continue |
| **Regime** | none | 9-state classifier from 1D candles; drives strategy weights |
| **Strategy conflict** | n/a | `StrategyWeighter`: swing vs daytrade resolved by regime weight, LIQUIDITY_SHOCK veto |
| **Macro** | none | VIX+S&P → RISK_ON/OFF; contradicting signal −25% confidence |
| **Data integrity** | none | `InputValidator`: future-timestamp reject, spot/perp divergence, spread, stale → INSUFFICIENT_DATA |
| **Validation** | "±1% vs TradingView" (fake) | `ground_truth.py`: false-signal rate vs realized movement + cost model + sample-size gate |

---

## 3. Gaps still open (proposed solution below)

**G1 — No orchestration engine.** The 11 new services exist as isolated, tested units
but nothing wires them into a single decision pipeline that the paper-trader can call.

**G2 — Paper-trading engine not integrated.** `src/paper-trading/` (portfolio, service)
lives on the legacy `main` branch and still consumes raw RSI signals. It was never
reconciled onto `master` nor wired to the new services.

**G3 — No exit execution.** `ATRRiskCalculator` computes stops/TPs, but nothing *acts*
on them (no position lifecycle: entry → trailing → TP/SL hit → close). This is finding #6/#7
(exit strategy, signal-reality mismatch) — the most impactful unresolved item.

**G4 — No investor risk profile.** The report's "2% too aggressive" is a per-investor
decision, not a global constant. No mechanism lets parameters/strategies be tuned per
risk tolerance.

---

## 4. Proposed Solution

A new **`SignalEngine`** orchestration layer + **`InvestorProfile`** configuration, wired
into the paper-trading simulator. See the implementation for details:

1. **`src/profiles/investor-profile.ts`** — 3 templates (low/mid/high risk) that parameterize
   every tunable knob across the services: position sizing, stop/TP ATR multiples, min R:R,
   min confidence, max drawdown, max exposure, strategy weights, which confirmations are required.

2. **`src/engine/signal-engine.ts`** — the decision pipeline that runs, in order:
   `InputValidator → RegimeClassifier → MultiTimeframeAnalyzer → SignalScorer →
   DerivativesAnalyzer → OnChainAnalyzer → SentimentAnalyzer → MacroAnalyzer →
   ATRRiskCalculator → VolatilityScaledSizer → DrawdownCircuitBreaker` and emits a
   single structured `SignalOutput` with a `trade_setup` (entry/stop/TP/size) and an
   `action` that the paper-trader executes.

3. **`src/engine/exit-manager.ts`** — position lifecycle: applies the profile's stop-loss
   and cascaded take-profit to open positions every cycle, logging exit reasons
   (`STOP_LOSS` / `TAKE_PROFIT_1` / `TAKE_PROFIT_2` / `SIGNAL_FLIP` / `DRAWDOWN`).

4. **Wire paper-trading** — reconcile `src/paper-trading/*` onto `master`, replace the
   RSI-only signal with `SignalEngine` output, and drive exits through `ExitManager`.

This directly closes G1–G4 and makes the report's every open item actionable.
