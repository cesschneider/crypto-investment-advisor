/**
 * STORY-4.2: Multi-Timeframe Alignment Analyzer (Epic 4 — Market Regime Detection)
 *
 * Analyzes 5 timeframes (1W / 1D / 4H / 1H / 15m) independently for trend,
 * momentum, reversal proximity, support/resistance, and volatility, then aligns
 * them into a single multi-timeframe verdict. The core purpose is to prevent a
 * short-term signal from firing against a higher-timeframe trend without a
 * confidence penalty.
 *
 * Audit requirement (FR-402, audit §5/§10):
 *  - Trend via SMA alignment (SMA20 > SMA50 > SMA200 = bullish).
 *  - Momentum via RSI(14) + MACD histogram.
 *  - Reversal proximity via Bollinger Bands (20, 2) and S/R extremes.
 *  - Alignment score = % of timeframes agreeing on direction (0-100).
 *  - A short-term (15m/1h) signal opposing the 1D direction reduces confidence
 *    by 30-50% (never forced into a trade; reported as a conflict).
 *
 * Every quantitative input comes from the provided OHLCV candles (deterministic
 * calculations) — this class performs NO network I/O and invents NO data.
 */

/** A single OHLCV candle. `time` is optional (not required for the math). */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: Date | number;
}

export type TrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** Reversal proximity relative to Bollinger Bands / S/R extremes. */
export type ReversalProximity = 'NEAR_SUPPORT' | 'NEAR_RESISTANCE' | 'MID_RANGE';

/** Per-timeframe analysis output. */
export interface TimeframeAnalysis {
  timeframe: string;
  trend: TrendDirection;
  /** -100 (strong bearish) .. +100 (strong bullish). */
  momentum_score: number;
  reversal_proximity: ReversalProximity;
  support_levels: number[];
  resistance_levels: number[];
  /** ATR% volatility (0 = no data). */
  volatility_pct: number;
}

/** Aggregated multi-timeframe verdict. */
export interface MultiTimeframeResult {
  /** 0-100: % of timeframes whose direction agrees with higher_tf_direction. */
  alignment_score: number;
  /** Direction derived from the higher timeframes (1W + 1D). */
  higher_tf_direction: TrendDirection;
  /** True when all analyzable timeframes agree on direction. */
  confirmation_flag: boolean;
  /** Human-readable list of conflicting timeframes. */
  conflict_list: string[];
  /** 0-50: confidence penalty applied when a short-term signal opposes 1D. */
  confidence_penalty: number;
  /** Per-timeframe detail (ordered 1W → 15m). */
  per_timeframe: TimeframeAnalysis[];
}

/** The 5 timeframes analyzed, in descending order of precedence. */
export const TIMEFRAMES = ['1W', '1D', '4H', '1H', '15m'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

/** Timeframes treated as "short-term" for the anti-trend penalty. */
const SHORT_TERM_TIMEFRAMES = new Set(['1H', '15m']);

/** Timeframes treated as "higher" for direction determination. */
const HIGHER_TIMEFRAMES = new Set(['1W', '1D']);

/** Tunable configuration for the analyzer. */
export interface MultiTimeframeConfig {
  /** Minimum candles required to analyze a timeframe (default 20). */
  min_candles: number;
  /** Bollinger Band period (default 20). */
  bb_period: number;
  /** Bollinger Band standard-deviation multiplier (default 2). */
  bb_std: number;
  /** RSI period (default 14). */
  rsi_period: number;
  /** Band threshold (fraction of price) for "near" an S/R or Bollinger level. */
  proximity_threshold: number;
  /** Minimum confidence penalty when a short-term signal opposes 1D (%). */
  min_penalty: number;
  /** Maximum confidence penalty when a short-term signal opposes 1D (%). */
  max_penalty: number;
}

export const DEFAULT_MULTI_TIMEFRAME_CONFIG: MultiTimeframeConfig = {
  min_candles: 20,
  bb_period: 20,
  bb_std: 2,
  rsi_period: 14,
  proximity_threshold: 0.02,
  min_penalty: 30,
  max_penalty: 50,
};

/* ------------------------------------------------------------------ */
/* Pure indicator helpers (deterministic, no I/O)                      */
/* ------------------------------------------------------------------ */

/** Simple moving average over trailing `period` values (null if insufficient). */
function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential moving average over a full series (0 if empty). */
function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = values[i] * multiplier + result * (1 - multiplier);
  }
  return result;
}

/** Full EMA series (same length as input, aligned by index). */
function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length);
  const multiplier = 2 / (period + 1);
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      prev = values[0];
    } else {
      prev = values[i] * multiplier + prev * (1 - multiplier);
    }
    out[i] = prev;
  }
  return out;
}

/** RSI over trailing `period` closes (0 if insufficient data). */
function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 0;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** MACD (12/26/9) for a series. Returns line, signal, histogram (0 if short). */
function macd(values: number[]): { line: number; signal: number; histogram: number } {
  if (values.length < 26) return { line: 0, signal: 0, histogram: 0 };
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine, 9);
  const line = macdLine[macdLine.length - 1];
  return { line, signal, histogram: line - signal };
}

/** Bollinger Bands (20, 2). Returns {upper, middle, lower}. */
function bollinger(
  values: number[],
  period = 20,
  std = 2,
): { upper: number; middle: number; lower: number } | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance =
    slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: middle + std * sd, middle, lower: middle - std * sd };
}

/** Average True Range as a fraction of price (ATR%). */
function atrPercent(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const closes = candles.map((c) => c.close);
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    sum += tr;
  }
  const atr = sum / period;
  const lastClose = closes[closes.length - 1];
  return lastClose > 0 ? atr / lastClose : 0;
}

/** Local extrema (support = minima, resistance = maxima) over a lookback. */
function findLevels(
  candles: Candle[],
  type: 'support' | 'resistance',
  window = 3,
): number[] {
  if (candles.length < window * 2 + 1) return [];
  const prices = candles.map((c) => (type === 'support' ? c.low : c.high));
  const levels: number[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const val = prices[i];
    let isExtreme = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (type === 'support' ? prices[j] < val : prices[j] > val) {
        isExtreme = false;
        break;
      }
    }
    if (isExtreme) levels.push(val);
  }
  // Keep the most recent 3 levels, sorted ascending (support) / descending.
  const recent = [...new Set(levels)].slice(-3);
  return type === 'support'
    ? recent.sort((a, b) => a - b)
    : recent.sort((a, b) => b - a);
}

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export class MultiTimeframeAnalyzer {
  private config: MultiTimeframeConfig;

  constructor(config: Partial<MultiTimeframeConfig> = {}) {
    this.config = { ...DEFAULT_MULTI_TIMEFRAME_CONFIG, ...config };
  }

  /**
   * Analyze a map of timeframe → OHLCV candles and produce a multi-timeframe
   * verdict. Any timeframe with fewer than `min_candles` candles is skipped
   * (recorded in conflict_list as "insufficient data") rather than guessed.
   *
   * @param data Map of timeframe key ('1W','1D','4H','1H','15m') to candles.
   */
  analyze(data: Partial<Record<Timeframe, Candle[]>>): MultiTimeframeResult {
    const perTimeframe: TimeframeAnalysis[] = [];
    const insufficient: string[] = [];

    for (const tf of TIMEFRAMES) {
      const candles = data[tf] ?? [];
      if (candles.length < this.config.min_candles) {
        insufficient.push(`${tf} (${candles.length} candles < ${this.config.min_candles})`);
        continue;
      }
      perTimeframe.push(this.analyzeTimeframe(tf, candles));
    }

    const higher = this.determineHigherDirection(perTimeframe);

    // Alignment score: % of analyzable timeframes agreeing with higher TF.
    const analyzable = perTimeframe.length;
    const agreeing = perTimeframe.filter(
      (a) => a.trend !== 'NEUTRAL' && a.trend === higher.direction,
    ).length;
    const neutrals = perTimeframe.filter((a) => a.trend === 'NEUTRAL').length;

    // Denominator excludes neutral timeframes (they neither agree nor conflict).
    const decisive = analyzable - neutrals;
    const alignmentScore = decisive > 0 ? Math.round((agreeing / decisive) * 100) : 0;

    const confirmationFlag =
      decisive > 0 && agreeing === decisive && insufficient.length === 0;

    // Conflict list: timeframes opposing the higher direction + insufficient data.
    const conflictList: string[] = [];
    for (const a of perTimeframe) {
      if (a.trend !== 'NEUTRAL' && a.trend !== higher.direction) {
        conflictList.push(`${a.timeframe} ${a.trend.toLowerCase()} vs higher ${higher.direction.toLowerCase()}`);
      }
    }
    conflictList.push(...insufficient.map((s) => `insufficient data: ${s}`));

    const penalty = this.computePenalty(perTimeframe, higher.direction);

    return {
      alignment_score: alignmentScore,
      higher_tf_direction: higher.direction,
      confirmation_flag: confirmationFlag,
      conflict_list: conflictList,
      confidence_penalty: penalty,
      per_timeframe: perTimeframe,
    };
  }

  /** Analyze a single timeframe's candles. */
  private analyzeTimeframe(tf: string, candles: Candle[]): TimeframeAnalysis {
    const closes = candles.map((c) => c.close);

    // Trend via SMA alignment.
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);

    let trend: TrendDirection = 'NEUTRAL';
    if (sma20 !== null && sma50 !== null) {
      const short = sma20;
      const mid = sma50;
      if (sma200 !== null) {
        if (short > mid && mid > sma200) trend = 'BULLISH';
        else if (short < mid && mid < sma200) trend = 'BEARISH';
        else trend = 'NEUTRAL';
      } else {
        // Fallback without SMA200: use SMA20 vs SMA50 only.
        trend = short > mid ? 'BULLISH' : short < mid ? 'BEARISH' : 'NEUTRAL';
      }
    }

    // Momentum via RSI + MACD histogram (scaled to -100..100).
    const rsiVal = rsi(closes, this.config.rsi_period);
    const macdVal = macd(closes);
    const lastPrice = closes[closes.length - 1] || 0;
    const macdNorm =
      lastPrice > 0 ? Math.max(-100, Math.min(100, (macdVal.histogram / lastPrice) * 10000)) : 0;
    // RSI contributes (rsi-50)*2 → -100..100; MACD normalized contributes ±100.
    const momentumScore = Math.max(
      -100,
      Math.min(100, (rsiVal - 50) * 2 + macdNorm),
    );

    // Reversal proximity via Bollinger Bands + S/R.
    const bb = bollinger(closes, this.config.bb_period, this.config.bb_std);
    let reversalProximity: ReversalProximity = 'MID_RANGE';
    if (bb !== null && lastPrice > 0) {
      const lowerDist = Math.abs(lastPrice - bb.lower) / lastPrice;
      const upperDist = Math.abs(bb.upper - lastPrice) / lastPrice;
      const nearSupport = lastPrice <= bb.lower * (1 + this.config.proximity_threshold);
      const nearResistance = lastPrice >= bb.upper * (1 - this.config.proximity_threshold);
      if (nearSupport && lowerDist <= upperDist) reversalProximity = 'NEAR_SUPPORT';
      else if (nearResistance && upperDist < lowerDist) reversalProximity = 'NEAR_RESISTANCE';
    }

    const supportLevels = findLevels(candles, 'support');
    const resistanceLevels = findLevels(candles, 'resistance');
    const volatilityPct = atrPercent(candles);

    return {
      timeframe: tf,
      trend,
      momentum_score: Math.round(momentumScore * 100) / 100,
      reversal_proximity: reversalProximity,
      support_levels: supportLevels,
      resistance_levels: resistanceLevels,
      volatility_pct: volatilityPct,
    };
  }

  /** Derive the higher-timeframe direction from 1W + 1D (fallback 4H). */
  private determineHigherDirection(
    analyses: TimeframeAnalysis[],
  ): { direction: TrendDirection; source: string } {
    const byTf = new Map(analyses.map((a) => [a.timeframe, a]));
    for (const tf of ['1W', '1D', '4H'] as const) {
      const a = byTf.get(tf);
      if (a && a.trend !== 'NEUTRAL') {
        return { direction: a.trend, source: a.timeframe };
      }
    }
    // Fallback: majority direction across all analyzable timeframes.
    const bulls = analyses.filter((a) => a.trend === 'BULLISH').length;
    const bears = analyses.filter((a) => a.trend === 'BEARISH').length;
    if (bulls > bears) return { direction: 'BULLISH', source: 'majority' };
    if (bears > bulls) return { direction: 'BEARISH', source: 'majority' };
    return { direction: 'NEUTRAL', source: 'none' };
  }

  /**
   * Confidence penalty (30-50%) when a short-term (1H/15m) timeframe opposes
   * the 1D direction. The penalty scales with how decisively the 1D disagrees
   * and how many short-term timeframes conflict.
   */
  private computePenalty(
    analyses: TimeframeAnalysis[],
    higherDirection: TrendDirection,
  ): number {
    if (higherDirection === 'NEUTRAL') return 0;

    const oneDay = analyses.find((a) => a.timeframe === '1D');
    const baseDirection = oneDay && oneDay.trend !== 'NEUTRAL' ? oneDay.trend : higherDirection;

    const conflicts = analyses.filter(
      (a) =>
        SHORT_TERM_TIMEFRAMES.has(a.timeframe) &&
        a.trend !== 'NEUTRAL' &&
        a.trend !== baseDirection,
    );

    if (conflicts.length === 0) return 0;

    // Scale: 1 conflicting short-term TF → min_penalty; 2 → max_penalty.
    const fraction = conflicts.length / SHORT_TERM_TIMEFRAMES.size;
    const penalty =
      this.config.min_penalty +
      (this.config.max_penalty - this.config.min_penalty) * fraction;
    return Math.round(penalty);
  }
}

export default MultiTimeframeAnalyzer;
