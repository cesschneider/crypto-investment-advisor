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

  /* --- Strategy weighting (feeds StrategyWeighter) --- */
  /** Whether to allow mean-reversion (daytrade) entries at all. */
  allow_mean_reversion: boolean;
  /** Whether to allow trend-following (swing) entries at all. */
  allow_trend_following: boolean;

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
    allow_mean_reversion: false,   // only trend-following
    allow_trend_following: true,
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
    allow_mean_reversion: true,
    allow_trend_following: true,
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
    allow_mean_reversion: true,
    allow_trend_following: true,
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
