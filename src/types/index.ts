/**
 * Altcoin Opportunity Scoring System
 * 
 * Score breakdown (0-100):
 * - Tokenomics (30%)
 * - Liquidity (25%)
 * - Holder Distribution (20%)
 * - Volume Trend (15%)
 * - Community (10%)
 */

export interface AltcoinOpportunity {
  // Basic info
  token_address: string;
  token_symbol: string;
  token_name: string;
  
  // Launch data
  launch_date: string;
  age_days: number;
  
  // On-chain metrics
  total_supply: number;
  circulating_supply: number;
  burn_percentage: number;
  lock_duration_days: number;
  
  // Liquidity & Trading
  liquidity_usd: number;
  volume_24h_usd: number;
  volume_7d_usd: number;
  price_change_24h_percent: number;
  price_change_7d_percent: number;
  
  // Holder analysis
  holder_count: number;
  top_10_concentration_percent: number;
  team_locked_percentage: number;
  
  // Scores
  tokenomics_score: number;  // 0-100
  liquidity_score: number;   // 0-100
  holder_score: number;      // 0-100
  volume_score: number;      // 0-100
  community_score: number;   // 0-100
  overall_score: number;     // 0-100 (weighted)
  
  // Signal
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'AVOID';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  confidence_percent: number;
  
  // Analysis notes
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
}

export interface TechnicalSignal {
  coin_id: string;
  symbol: string;
  timestamp: string;
  
  // Price & volume
  current_price_usd: number;
  price_24h_high: number;
  price_24h_low: number;
  volume_24h_usd: number;
  market_cap_usd: number;
  
  // Technical indicators
  rsi_14: number;           // 0-100
  macd_line: number;
  macd_signal: number;
  macd_histogram: number;
  
  // Moving averages
  sma_20: number;
  sma_50: number;
  sma_200: number;
  
  // Trends
  supports: number[];        // Price support levels
  resistances: number[];     // Price resistance levels
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  
  // Signal
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;        // 0-100
  
  // Rationale
  reasons: string[];
  target_price: number;
  stop_loss: number;
  take_profit: number;
}

export interface WhaleActivity {
  chain: 'ethereum' | 'solana' | 'bsc' | 'polygon';
  token_address: string;
  timestamp: string;
  
  // Transaction details
  tx_hash: string;
  from_address: string;
  to_address: string;
  amount: number;
  
  // Analysis
  whale_type: 'accumulator' | 'distributor' | 'exchange_inflow' | 'exchange_outflow';
  estimated_usd_value: number;
  holder_classification: 'whale' | 'large_holder' | 'exchange' | 'unknown';
  
  // Impact
  potential_impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Multi-factor Signal Scoring System (Epic 3)
 * Confidence is evidence-strength (0-100), NOT win probability.
 * No single indicator alone triggers a trade; must have supporting evidence from 2+ dimensions.
 */

export type SignalAction = 
  | 'STRONG_BUY'
  | 'BUY'
  | 'WEAK_BUY'
  | 'HOLD'
  | 'WEAK_SELL'
  | 'SELL'
  | 'STRONG_SELL'
  | 'INSUFFICIENT_DATA'
  | 'NO_TRADE';

export interface ScoringInputs {
  // Metadata
  symbol: string;
  timestamp: string;
  
  // Trend dimension (1D+)
  trend?: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  trend_strength?: number; // 0-100
  
  // Momentum dimension (4H/1H)
  rsi_14?: number; // 0-100
  macd_histogram?: number; // can be negative
  
  // Structure dimension (support/resistance)
  price?: number;
  supports?: number[];
  resistances?: number[];
  
  // Volume dimension
  volume_24h?: number;
  volume_7d?: number;
  volume_avg_30d?: number;
  
  // Derivatives (funding rate, open interest, etc.)
  funding_rate?: number; // can be negative
  open_interest_change?: number; // % change
  
  // On-chain (whale activity, holder distribution, etc.)
  whale_accumulation?: number; // -100 to 100
  holder_concentration?: number; // 0-100 (lower is better)
  
  // Macro (risk-on/off, economic calendar, etc.)
  macro_regime?: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  macro_strength?: number; // 0-100
  
  // Sentiment (social, news, etc.)
  sentiment_score?: number; // -100 to 100
  
  // Data freshness
  data_age_seconds?: { [key: string]: number }; // track staleness per dimension
}

export interface DimensionScore {
  dimension: string;
  score: number; // 0-100
  evidence: string; // human-readable explanation
  contributing?: boolean; // did this dimension contribute to final decision?
}

export interface ScoringResult {
  symbol: string;
  timestamp: string;
  
  // Decision
  action: SignalAction;
  confidence: number; // 0-100, evidence strength
  
  // Breakdown
  score: number; // 0-100, weighted average
  dimensions: DimensionScore[];
  
  // Audit trail
  trace: { [dimension: string]: { score: number; evidence: string } };
  supporting_dimensions_count: number; // how many dimensions support the action?
  
  // Data quality
  data_freshness_issues?: string[]; // note stale or missing critical data
  insufficient_data?: boolean;
}
