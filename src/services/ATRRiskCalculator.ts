/**
 * STORY-6.1: ATR-Based Stop-Loss and Take-Profit (Epic 6 — Risk Management)
 *
 * Replaces fixed-percentage stops with ATR-based dynamic stops. Computes a
 * cascaded take-profit plan (50% at 1.5 ATR, 50% at 2.5 ATR) and validates the
 * risk/reward ratio before any trade is executed.
 *
 * Audit requirement (FR-601, audit §13): stop-loss distance must scale with
 * realized volatility (ATR), not a fixed percentage. Tighter in calm regimes,
 * wider in volatile regimes. Trades with an inadequate reward/risk ratio are
 * rejected (NO_TRADE-equivalent) rather than forced through.
 *
 * Governing principle: confidence is evidence, not win probability. Risk is
 * computed deterministically from OHLCV candles — never estimated or invented.
 */

/** A single OHLCV candle. */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Market volatility regime, used to scale the ATR multiplier.
 * Maps directly onto the Epic 4 RegimeClassifier output (9-state regime).
 */
export type VolatilityRegime = 'HIGH_VOL' | 'LOW_VOL' | 'NEUTRAL';

/** Tunable configuration for the ATR risk calculator. */
export interface ATRRiskConfig {
  /** ATR lookback period (default 14). */
  atr_period: number;
  /** ATR multiplier applied in a HIGH_VOL regime (allows for slippage). */
  high_vol_multiplier: number;
  /** ATR multiplier applied in a LOW_VOL regime (tighter stops). */
  low_vol_multiplier: number;
  /** ATR multiplier applied in a NEUTRAL regime. */
  neutral_multiplier: number;
  /** First take-profit distance in ATR multiples (default 1.5). */
  tp1_atr_multiple: number;
  /** Second take-profit distance in ATR multiples (default 2.5). */
  tp2_atr_multiple: number;
  /** Allocation split to the first take-profit level (0..1, default 0.5). */
  tp1_allocation: number;
  /** Minimum acceptable reward/risk ratio (default 1.5). */
  min_reward_risk_ratio: number;
}

export const DEFAULT_ATR_RISK_CONFIG: ATRRiskConfig = {
  atr_period: 14,
  high_vol_multiplier: 1.5,
  low_vol_multiplier: 0.8,
  neutral_multiplier: 1.0,
  tp1_atr_multiple: 1.5,
  tp2_atr_multiple: 2.5,
  tp1_allocation: 0.5,
  min_reward_risk_ratio: 1.5,
};

/** Structured output of the ATR risk computation. */
export interface ATRRiskResult {
  /** Stop-loss price. */
  stop_price: number;
  /** First take-profit level (nearest). */
  tp_level1: number;
  /** Second take-profit level (farther). */
  tp_level2: number;
  /** Risk as a fraction of entry price (entry - stop) / entry. */
  risk_pct: number;
  /** Blended reward as a fraction of entry price (weighted TP - entry) / entry. */
  reward_pct: number;
  /** Reward/risk ratio (reward_pct / risk_pct). */
  ratio: number;
  /** Final verdict: OK when ratio meets the minimum, else INADEQUATE_RR. */
  verdict: 'OK' | 'INADEQUATE_RR';
  /** Human-readable rationale / audit trail. */
  rationale: string;
}

/** Average True Range (absolute) over the trailing `period` candles. */
export function atr(candles: Candle[], period: number = 14): number {
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
  return sum / period;
}

export class ATRBasedRiskCalculator {
  private config: ATRRiskConfig;

  constructor(config: Partial<ATRRiskConfig> = {}) {
    this.config = { ...DEFAULT_ATR_RISK_CONFIG, ...config };
  }

  /**
   * Compute ATR-based stop-loss and cascaded take-profit levels.
   *
   * @param candles OHLCV candles ordered oldest → newest (for a LONG entry).
   * @param entryPrice The intended entry price.
   * @param regime Volatility regime used to scale the ATR stop distance.
   * @returns ATRRiskResult. An inadequate reward/risk ratio yields verdict
   *          INADEQUATE_RR (caller must NOT execute the trade).
   */
  calculate(
    candles: Candle[],
    entryPrice: number,
    regime: VolatilityRegime = 'NEUTRAL',
  ): ATRRiskResult {
    const { atr_period } = this.config;
    const atrValue = atr(candles, atr_period);

    if (atrValue <= 0 || entryPrice <= 0 || candles.length < atr_period + 1) {
      return {
        stop_price: 0,
        tp_level1: 0,
        tp_level2: 0,
        risk_pct: 0,
        reward_pct: 0,
        ratio: 0,
        verdict: 'INADEQUATE_RR',
        rationale:
          `Insufficient data: need ${atr_period + 1} candles and a positive entry price ` +
          `(got ${candles.length} candles, entry ${entryPrice}, ATR ${atrValue})`,
      };
    }

    const multiplier = this.multiplierFor(regime);
    const stopDistance = atrValue * multiplier;

    // LONG entry: stop below entry, take-profits above entry.
    const stopPrice = entryPrice - stopDistance;
    const tp1 = entryPrice + atrValue * this.config.tp1_atr_multiple;
    const tp2 = entryPrice + atrValue * this.config.tp2_atr_multiple;

    if (stopPrice <= 0) {
      return {
        stop_price: 0,
        tp_level1: tp1,
        tp_level2: tp2,
        risk_pct: 0,
        reward_pct: 0,
        ratio: 0,
        verdict: 'INADEQUATE_RR',
        rationale: `Stop distance (${stopDistance.toFixed(4)}) exceeds entry price (${entryPrice}); cannot define a valid stop.`,
      };
    }

    const riskPct = (entryPrice - stopPrice) / entryPrice;

    // Blended reward: weighted average of the two take-profit levels.
    const alloc1 = this.config.tp1_allocation;
    const alloc2 = 1 - alloc1;
    const blendedTp = tp1 * alloc1 + tp2 * alloc2;
    const rewardPct = (blendedTp - entryPrice) / entryPrice;

    const ratio = riskPct > 0 ? rewardPct / riskPct : 0;
    const verdict = ratio >= this.config.min_reward_risk_ratio ? 'OK' : 'INADEQUATE_RR';

    return {
      stop_price: round(stopPrice),
      tp_level1: round(tp1),
      tp_level2: round(tp2),
      risk_pct: round(riskPct),
      reward_pct: round(rewardPct),
      ratio: round(ratio),
      verdict,
      rationale:
        `ATR(${atr_period})=${atrValue.toFixed(4)} × ${multiplier} (${regime}) → stop ${stopPrice.toFixed(2)}; ` +
        `TP1 ${tp1.toFixed(2)} (${alloc1 * 100}%), TP2 ${tp2.toFixed(2)} (${alloc2 * 100}%); ` +
        `risk ${(riskPct * 100).toFixed(2)}%, reward ${(rewardPct * 100).toFixed(2)}%, ` +
        `ratio ${ratio.toFixed(2)} (min ${this.config.min_reward_risk_ratio}) → ${verdict}`,
    };
  }

  private multiplierFor(regime: VolatilityRegime): number {
    switch (regime) {
      case 'HIGH_VOL':
        return this.config.high_vol_multiplier;
      case 'LOW_VOL':
        return this.config.low_vol_multiplier;
      case 'NEUTRAL':
      default:
        return this.config.neutral_multiplier;
    }
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export default ATRBasedRiskCalculator;
