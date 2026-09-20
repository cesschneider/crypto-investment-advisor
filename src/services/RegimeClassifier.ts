/**
 * STORY-4.1: 9-State Market Regime Classifier (Epic 4 — Market Regime Detection)
 *
 * Detects the market regime from higher-timeframe (1D) candles so that signal
 * scoring and strategy selection can adapt to conditions instead of firing the
 * same static logic in every regime.
 *
 * Audit requirement (FR-401, audit §5/§9/§10): regime MUST be computed from
 * higher-timeframe data (1D, lookback 20-50) — never from the signal window —
 * to avoid circularity with hourly signals.
 *
 * The classifier emits exactly one of 9 states plus UNKNOWN (insufficient data):
 *   STRONG_BULL, WEAK_BULL, STRONG_BEAR, WEAK_BEAR, SIDEWAYS,
 *   HIGH_VOL, LOW_VOL, TRANSITION, LIQUIDITY_SHOCK
 *
 * Each result carries evidence (a human-readable chain of reasoning), a
 * confidence score (0-100, evidence strength — NOT win probability), and the
 * number of bars the regime has persisted.
 */

/** A single OHLCV candle (1D timeframe for regime detection). */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** The 9 market-regime states plus UNKNOWN for insufficient data. */
export type RegimeEnum =
  | 'STRONG_BULL'
  | 'WEAK_BULL'
  | 'STRONG_BEAR'
  | 'WEAK_BEAR'
  | 'SIDEWAYS'
  | 'HIGH_VOL'
  | 'LOW_VOL'
  | 'TRANSITION'
  | 'LIQUIDITY_SHOCK'
  | 'UNKNOWN';

/** Structured output of regime detection. */
export interface Regime {
  /** The classified market regime. */
  regime: RegimeEnum;
  /** 0-100: evidence strength supporting the classification (not win probability). */
  confidence: number;
  /** Human-readable chain of reasoning leading to the classification. */
  evidence: string;
  /** Number of 1D bars the detected regime has persisted. */
  duration_bars: number;
}

/** Tunable thresholds for the classifier. */
export interface RegimeClassifierConfig {
  /** Minimum candles required before classification (default 20). */
  min_candles: number;
  /** ATR% below which the regime is classified LOW_VOL (default 0.01 = 1%). */
  low_vol_atr_threshold: number;
  /** ATR% above which the regime is classified HIGH_VOL (default 0.03 = 3%). */
  high_vol_atr_threshold: number;
  /** Relative price band (vs SMA50) below which the regime is SIDEWAYS (default 0.005). */
  sideways_band_threshold: number;
  /** Volume ratio (10-bar avg / 50-bar median) above which a liquidity shock is flagged (default 3). */
  liquidity_shock_volume_ratio: number;
}

export const DEFAULT_REGIME_CONFIG: RegimeClassifierConfig = {
  min_candles: 20,
  low_vol_atr_threshold: 0.01,
  high_vol_atr_threshold: 0.03,
  sideways_band_threshold: 0.005,
  liquidity_shock_volume_ratio: 3,
};

/** Simple moving average over the trailing `period` closes (null if not enough data). */
function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
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

/** Median of a numeric array. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Detect whether higher-highs/higher-lows (bull structure) or
 * lower-highs/lower-lows (bear structure) dominate the trailing window.
 * Returns a signed count: positive = bullish structure, negative = bearish.
 */
function structureScore(candles: Candle[], window = 10): number {
  if (candles.length < window + 2) return 0;
  const recent = candles.slice(-window - 1);
  let score = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    if (curr.high > prev.high && curr.low > prev.low) score += 1;
    else if (curr.high < prev.high && curr.low < prev.low) score -= 1;
  }
  return score;
}

export class RegimeClassifier {
  private config: RegimeClassifierConfig;

  constructor(config: Partial<RegimeClassifierConfig> = {}) {
    this.config = { ...DEFAULT_REGIME_CONFIG, ...config };
  }

  /**
   * Classify the market regime from 1D candles.
   *
   * @param ohlcv_1d Daily OHLCV candles, ordered oldest → newest.
   * @returns A Regime result. UNKNOWN is returned (not forced) when there are
   *          fewer than `min_candles` candles.
   */
  detectRegime(ohlcv_1d: Candle[]): Regime {
    const n = ohlcv_1d.length;
    if (n < this.config.min_candles) {
      return {
        regime: 'UNKNOWN',
        confidence: 0,
        evidence: `Insufficient 1D candles for regime detection (${n} < ${this.config.min_candles})`,
        duration_bars: 0,
      };
    }

    const closes = ohlcv_1d.map((c) => c.close);
    const volumes = ohlcv_1d.map((c) => c.volume);

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);

    const atrPct = atrPercent(ohlcv_1d);
    const structure = structureScore(ohlcv_1d);
    const evidenceParts: string[] = [];

    // Volume: 10-bar average vs 50-bar median → liquidity shock detection.
    let volumeRatio = 1;
    const vol10 = volumes.slice(-10);
    const vol50 = volumes.slice(-50);
    if (vol10.length >= 10 && vol50.length >= 10) {
      const avg10 = vol10.reduce((a, b) => a + b, 0) / vol10.length;
      const median50 = median(vol50);
      if (median50 > 0) {
        volumeRatio = avg10 / median50;
      }
    }

    // 1. Liquidity shock: abnormal volume accompanied by elevated volatility.
    if (volumeRatio >= this.config.liquidity_shock_volume_ratio) {
      evidenceParts.push(
        `volume surge ${volumeRatio.toFixed(1)}× median, ATR ${(atrPct * 100).toFixed(1)}%`,
      );
      return {
        regime: 'LIQUIDITY_SHOCK',
        confidence: this.confidenceFor('LIQUIDITY_SHOCK', volumeRatio, atrPct),
        evidence: evidenceParts.join('; '),
        duration_bars: n,
      };
    }

    // 2. Volatility buckets (override trend classification).
    if (atrPct >= this.config.high_vol_atr_threshold) {
      evidenceParts.push(`ATR ${(atrPct * 100).toFixed(1)}% ≥ high-vol threshold`);
      return {
        regime: 'HIGH_VOL',
        confidence: this.confidenceFor('HIGH_VOL', volumeRatio, atrPct),
        evidence: evidenceParts.join('; '),
        duration_bars: n,
      };
    }
    if (atrPct <= this.config.low_vol_atr_threshold) {
      evidenceParts.push(`ATR ${(atrPct * 100).toFixed(1)}% ≤ low-vol threshold`);
      return {
        regime: 'LOW_VOL',
        confidence: this.confidenceFor('LOW_VOL', volumeRatio, atrPct),
        evidence: evidenceParts.join('; '),
        duration_bars: n,
      };
    }

    // 3. Sideways: SMA20 within a tight band of SMA50.
    if (sma20 !== null && sma50 !== null && sma50 > 0) {
      const band = Math.abs(sma20 - sma50) / sma50;
      if (band <= this.config.sideways_band_threshold) {
        evidenceParts.push(
          `SMA20 within ${(band * 100).toFixed(2)}% of SMA50 (range-bound)`,
        );
        return {
          regime: 'SIDEWAYS',
          confidence: 55,
          evidence: evidenceParts.join('; '),
          duration_bars: n,
        };
      }
    }

    // 4. Transition: short-term momentum opposes the longer SMA20/SMA50 trend.
    if (sma20 !== null && sma50 !== null) {
      if (this.isTransition(closes, sma20, sma50)) {
        evidenceParts.push(`short-term momentum opposing ${sma20 > sma50 ? 'bullish' : 'bearish'} trend (transition)`);
        return {
          regime: 'TRANSITION',
          confidence: 45,
          evidence: evidenceParts.join('; '),
          duration_bars: n,
        };
      }
    }

    // 5. Trend classification (bull/bear, strong/weak).
    if (sma20 !== null && sma50 !== null) {
      const bull = sma20 > sma50;
      const smaAligned = sma200 !== null
        ? (bull ? sma50 > sma200 : sma50 < sma200)
        : true;
      const structAligned = bull ? structure > 0 : structure < 0;

      // Strength: strong if SMA200 agrees AND structure agrees.
      const strong = smaAligned && structAligned;
      const regime: RegimeEnum = bull
        ? (strong ? 'STRONG_BULL' : 'WEAK_BULL')
        : (strong ? 'STRONG_BEAR' : 'WEAK_BEAR');

      evidenceParts.push(
        `SMA20 ${bull ? '>' : '<'} SMA50${sma200 !== null ? `, SMA50 ${bull ? '>' : '<'} SMA200` : ''}, structure ${structure > 0 ? '+' : '-'}${structure}`,
      );

      const confidence = strong ? 75 : 55;
      return {
        regime,
        confidence,
        evidence: evidenceParts.join('; '),
        duration_bars: n,
      };
    }

    // Fallback: not enough data for a decisive trend classification.
    return {
      regime: 'UNKNOWN',
      confidence: 0,
      evidence: 'Unable to classify regime (insufficient SMA data)',
      duration_bars: n,
    };
  }

  /**
   * Detect a transition: short-term momentum (last 5 closes) opposing the
   * longer-term SMA20 vs SMA50 trend. Returns true when the recent price
   * direction conflicts with the prevailing trend direction.
   */
  private isTransition(closes: number[], sma20Now: number, sma50Now: number): boolean {
    if (closes.length < 8) return false;
    const recent = closes.slice(-5);
    const recentChange = recent[recent.length - 1] - recent[0];
    const trendBullish = sma20Now > sma50Now;
    // Momentum opposes trend if trend is bullish but recent change is negative
    // (or trend is bearish but recent change is positive), and the move is meaningful.
    const meaningful = Math.abs(recentChange) / recent[0] > 0.01;
    return meaningful && ((trendBullish && recentChange < 0) || (!trendBullish && recentChange > 0));
  }

  /** Derive a confidence score (0-100) for a regime from its supporting metrics. */
  private confidenceFor(regime: RegimeEnum, volumeRatio: number, atrPct: number): number {
    switch (regime) {
      case 'LIQUIDITY_SHOCK': {
        const base = 70;
        const volBonus = Math.min(15, (volumeRatio - this.config.liquidity_shock_volume_ratio) * 5);
        const atrBonus = Math.min(15, atrPct * 100 * 3);
        return Math.round(Math.min(100, base + volBonus + atrBonus));
      }
      case 'HIGH_VOL': {
        const base = 60;
        const atrBonus = Math.min(30, (atrPct - this.config.high_vol_atr_threshold) * 1000);
        return Math.round(Math.min(95, base + atrBonus));
      }
      case 'LOW_VOL': {
        return 65;
      }
      default:
        return 50;
    }
  }
}

export default RegimeClassifier;
