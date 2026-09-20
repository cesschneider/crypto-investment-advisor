/**
 * STORY-4.3: Gate Strategy Weights by Regime (Epic 4 — Market Regime Detection)
 *
 * Applies regime-based weighting to the existing Swing (trend-following) and
 * DayTrade (mean-reversion) strategies so that no single static strategy
 * dominates all regimes. Trend-following gets higher weight in strong trends;
 * mean-reversion gets higher weight in ranges/sideways. High-volatility
 * regimes reduce both weights, and LIQUIDITY_SHOCK vetoes entry entirely.
 *
 * Audit requirement (FR-403, audit §5):
 *  - Swing weight: 80% in STRONG_BULL/STRONG_BEAR, 40% in WEAK_BULL/WEAK_BEAR,
 *    10% in SIDEWAYS.
 *  - DayTrade weight: 10% in strong trends, 50% in ranges (weak trend), 70% in
 *    SIDEWAYS.
 *  - High-volatility regime reduces both strategy weights.
 *  - LIQUIDITY_SHOCK vetoes entry entirely.
 *  - Conflicting signals (Swing BUY + DayTrade SELL) are resolved via regime
 *    weight — NOT a naive average.
 *
 * Every quantitative input comes from the caller (deterministic combination) —
 * this class performs NO network I/O and invents NO data.
 */

import { Regime, RegimeEnum } from './RegimeClassifier';

/** The two strategy archetypes gated by regime. */
export type StrategyName = 'swing' | 'daytrade';

/** A single strategy's directional verdict. */
export interface StrategySignal {
  strategy: StrategyName;
  /** Directional action this strategy would take. */
  action: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
  /**
   * Directional score 0-100: >50 leans bullish, <50 leans bearish, 50 neutral.
   * Used for the weighted combination (not the action enum alone).
   */
  score: number;
  /** Evidence confidence 0-100 (not win probability). */
  confidence: number;
  /** Human-readable rationale for this strategy's verdict. */
  rationale: string;
}

/** Structured output of regime-gated strategy weighting. */
export interface StrategyWeightResult {
  /** Normalized-ish weights (sum may be < 1 by design; see rationale). */
  strategy_weights: { swing: number; daytrade: number };
  /** Which strategy dominates under the current regime ('none' when vetoed/unknown). */
  dominant_strategy: StrategyName | 'none';
  /** Weighted combination of the two strategy scores (0-100, >50 bullish). */
  combined_score: number;
  /** Final action after regime weighting (NO_TRADE when vetoed). */
  combined_action: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
  /** True when the regime vetoes entry (LIQUIDITY_SHOCK / unknown). */
  vetoed: boolean;
  /** Human-readable chain of reasoning. */
  rationale: string;
}

/** Per-regime base weights for each strategy archetype. */
export interface StrategyWeightConfig {
  swing: Partial<Record<RegimeEnum, number>>;
  daytrade: Partial<Record<RegimeEnum, number>>;
}

/**
 * Default weight table (FR-403). Weights are relative and normalized at
 * combination time, so the 80/10 split in strong trends is intentional.
 */
export const DEFAULT_STRATEGY_WEIGHTS: StrategyWeightConfig = {
  swing: {
    STRONG_BULL: 0.8,
    STRONG_BEAR: 0.8,
    WEAK_BULL: 0.4,
    WEAK_BEAR: 0.4,
    SIDEWAYS: 0.1,
    HIGH_VOL: 0.2, // reduced (high volatility)
    LOW_VOL: 0.3,
    TRANSITION: 0.3,
    LIQUIDITY_SHOCK: 0, // veto
    UNKNOWN: 0.4,
  },
  daytrade: {
    STRONG_BULL: 0.1,
    STRONG_BEAR: 0.1,
    WEAK_BULL: 0.5, // range / weak trend
    WEAK_BEAR: 0.5,
    SIDEWAYS: 0.7,
    HIGH_VOL: 0.15, // reduced (high volatility)
    LOW_VOL: 0.5,
    TRANSITION: 0.3,
    LIQUIDITY_SHOCK: 0, // veto
    UNKNOWN: 0.4,
  },
};

/** Score threshold above which a combined score yields BUY. */
const BUY_THRESHOLD = 60;
/** Score threshold below which a combined score yields SELL. */
const SELL_THRESHOLD = 40;

export class StrategyWeighter {
  private config: StrategyWeightConfig;

  constructor(config: StrategyWeightConfig = DEFAULT_STRATEGY_WEIGHTS) {
    this.config = config;
  }

  /**
   * Combine two strategy signals under a market regime using regime-gated
   * weights. Conflicting signals are resolved by the regime-weighted score,
   * never a naive average.
   *
   * @param regime The market regime (from RegimeClassifier).
   * @param swing The Swing (trend-following) strategy signal.
   * @param daytrade The DayTrade (mean-reversion) strategy signal.
   */
  weight(
    regime: Regime,
    swing: StrategySignal,
    daytrade: StrategySignal,
  ): StrategyWeightResult {
    const swingWeight = this.weightFor('swing', regime.regime);
    const daytradeWeight = this.weightFor('daytrade', regime.regime);

    const totalWeight = swingWeight + daytradeWeight;

    // LIQUIDITY_SHOCK (or any regime that zeroes both weights) → veto entry.
    if (regime.regime === 'LIQUIDITY_SHOCK' || totalWeight <= 0) {
      return {
        strategy_weights: { swing: swingWeight, daytrade: daytradeWeight },
        dominant_strategy: 'none',
        combined_score: 50,
        combined_action: 'NO_TRADE',
        vetoed: true,
        rationale: this.vetoRationale(regime),
      };
    }

    // Weighted combination (normalized by sum of weights).
    const combinedScore =
      (swing.score * swingWeight + daytrade.score * daytradeWeight) / totalWeight;

    const dominant = this.dominantStrategy(swingWeight, daytradeWeight);

    let action: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
    if (combinedScore >= BUY_THRESHOLD) action = 'BUY';
    else if (combinedScore <= SELL_THRESHOLD) action = 'SELL';
    else action = 'HOLD';

    const rationale = this.buildRationale(
      regime,
      swing,
      daytrade,
      swingWeight,
      daytradeWeight,
      dominant,
      combinedScore,
      action,
    );

    return {
      strategy_weights: { swing: swingWeight, daytrade: daytradeWeight },
      dominant_strategy: dominant,
      combined_score: Math.round(combinedScore * 100) / 100,
      combined_action: action,
      vetoed: false,
      rationale,
    };
  }

  /** Look up the weight for a strategy under a given regime (0 if unconfigured). */
  private weightFor(strategy: StrategyName, regime: RegimeEnum): number {
    const table = this.config[strategy];
    return table[regime] ?? 0;
  }

  /** Determine the dominant strategy (higher weight); 'none' on tie/zero. */
  private dominantStrategy(swing: number, daytrade: number): StrategyName | 'none' {
    if (swing === 0 && daytrade === 0) return 'none';
    if (swing === daytrade) return 'none';
    return swing > daytrade ? 'swing' : 'daytrade';
  }

  /** Rationale for a vetoed (no-entry) outcome. */
  private vetoRationale(regime: Regime): string {
    if (regime.regime === 'LIQUIDITY_SHOCK') {
      return (
        `LIQUIDITY_SHOCK regime (confidence ${regime.confidence}) vetoes entry entirely — ` +
        'abnormal volume + elevated volatility. No trade until conditions normalize.'
      );
    }
    return `Regime ${regime.regime} yields zero combined strategy weight — entry vetoed.`;
  }

  /** Build a human-readable chain of reasoning for the combined verdict. */
  private buildRationale(
    regime: Regime,
    swing: StrategySignal,
    daytrade: StrategySignal,
    swingWeight: number,
    daytradeWeight: number,
    dominant: StrategyName | 'none',
    combinedScore: number,
    action: string,
  ): string {
    const conflict =
      swing.action !== daytrade.action && swing.action !== 'HOLD' && daytrade.action !== 'HOLD'
        ? ` (conflicting signals: swing=${swing.action} vs daytrade=${daytrade.action} resolved by regime weight)`
        : '';

    return (
      `Regime ${regime.regime} (confidence ${regime.confidence}) → weights swing=${swingWeight.toFixed(2)}, ` +
      `daytrade=${daytradeWeight.toFixed(2)}. Dominant strategy: ${dominant}. ` +
      `Weighted score ${combinedScore.toFixed(2)} → ${action}.${conflict}`
    );
  }
}

export default StrategyWeighter;
