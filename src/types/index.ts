/**
 * OHLCV Candle Data Structure
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
