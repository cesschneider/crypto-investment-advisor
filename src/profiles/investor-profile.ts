/**
 * InvestorProfile — risk-tolerance-driven parameter templates (Epic: post-audit enhancement)
 *
 * Encapsulates every tunable knob of the advisor so a single risk profile drives
 * position sizing, stop/TP distances, minimum R:R, confidence threshold, max
 * drawdown, exposure caps, and required confirmations. This directly addresses
 * the legacy report finding that "2% fixed position size is too aggressive" is a
 * per-investor decision, not a global constant (report §Risk Metrics).
 *
 * Three templates ship by default:
 *   - conservative (low risk)
 *   - moderate    (mid risk)
 *   - aggressive  (high risk)
 *
 * Every quantitative value is a config constant — nothing is estimated or
 * invented at runtime. Profiles are plain data (serializable) so they can be
 * persisted, tuned, and passed into the SignalEngine deterministically.
 */

/** The three supported risk profiles. */
export type RiskProfileName = 'conservative' | 'moderate' | 'aggressive';

import type { RegimeEnum } from '../services/RegimeClassifier';

/** Strategy archetypes that can be tuned per profile. */
export type StrategyName = 'swing' | 'daytrade';

/**
 * Per-strategy tuning: indicator parameters + regime weighting + enablement.
 * This is the "fine-tune each strategy" axis, orthogonal to risk tolerance.
 *
 * - `enabled` gates whether the strategy may produce entries at all.
 * - `regime_weights` overrides the StrategyWeighter's default per-regime weight
 *   for this strategy (genuinely wired into the engine).
 * - Indicator parameters (RSI/EMA/MACD/ADX) form the config contract consumed
 *   by the strategy evaluation layer (the TypeScript scorer and the Freqtrade
 *   SwingStrategy/DayTradeStrategy).
 */
export interface StrategyTuning {
  /** Whether this strategy may produce entries under this profile. */
  enabled: boolean;

  /* Indicator parameters (consumed by the strategy evaluation layer). */
  rsi_period: number;
  rsi_oversold: number;
  rsi_overbought: number;
  ema_short_period: number;
  ema_long_period: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  adx_threshold: number;

  /* Entry/exit score thresholds (0-100) for this strategy. */
  buy_score_threshold: number;
  sell_score_threshold: number;

  /* Per-regime weight override (feeds StrategyWeighter). */
  regime_weights: Partial<Record<RegimeEnum, number>>;
}

/** A single investor profile: all tunable advisor parameters. */
export interface InvestorProfile {
  /** Stable identifier (used in logs / reports). */
  name: RiskProfileName;
  /** Human-readable label. */
  label: string;

  /** Minimum signal confidence (0-100, evidence strength) required to open a trade. */
  min_confidence: number;

  /* --- Position sizing (feeds VolatilityScaledSizer) --- */
  /** Max single-position size as a fraction of portfolio (e.g. 0.03 = 3%). */
  max_position_pct: number;
  /** Max total portfolio risk as a fraction (e.g. 0.01 = 1%). */
  max_portfolio_risk_pct: number;
  /** Max total crypto exposure as a fraction of portfolio. */
  max_exposure_pct: number;

  /* --- Stop / take-profit (feeds ATRRiskCalculator) --- */
  /** ATR stop multiplier (higher = wider stop, more room, larger per-trade risk). */
  stop_atr_multiplier: number;
  /** First take-profit distance in ATR multiples. */
  tp1_atr_multiple: number;
  /** Second take-profit distance in ATR multiples. */
  tp2_atr_multiple: number;
  /** Minimum acceptable reward/risk ratio before a trade is allowed. */
  min_reward_risk_ratio: number;

  /* --- Portfolio guardrails (feeds DrawdownCircuitBreaker) --- */
  /** Max drawdown % from peak before new entries are blocked. */
  max_drawdown_pct: number;

  /* --- Per-strategy tuning (feeds StrategyWeighter + strategy layer) --- */
  /** Per-strategy parameter tuning. Replaces the old allow_* booleans. */
  strategy_tuning: Record<StrategyName, StrategyTuning>;

  /* --- Confirmation requirements --- */
  /** Require multi-timeframe alignment before trading. */
  require_multi_timeframe_alignment: boolean;
  /** Require derivatives confirmation before trading. */
  require_derivatives_confirmation: boolean;
  /** Require on-chain confirmation before trading. */
  require_on_chain_confirmation: boolean;

  /* --- Exit behavior --- */
  /** Allow a SELL/exit signal flip to close a position. */
  allow_signal_flip_exit: boolean;
  /** Trailing stop as a fraction of profit (0 = disabled). */
  trailing_stop_pct: number;
}

/** Regime enum for per-strategy weight tables. */

/**
 * Default swing (trend-following) tuning. Conservative profiles tighten the
 * RSI thresholds and raise the entry bar; aggressive profiles loosen them.
 */
const DEFAULT_SWING_TUNING: StrategyTuning = {
  enabled: true,
  rsi_period: 14,
  rsi_oversold: 30,
  rsi_overbought: 70,
  ema_short_period: 50,
  ema_long_period: 200,
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  adx_threshold: 25,
  buy_score_threshold: 60,
  sell_score_threshold: 40,
  regime_weights: {
    STRONG_BULL: 0.8,
    STRONG_BEAR: 0.8,
    WEAK_BULL: 0.4,
    WEAK_BEAR: 0.4,
    SIDEWAYS: 0.1,
  },
};

/**
 * Default daytrade (mean-reversion) tuning.
 */
const DEFAULT_DAYTRADE_TUNING: StrategyTuning = {
  enabled: true,
  rsi_period: 14,
  rsi_oversold: 25,
  rsi_overbought: 75,
  ema_short_period: 12,
  ema_long_period: 26,
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  adx_threshold: 20,
  buy_score_threshold: 60,
  sell_score_threshold: 40,
  regime_weights: {
    WEAK_BULL: 0.5,
    WEAK_BEAR: 0.5,
    SIDEWAYS: 0.7,
    LOW_VOL: 0.5,
  },
};

/** Built-in profile templates. */
export const INVESTOR_PROFILES: Record<RiskProfileName, InvestorProfile> = {
  /** Low risk — capital preservation first: small positions, tight stops, high bar to trade. */
  conservative: {
    name: 'conservative',
    label: 'Conservative (Low Risk)',
    min_confidence: 75,
    max_position_pct: 0.02,        // 2% per position
    max_portfolio_risk_pct: 0.01,  // 1% portfolio risk
    max_exposure_pct: 0.30,        // 30% max invested
    stop_atr_multiplier: 0.8,      // tight stop (LOW_VOL multiplier)
    tp1_atr_multiple: 1.2,
    tp2_atr_multiple: 2.0,
    min_reward_risk_ratio: 2.0,    // demand 2:1 reward
    max_drawdown_pct: 10,          // cut entries after 10% DD
    strategy_tuning: {
      swing: { ...DEFAULT_SWING_TUNING, enabled: true, rsi_oversold: 35, rsi_overbought: 65, buy_score_threshold: 65 },
      daytrade: { ...DEFAULT_DAYTRADE_TUNING, enabled: false },  // conservative: no mean-reversion
    },
    require_multi_timeframe_alignment: true,
    require_derivatives_confirmation: true,
    require_on_chain_confirmation: true,
    allow_signal_flip_exit: true,
    trailing_stop_pct: 0.01,      // 1% trailing
  },

  /** Mid risk — balanced: moderate positions, standard stops, standard confirmations. */
  moderate: {
    name: 'moderate',
    label: 'Moderate (Mid Risk)',
    min_confidence: 60,
    max_position_pct: 0.05,        // 5% per position
    max_portfolio_risk_pct: 0.02,  // 2% portfolio risk
    max_exposure_pct: 0.60,        // 60% max invested
    stop_atr_multiplier: 1.0,      // neutral stop
    tp1_atr_multiple: 1.5,
    tp2_atr_multiple: 2.5,
    min_reward_risk_ratio: 1.5,
    max_drawdown_pct: 15,
    strategy_tuning: {
      swing: { ...DEFAULT_SWING_TUNING, enabled: true },
      daytrade: { ...DEFAULT_DAYTRADE_TUNING, enabled: true },
    },
    require_multi_timeframe_alignment: true,
    require_derivatives_confirmation: false,
    require_on_chain_confirmation: false,
    allow_signal_flip_exit: true,
    trailing_stop_pct: 0.015,
  },

  /** High risk — aggressive: larger positions, wider stops, fewer confirmations. */
  aggressive: {
    name: 'aggressive',
    label: 'Aggressive (High Risk)',
    min_confidence: 50,
    max_position_pct: 0.10,        // 10% per position
    max_portfolio_risk_pct: 0.04,  // 4% portfolio risk
    max_exposure_pct: 0.90,        // 90% max invested
    stop_atr_multiplier: 1.5,      // wide stop (HIGH_VOL multiplier)
    tp1_atr_multiple: 1.8,
    tp2_atr_multiple: 3.0,
    min_reward_risk_ratio: 1.2,
    max_drawdown_pct: 25,
    strategy_tuning: {
      swing: { ...DEFAULT_SWING_TUNING, enabled: true, rsi_oversold: 25, rsi_overbought: 75, buy_score_threshold: 55 },
      daytrade: { ...DEFAULT_DAYTRADE_TUNING, enabled: true, rsi_oversold: 20, rsi_overbought: 80, buy_score_threshold: 55 },
    },
    require_multi_timeframe_alignment: false,
    require_derivatives_confirmation: false,
    require_on_chain_confirmation: false,
    allow_signal_flip_exit: true,
    trailing_stop_pct: 0.02,
  },
};

/**
 * Resolve a profile by name, optionally overlaid with custom overrides.
 * Returns a deep-ish merge of the template + overrides (flat fields only).
 *
 * @param name The risk profile name (defaults to 'moderate').
 * @param overrides Optional partial override of any profile field.
 */
export function getProfile(
  name: RiskProfileName = 'moderate',
  overrides: Partial<InvestorProfile> = {},
): InvestorProfile {
  const base = INVESTOR_PROFILES[name];
  if (!base) {
    throw new Error(`Unknown investor profile: ${name}`);
  }
  return { ...base, ...overrides };
}

export default getProfile;
