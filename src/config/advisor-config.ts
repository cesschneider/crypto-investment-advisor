/**
 * AdvisorConfig — the single source of truth for ALL tunable advisor parameters.
 *
 * Every threshold, weight, multiplier, and limit that previously lived as a
 * hardcoded literal in the scorer/engine now lives here, keyed by name, so a
 * per-profile JSON file can override any value. Defaults are provided as
 * `DEFAULT_ADVISOR_CONFIG` and merged with JSON profile files at load time.
 *
 * This replaces the earlier `InvestorProfile` flat shape with a fully nested,
 * self-documenting config tree. Nothing here does network I/O or invents data.
 */

/* ========================================================================== */
/* Signal scorer                                                              */
/* ========================================================================== */

export interface ScorerConfig {
  /** Neutral score baseline (0-100). */
  neutral_baseline: number;

  momentum: {
    rsi_oversold: number;
    rsi_overbought: number;
    rsi_weight: number;       // score swing when RSI is oversold/overbought
    macd_weight: number;      // score swing when MACD histogram is non-zero
  };

  structure: {
    proximity_pct: number;    // fraction of price within which S/R is "near"
    support_bonus: number;
    resistance_penalty: number;
  };

  volume: {
    high_ratio: number;       // 24h vs (7d/7) ratio above which = high volume
    low_ratio: number;        // ratio below which = low volume
    high_bonus: number;
    low_penalty: number;
    surge_ratio: number;      // 7d vs (30d*7) ratio above which = volume surge
    surge_bonus: number;
  };

  derivatives: {
    extreme_funding: number;  // |funding| (per 8h) above which = extreme
    funding_bearish_penalty: number; // high positive funding
    funding_bullish_bonus: number;   // negative funding
    oi_surge_threshold: number;      // OI change % above which = surge
    oi_surge_bonus: number;
    oi_decline_penalty: number;
  };

  onchain: {
    whale_accumulation_threshold: number; // |whale| above which = strong
    whale_bonus: number;
    whale_penalty: number;
    holder_healthy_threshold: number;    // below = healthy distribution
    holder_concentrated_threshold: number; // above = whale risk
    holder_bonus: number;
    holder_penalty: number;
  };

  macro: {
    default_strength: number; // strength assumed when macro_strength absent
  };

  freshness: {
    max_age_seconds: number; // data older than this is "stale"
  };

  action: {
    min_contributing_dims: number; // fewer → INSUFFICIENT_DATA
    bullish_threshold: number;     // score above this = bullish dimension
    bearish_threshold: number;     // score below this = bearish dimension
    strong_min_dims: number;       // dims for STRONG_BUY/SELL
    weak_dims: number;             // dims for WEAK_BUY/SELL
    strong_confidence_base: number;
    strong_confidence_per_dim: number;
    strong_confidence_cap: number;
    weak_confidence_base: number;
    weak_confidence_per_dim: number;
    weak_confidence_cap: number;
    single_indicator_confidence: number; // single dim → NO_TRADE confidence
    hold_confidence_base: number;
    hold_confidence_scale: number;
  };
}

/* ========================================================================== */
/* Strategy tuning (per strategy)                                             */
/* ========================================================================== */

export interface StrategyTuningConfig {
  enabled: boolean;
  rsi_period: number;
  rsi_oversold: number;
  rsi_overbought: number;
  ema_short_period: number;
  ema_long_period: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  adx_threshold: number;
  buy_score_threshold: number;
  sell_score_threshold: number;
  regime_weights: Record<string, number>;
}

/* ========================================================================== */
/* Top-level advisor config                                                   */
/* ========================================================================== */

export type RiskProfileName = 'conservative' | 'moderate' | 'aggressive';

export interface AdvisorConfig {
  name: RiskProfileName;
  label: string;

  /** Minimum signal confidence (0-100) required to open a trade. */
  min_confidence: number;

  /* Position sizing (feeds VolatilityScaledSizer) */
  sizing: {
    max_position_pct: number;
    max_portfolio_risk_pct: number;
    max_exposure_pct: number;
    baseline_atr_pct: number;
    correlation_threshold: number;
    correlation_factor: number;
    min_position_size: number;
  };

  /* Stop / take-profit (feeds ATRRiskCalculator) */
  risk: {
    atr_period: number;
    stop_atr_multiplier: number;
    high_vol_multiplier: number;
    low_vol_multiplier: number;
    tp1_atr_multiple: number;
    tp2_atr_multiple: number;
    tp1_allocation: number;
    min_reward_risk_ratio: number;
  };

  /* Drawdown guard (feeds DrawdownCircuitBreaker) */
  drawdown: {
    max_drawdown_pct: number;
  };

  /* Per-strategy tuning */
  strategy_tuning: {
    swing: StrategyTuningConfig;
    daytrade: StrategyTuningConfig;
  };

  /* Confirmation requirements */
  confirmation: {
    require_multi_timeframe_alignment: boolean;
    require_derivatives_confirmation: boolean;
    require_on_chain_confirmation: boolean;
  };

  /* Exit behavior */
  exit: {
    allow_signal_flip_exit: boolean;
    trailing_stop_pct: number;
  };

  /* Multi-timeframe analyzer */
  multi_timeframe: {
    min_candles: number;
    bb_period: number;
    bb_std: number;
    rsi_period: number;
    proximity_threshold: number;
    min_penalty: number;
    max_penalty: number;
  };

  /* Macro analyzer thresholds */
  macro: {
    vix_risk_on_threshold: number;
    vix_risk_off_threshold: number;
    sp500_flat_threshold: number;
    dxy_strong_threshold: number;
    contradiction_confidence_reduction: number;
    min_inputs_present: number;
  };

  /* Derivatives analyzer thresholds */
  derivatives: {
    min_oi_bars: number;
    oi_flat_threshold: number;
    price_flat_threshold: number;
    extreme_funding_threshold: number;
    liquidation_imbalance_ratio: number;
  };

  /* On-chain analyzer thresholds */
  onchain: {
    mvrv_overheated: number;
    mvrv_undervalued: number;
    sopr_profit_taking: number;
    sopr_capitulation: number;
    stablecoin_inflow_threshold: number;
    min_metrics_present: number;
  };

  /* Sentiment analyzer thresholds */
  sentiment: {
    extreme_fear_threshold: number;
    fear_threshold: number;
    greed_threshold: number;
    extreme_greed_threshold: number;
  };

  /* Input validation / freshness */
  freshness: {
    critical_max_age_seconds: number;
    secondary_max_age_seconds: number;
    future_timestamp_tolerance_seconds: number;
    max_spot_perp_divergence: number;
    max_spread: number;
  };

  /* Signal scorer */
  scorer: ScorerConfig;
}

/* ========================================================================== */
/* Defaults                                                                   */
/* ========================================================================== */

const DEFAULT_STRATEGY_SWING: StrategyTuningConfig = {
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

const DEFAULT_STRATEGY_DAYTRADE: StrategyTuningConfig = {
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

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  neutral_baseline: 50,
  momentum: { rsi_oversold: 30, rsi_overbought: 70, rsi_weight: 20, macd_weight: 10 },
  structure: { proximity_pct: 0.02, support_bonus: 15, resistance_penalty: 15 },
  volume: {
    high_ratio: 1.5, low_ratio: 0.7, high_bonus: 15, low_penalty: 10,
    surge_ratio: 1.3, surge_bonus: 10,
  },
  derivatives: {
    extreme_funding: 0.001, funding_bearish_penalty: 20, funding_bullish_bonus: 10,
    oi_surge_threshold: 20, oi_surge_bonus: 15, oi_decline_penalty: 15,
  },
  onchain: {
    whale_accumulation_threshold: 30, whale_bonus: 20, whale_penalty: 20,
    holder_healthy_threshold: 30, holder_concentrated_threshold: 60,
    holder_bonus: 10, holder_penalty: 10,
  },
  macro: { default_strength: 25 },
  freshness: { max_age_seconds: 3600 },
  action: {
    min_contributing_dims: 3, bullish_threshold: 60, bearish_threshold: 40,
    strong_min_dims: 3, weak_dims: 2,
    strong_confidence_base: 60, strong_confidence_per_dim: 8, strong_confidence_cap: 95,
    weak_confidence_base: 50, weak_confidence_per_dim: 12, weak_confidence_cap: 75,
    single_indicator_confidence: 40,
    hold_confidence_base: 25, hold_confidence_scale: 0.5,
  },
};

export const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  name: 'moderate',
  label: 'Moderate (Mid Risk)',
  min_confidence: 60,
  sizing: {
    max_position_pct: 0.05, max_portfolio_risk_pct: 0.02, max_exposure_pct: 0.60,
    baseline_atr_pct: 1.5, correlation_threshold: 0.7, correlation_factor: 0.5,
    min_position_size: 10,
  },
  risk: {
    atr_period: 14, stop_atr_multiplier: 1.0, high_vol_multiplier: 1.5, low_vol_multiplier: 0.8,
    tp1_atr_multiple: 1.5, tp2_atr_multiple: 2.5, tp1_allocation: 0.5, min_reward_risk_ratio: 1.5,
  },
  drawdown: { max_drawdown_pct: 15 },
  strategy_tuning: { swing: DEFAULT_STRATEGY_SWING, daytrade: DEFAULT_STRATEGY_DAYTRADE },
  confirmation: {
    require_multi_timeframe_alignment: true,
    require_derivatives_confirmation: false,
    require_on_chain_confirmation: false,
  },
  exit: { allow_signal_flip_exit: true, trailing_stop_pct: 0.015 },
  multi_timeframe: {
    min_candles: 20, bb_period: 20, bb_std: 2, rsi_period: 14,
    proximity_threshold: 0.02, min_penalty: 30, max_penalty: 50,
  },
  macro: {
    vix_risk_on_threshold: 15, vix_risk_off_threshold: 20, sp500_flat_threshold: 0.005,
    dxy_strong_threshold: 104, contradiction_confidence_reduction: 25, min_inputs_present: 2,
  },
  derivatives: {
    min_oi_bars: 2, oi_flat_threshold: 0.005, price_flat_threshold: 0.005,
    extreme_funding_threshold: 0.001, liquidation_imbalance_ratio: 1.5,
  },
  onchain: {
    mvrv_overheated: 3.0, mvrv_undervalued: 1.0, sopr_profit_taking: 1.05,
    sopr_capitulation: 0.95, stablecoin_inflow_threshold: 0.02, min_metrics_present: 3,
  },
  sentiment: {
    extreme_fear_threshold: 25, fear_threshold: 45, greed_threshold: 55, extreme_greed_threshold: 75,
  },
  freshness: {
    critical_max_age_seconds: 300, secondary_max_age_seconds: 3600,
    future_timestamp_tolerance_seconds: 60, max_spot_perp_divergence: 0.02, max_spread: 0.01,
  },
  scorer: DEFAULT_SCORER_CONFIG,
};

/** Deep-merge `override` onto `base` (objects merged recursively; arrays/primitives replaced). */
export function mergeConfig<T>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override as any)) {
    const bv = (base as any)[key];
    const ov = (override as any)[key];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[key] = mergeConfig(bv, ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}
