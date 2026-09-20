/**
 * STORY-3.3: Structured Signal Schema (Input/Output Contract)
 * 
 * Complete input/output schema for signal generation following the multi-factor decision hierarchy.
 * Input includes: market data, technical indicators, derivatives positioning, on-chain metrics,
 * sentiment, macro context, portfolio state, and configuration.
 * 
 * Output includes: signal action, decision factors with direction/weight/score/evidence,
 * contradictory factors, trade setup, risk assessment, and source timestamps.
 * 
 * Audit requirement: No fabricated values. Null/missing critical data results in INSUFFICIENT_DATA.
 */

import { SignalAction, SignalStrength, confidenceToStrength } from './index';

/**
 * Data source metadata with freshness tracking.
 * Tracks where each input came from, when it was retrieved, and reliability classification.
 */
export interface DataSource {
  // Source identification
  name: string;
  category: 'market' | 'technical' | 'derivatives' | 'onchain' | 'sentiment' | 'macro' | 'exchange';
  
  // Timing
  timestamp: string; // ISO8601 when data was fetched
  age_seconds: number; // seconds since data was generated at source
  
  // Reliability classification from audit
  reliability: 'PRIMARY' | 'SECONDARY' | 'UNRELIABLE' | 'MISSING';
  
  // Optional metadata
  url?: string;
  error?: string; // if fetch failed, document it
  last_successful_fetch?: string; // ISO8601
}

/**
 * Decision factor: a single piece of evidence supporting or opposing a trade direction.
 * Each factor contributes to the final signal with transparent direction, weight, and scoring.
 */
export interface DecisionFactor {
  // Identification
  dimension: string; // e.g., "trend_strength", "funding_rate_extremity", "macro_risk_on"
  category: 'technical' | 'derivatives' | 'onchain' | 'macro' | 'sentiment' | 'portfolio' | 'liquidity';
  
  // Direction and magnitude
  direction: 1 | -1 | 0; // 1=bullish, -1=bearish, 0=neutral
  weight: number; // 0-1, proportion of total decision weight
  
  // Evidence
  score: number; // 0-100, this factor's contribution to conviction
  evidence: string; // human-readable explanation of why this factor matters
  
  // Source
  data_source?: DataSource;
  
  // Optional detail
  value?: number; // the actual metric value (e.g., RSI=32, funding=0.05%)
  threshold?: number; // the threshold it crossed
  confidence?: number; // confidence in this factor specifically
}

/**
 * Contradictory factor: a piece of evidence opposing the primary signal.
 * Tracks reasons NOT to trade despite supporting evidence (e.g., liquidity too low).
 */
export interface ContradictoryFactor {
  // Identification
  dimension: string; // e.g., "slippage_risk", "on_exchange_funding_inflow", "macro_risk_off"
  category: DecisionFactor['category'];
  
  // Impact
  severity: 'low' | 'medium' | 'high' | 'critical'; // how much does this reduce signal quality?
  impact: string; // why this contradicts the bullish/bearish case
  
  // Evidence
  value?: number; // the metric value triggering this contradiction
  threshold?: number; // the threshold violated
  data_source?: DataSource;
}

/**
 * Trade setup: entry, exit, risk metrics for the signal.
 */
export interface TradeSetup {
  // Entry
  entry_price: number;
  entry_price_range_percent: number; // e.g., ±1.5% for limit order tolerance
  
  // Exit targets
  take_profit_levels: Array<{ price: number; percent_of_position: number }>;
  stop_loss_price: number;
  
  // Position sizing
  position_size_percent: number; // % of portfolio to risk
  risk_amount_usd?: number; // optional: absolute risk in USD
  reward_amount_usd?: number; // optional: expected reward in USD
  
  // Ratios
  risk_reward_ratio: number; // (tp - entry) / (entry - sl)
  
  // Execution
  order_type: 'market' | 'limit' | 'post_only'; // market = use current price, limit = set price
  time_in_force?: 'gtc' | 'ioc' | 'fok'; // good-til-cancel, immediate-or-cancel, fill-or-kill
}

/**
 * Risk assessment for the signal: drawdown, correlation, liquidation risks, etc.
 */
export interface RiskAssessment {
  // Portfolio-level
  portfolio_exposure_percent: number; // % of portfolio in positions for this asset
  max_portfolio_drawdown_if_liquidated: number; // % if this position gets stopped out
  
  // Leverage/liquidation
  leverage: number; // 1.0 = no leverage, >1.0 = margined
  liquidation_price?: number; // if leveraged, where is liquidation?
  liquidation_distance_percent?: number; // % away from current
  
  // Correlation
  correlation_with_portfolio: number; // -1 to 1: how correlated is this with existing positions?
  
  // Execution
  slippage_estimate_percent: number; // estimated slippage on this order
  liquidity_hours: number; // hours needed to fully exit position
  
  // Data quality
  data_age_max_seconds: number; // oldest data point used in decision
  critical_data_missing: boolean; // any required data unavailable?
  
  // Volatility
  current_atr: number; // average true range (from technical indicators)
  current_volatility_percent: number; // annualized volatility
}

/**
 * Market assessment: regime, structure, broader context
 */
export interface MarketAssessment {
  // Regime
  regime: 'STRONG_UPTREND' | 'WEAK_UPTREND' | 'RANGE' | 'WEAK_DOWNTREND' | 'STRONG_DOWNTREND' | 'UNKNOWN';
  regime_confidence: number; // 0-100, how certain is regime classification?
  
  // Higher timeframe structure (1D/1W)
  higher_tf_trend: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNKNOWN';
  higher_tf_support?: number;
  higher_tf_resistance?: number;
  
  // Medium timeframe (4H)
  medium_tf_trend: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNKNOWN';
  
  // Lower timeframe (1H/5m)
  lower_tf_trend: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNKNOWN';
  
  // Multi-timeframe alignment
  timeframe_alignment: 'aligned' | 'diverging' | 'unknown'; // are all TFs pointing same direction?
  alignment_quality: number; // 0-100, how strong is alignment?
  
  // Liquidity
  estimated_daily_volume_usd: number;
  spread_bps: number; // bid-ask spread in basis points
  is_liquid_enough_for_trade: boolean;
  
  // Volatility context
  volatility_regime: 'low' | 'normal' | 'high' | 'extreme';
  
  // Context
  market_conditions: string; // e.g., "Post-FOMC risk-off", "Altseason momentum", etc.
}

/**
 * Complete input to signal generation.
 * Required fields MUST be present; optional fields may be null.
 * Null/missing critical data sets flags in output; does NOT fabricate values.
 */
export interface SignalInput {
  // Request metadata
  request_id: string; // unique identifier for this signal request
  timestamp: string; // ISO8601 when request was made
  symbol: string; // e.g., "BTC/USDT"
  
  // --- Market Data (REQUIRED) ---
  market_data: {
    current_price: number; // spot price
    price_24h_high: number;
    price_24h_low: number;
    volume_24h_usd: number;
    market_cap_usd: number;
    timestamp: string; // when price data was fetched
    data_source: DataSource;
  };
  
  // --- Technical Indicators (REQUIRED if doing technical analysis) ---
  technical_indicators?: {
    // Trend
    trend?: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
    trend_strength?: number; // 0-100
    
    // Momentum
    rsi_14?: number; // 0-100
    rsi_21?: number; // optional
    macd_line?: number;
    macd_signal?: number;
    macd_histogram?: number;
    
    // Moving averages
    sma_20?: number;
    sma_50?: number;
    sma_200?: number;
    ema_12?: number;
    ema_26?: number;
    
    // Volatility
    bollinger_upper?: number;
    bollinger_middle?: number;
    bollinger_lower?: number;
    atr_14?: number; // average true range
    
    // Structure
    supports?: number[];
    resistances?: number[];
    
    // Freshness
    timestamp: string;
    data_source: DataSource;
  };
  
  // --- Derivatives Positioning (OPTIONAL) ---
  derivatives?: {
    // Perpetual funding
    funding_rate_current?: number; // can be negative
    funding_rate_8h_avg?: number;
    funding_rate_prediction?: 'extreme_long' | 'long' | 'neutral' | 'short' | 'extreme_short';
    
    // Open interest
    open_interest_usd?: number;
    open_interest_change_24h_percent?: number;
    open_interest_longs_percent?: number; // % of total OI that is longs
    
    // Liquidation cascade
    liquidation_level_above?: number; // next major liquidation level above
    liquidation_level_below?: number; // next major liquidation level below
    liquidation_volume_above?: number; // volume at liquidation level
    liquidation_volume_below?: number;
    
    // Freshness
    timestamp: string;
    data_source: DataSource;
  };
  
  // --- On-Chain Metrics (OPTIONAL) ---
  on_chain?: {
    // Whale activity
    large_holder_accumulation_24h?: number; // -100 to 100: negative = distribution, positive = accumulation
    whale_buy_volume_24h?: number;
    whale_sell_volume_24h?: number;
    
    // Holder distribution
    top_10_holder_concentration_percent?: number; // 0-100
    holder_count?: number;
    holder_count_change_7d_percent?: number;
    
    // Exchange flows
    exchange_inflow_24h?: number;
    exchange_outflow_24h?: number;
    exchange_netflow_24h?: number; // outflow - inflow (positive = withdrawal from exchange = bullish)
    
    // MVRV, SOPR, etc (BTC/ETH specific)
    mvrv_ratio?: number;
    sopr_ratio?: number;
    
    // Freshness
    timestamp: string;
    data_source: DataSource;
  };
  
  // --- Sentiment & Social (OPTIONAL) ---
  sentiment?: {
    // Aggregate scores
    fear_and_greed_index?: number; // 0-100: 0=extreme fear, 100=extreme greed
    social_volume_24h?: number; // mentions across Twitter, Reddit, Discord
    social_volume_change_24h_percent?: number;
    
    // Sentiment direction
    bullish_mentions_percent?: number; // % of mentions that are bullish
    bearish_mentions_percent?: number; // % of mentions that are bearish
    
    // News
    major_news_24h?: string[]; // headlines that might impact price
    
    // Freshness
    timestamp: string;
    data_source: DataSource;
  };
  
  // --- Macro & Market Context (OPTIONAL) ---
  macro?: {
    // Risk on/off
    macro_regime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | 'UNKNOWN';
    macro_regime_confidence?: number; // 0-100
    
    // Major indices
    sp500_change_24h_percent?: number;
    nasdaq_change_24h_percent?: number;
    dxy_change_24h_percent?: number; // dollar index
    vix?: number; // volatility index
    
    // Rates & yields
    us_10y_yield?: number;
    fed_funds_rate?: number;
    
    // Economic calendar
    upcoming_events?: Array<{
      event: string;
      time_to_event_hours: number;
      expected_impact: 'high' | 'medium' | 'low';
    }>;
    
    // Recent events
    recent_major_events?: string[]; // e.g., "FOMC decision", "CPI print"
    
    // Freshness
    timestamp: string;
    data_source: DataSource;
  };
  
  // --- Portfolio State (OPTIONAL) ---
  portfolio?: {
    total_value_usd: number;
    current_cash_usd: number;
    current_positions: Array<{
      symbol: string;
      quantity: number;
      entry_price: number;
      current_price: number;
      pnl_percent: number;
    }>;
    max_position_size_percent: number; // limit for any single trade
    max_exposure_percent: number; // max total crypto exposure
    max_loss_tolerance_percent: number; // % drawdown user will tolerate
  };
  
  // --- Configuration (OPTIONAL) ---
  config?: {
    // Risk preferences
    risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
    min_confidence_for_trade: number; // e.g., 60 = only trade if confidence >= 60
    
    // Execution
    allow_market_orders: boolean;
    max_slippage_bps: number; // don't execute if slippage > this
    
    // Data requirements
    require_multi_timeframe_alignment: boolean;
    require_on_chain_confirmation: boolean;
    require_derivatives_confirmation: boolean;
    
    // Lookback
    analysis_lookback_hours?: number;
  };
}

/**
 * Complete output from signal generation.
 * Contains the signal action, all supporting/contradictory evidence, trade setup, risk assessment,
 * and an audit trail for full explainability.
 */
export interface SignalOutput {
  // Response metadata
  request_id: string; // links back to SignalInput.request_id
  timestamp: string; // when signal was generated
  symbol: string;
  
  // --- Primary Signal ---
  signal: {
    action: SignalAction;
    confidence: number; // 0-100: evidence strength supporting this action, NOT win probability
    strength: SignalStrength; // VERY_WEAK | WEAK | MODERATE | STRONG | VERY_STRONG
  };
  
  // --- Market Assessment ---
  market_assessment: MarketAssessment;
  
  // --- Decision Breakdown ---
  decision_factors: DecisionFactor[];
  contradictory_factors: ContradictoryFactor[];
  
  // Summary of decision quality
  supporting_factors_count: number;
  contradicting_factors_count: number;
  net_conviction: number; // supporting_count - contradicting_count
  
  // --- Trade Setup (if action is BUY/SELL/WEAK_BUY/WEAK_SELL) ---
  trade_setup?: TradeSetup;
  
  // --- Risk Assessment ---
  risk_assessment: RiskAssessment;
  
  // --- Data Quality & Audit Trail ---
  data_sources: DataSource[];
  data_freshness_summary: {
    all_data_fresh: boolean;
    stale_sources: string[]; // names of sources older than expected
    missing_critical_sources: string[]; // required sources that failed
  };
  
  // Audit trail for full explainability
  trace: {
    decision_logic: string; // description of how this decision was reached
    assumptions: string[]; // key assumptions made
    caveats: string[]; // limitations or risks in the signal
    multi_factor_summary: string; // how many dimensions contributed to final decision?
  };
  
  // Rationale
  rationale: string; // 2-3 sentence explanation of the signal for human reading
}

/**
 * Validation error: returned if input fails schema or business validation.
 */
export interface ValidationError {
  code: 'INVALID_INPUT' | 'MISSING_REQUIRED_DATA' | 'DATA_STALE' | 'INVALID_SCHEMA';
  message: string;
  field?: string;
  details?: string[];
}

/**
 * Validate signal input against schema and business rules.
 * Returns either validated input (for processing) or ValidationError (for rejection).
 * 
 * @param input unknown value to validate
 * @returns SignalInput if valid, ValidationError if invalid
 * 
 * @example
 * ```
 * const result = validateSignalInput(someData);
 * if ('code' in result) {
 *   console.error('Invalid input:', result.message);
 * } else {
 *   // result is SignalInput, safe to process
 * }
 * ```
 */
export function validateSignalInput(input: unknown): SignalInput | ValidationError {
  // Type check
  if (typeof input !== 'object' || input === null) {
    return {
      code: 'INVALID_SCHEMA',
      message: 'Input must be an object',
    };
  }

  const obj = input as Record<string, unknown>;

  // Required string fields
  const requiredFields = ['request_id', 'timestamp', 'symbol'];
  for (const field of requiredFields) {
    if (typeof obj[field] !== 'string') {
      return {
        code: 'INVALID_SCHEMA',
        message: `Missing or invalid required field: ${field}`,
        field,
      };
    }
  }

  // market_data is required
  if (!obj.market_data || typeof obj.market_data !== 'object') {
    return {
      code: 'MISSING_REQUIRED_DATA',
      message: 'market_data is required',
      field: 'market_data',
    };
  }

  const marketData = obj.market_data as Record<string, unknown>;
  const marketDataRequired = ['current_price', 'timestamp'];
  for (const field of marketDataRequired) {
    if (typeof marketData[field] === 'undefined') {
      return {
        code: 'MISSING_REQUIRED_DATA',
        message: `market_data.${field} is required`,
        field: `market_data.${field}`,
      };
    }
  }

  // Basic type checks for market data
  if (
    typeof marketData.current_price !== 'number' ||
    typeof marketData.price_24h_high !== 'number' ||
    typeof marketData.price_24h_low !== 'number' ||
    typeof marketData.volume_24h_usd !== 'number'
  ) {
    return {
      code: 'INVALID_SCHEMA',
      message: 'market_data contains invalid numeric fields',
      field: 'market_data',
    };
  }

  // Validate data source timestamps are recent (not more than 2 hours old)
  const marketDataAge = Math.floor((Date.now() - new Date(marketData.timestamp as string).getTime()) / 1000);
  if (marketDataAge > 7200) { // 2 hours
    return {
      code: 'DATA_STALE',
      message: 'market_data is stale (> 2 hours old)',
      field: 'market_data.timestamp',
    };
  }

  // If validation passes, cast and return
  return obj as unknown as SignalInput;
}

/**
 * Helper: Create a SignalOutput skeleton for failed/insufficient signals.
 * Used when validation or critical data checks fail.
 */
export function createInsufficientDataResponse(
  requestId: string,
  symbol: string,
  reason: string,
  dataSources: DataSource[] = [],
): SignalOutput {
  return {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    symbol,
    signal: {
      action: 'INSUFFICIENT_DATA',
      confidence: 0,
      strength: 'VERY_WEAK',
    },
    market_assessment: {
      regime: 'UNKNOWN',
      regime_confidence: 0,
      higher_tf_trend: 'UNKNOWN',
      medium_tf_trend: 'UNKNOWN',
      lower_tf_trend: 'UNKNOWN',
      timeframe_alignment: 'unknown',
      alignment_quality: 0,
      estimated_daily_volume_usd: 0,
      spread_bps: 0,
      is_liquid_enough_for_trade: false,
      volatility_regime: 'normal',
      market_conditions: 'Data validation failed',
    },
    decision_factors: [],
    contradictory_factors: [],
    supporting_factors_count: 0,
    contradicting_factors_count: 0,
    net_conviction: 0,
    risk_assessment: {
      portfolio_exposure_percent: 0,
      max_portfolio_drawdown_if_liquidated: 0,
      leverage: 1.0,
      correlation_with_portfolio: 0,
      slippage_estimate_percent: 0,
      liquidity_hours: 0,
      data_age_max_seconds: 0,
      critical_data_missing: true,
      current_atr: 0,
      current_volatility_percent: 0,
    },
    data_sources: dataSources,
    data_freshness_summary: {
      all_data_fresh: false,
      stale_sources: [],
      missing_critical_sources: [reason],
    },
    trace: {
      decision_logic: 'Signal rejected due to insufficient or invalid data',
      assumptions: [],
      caveats: [reason],
      multi_factor_summary: 'No factors evaluated',
    },
    rationale: `Cannot generate signal: ${reason}`,
  };
}
