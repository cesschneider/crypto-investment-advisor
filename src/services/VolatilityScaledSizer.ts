/**
 * STORY-6.2: Volatility-Scaled Position Sizing (Epic 6 — Risk Management)
 *
 * Scales position size inversely with realized volatility (ATR): large
 * positions in calm markets, smaller in volatile ones. Enforces hard limits
 * (max position size, max portfolio risk) and a correlation cap that shrinks
 * or rejects positions correlated with the existing book.
 *
 * Audit requirement (FR-602, audit §13): position size must scale with
 * volatility, not a fixed percentage; total exposure must be capped; correlated
 * positions must not stack. When constraints prevent a sensible position, the
 * sizer returns NO_TRADE rather than a forced or undersized fill.
 *
 * Governing principle: every quantitative input (ATR, correlation) is computed
 * deterministically from OHLCV candles — never estimated or invented.
 */

/** A single OHLCV candle (shared shape with ATRBasedRiskCalculator). */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** An existing portfolio position, used for correlation and exposure checks. */
export interface PortfolioPosition {
  symbol: string;
  /** Position size in the same unit as the sizing output (e.g. USD notional). */
  size: number;
  /** Closing-price series (oldest → newest), used for correlation. */
  priceSeries: number[];
}

/** Tunable configuration for the volatility-scaled sizer. */
export interface VolatilityScaledSizerConfig {
  /** Baseline ATR as a percentage of price (e.g. 1.5 for 1.5%). */
  baseline_atr_pct: number;
  /** Base position size before volatility scaling (same unit as output). */
  base_size: number;
  /** Max position size as a fraction of portfolio (e.g. 0.05 = 5%). */
  max_position_pct: number;
  /** Max total portfolio risk as a fraction of portfolio (e.g. 0.02 = 2%). */
  max_portfolio_risk_pct: number;
  /** Correlation threshold above which the position is shrunk (e.g. 0.7). */
  correlation_threshold: number;
  /** Multiplier applied when the correlation threshold is breached (0..1). */
  correlation_factor: number;
  /** Minimum acceptable position size; below this the sizer returns NO_TRADE. */
  min_position_size: number;
  /** ATR lookback period (default 14). */
  atr_period: number;
}

export const DEFAULT_SIZER_CONFIG: VolatilityScaledSizerConfig = {
  baseline_atr_pct: 1.5,
  base_size: 1000,
  max_position_pct: 0.05,
  max_portfolio_risk_pct: 0.02,
  correlation_threshold: 0.7,
  correlation_factor: 0.5,
  min_position_size: 10,
  atr_period: 14,
};

/** Structured output of the position sizing computation. */
export interface VolatilityScaledSizerResult {
  /** Final position size (same unit as base_size). 0 when NO_TRADE. */
  position_size: number;
  /** Final position size as a fraction of the portfolio. */
  size_pct_of_portfolio: number;
  /** Hard cap on a single position (max_position_pct × portfolio). */
  max_allowed: number;
  /** True when any hard limit or correlation cap was applied. */
  constraints_violated: boolean;
  /** First-class outcome: SIZED when a sensible position exists, else NO_TRADE. */
  action: 'SIZED' | 'NO_TRADE';
  /** Human-readable rationale / audit trail. */
  rationale: string;
}

/** Sizing inputs. */
export interface SizingInput {
  candles: Candle[];
  entryPrice: number;
  portfolioValue: number;
  /** USD already at risk across the existing book (optional, default 0). */
  currentPortfolioRisk?: number;
  /** Existing positions for correlation caps (optional). */
  positions?: PortfolioPosition[];
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

/** Pearson correlation coefficient between two equal-length series. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const as = a.slice(-n);
  const bs = b.slice(-n);
  const meanA = as.reduce((s, v) => s + v, 0) / n;
  const meanB = bs.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = as[i] - meanA;
    const db = bs[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

export class VolatilityScaledSizer {
  private config: VolatilityScaledSizerConfig;

  constructor(config: Partial<VolatilityScaledSizerConfig> = {}) {
    this.config = { ...DEFAULT_SIZER_CONFIG, ...config };
  }

  /**
   * Compute a volatility-scaled, limit-capped position size.
   *
   * @returns VolatilityScaledSizerResult. A NO_TRADE action means the caller
   *          must NOT open the position (insufficient data or constraints
   *          reduced the size below the minimum).
   */
  size(input: SizingInput): VolatilityScaledSizerResult {
    const { candles, entryPrice, portfolioValue } = input;
    const {
      baseline_atr_pct,
      base_size,
      max_position_pct,
      max_portfolio_risk_pct,
      correlation_threshold,
      correlation_factor,
      min_position_size,
      atr_period,
    } = this.config;

    const maxAllowed = portfolioValue * max_position_pct;
    const reasons: string[] = [];
    let constraintsViolated = false;

    // Insufficient data → NO_TRADE.
    const atrValue = atr(candles, atr_period);
    if (atrValue <= 0 || entryPrice <= 0 || portfolioValue <= 0 || candles.length < atr_period + 1) {
      return this.noTrade(
        0,
        maxAllowed,
        `Insufficient data: need ${atr_period + 1} candles, positive entry price, and positive portfolio value ` +
          `(got ${candles.length} candles, entry ${entryPrice}, portfolio ${portfolioValue}, ATR ${atrValue})`,
      );
    }

    // Inverse volatility scaling: ATR% / baseline_ATR%.
    const atrPct = (atrValue / entryPrice) * 100;
    const scale = atrPct / baseline_atr_pct;
    let positionSize = base_size / scale;

    // Hard limit: single-position cap.
    if (positionSize > maxAllowed) {
      constraintsViolated = true;
      reasons.push(`volatility size ${round(positionSize)} exceeded max position ${round(maxAllowed)} (${(max_position_pct * 100).toFixed(1)}%)`);
      positionSize = maxAllowed;
    }

    // Hard limit: portfolio risk cap. Risk per position ≈ size × ATR%.
    const riskPerUnit = atrPct / 100;
    const currentRisk = input.currentPortfolioRisk ?? 0;
    const riskBudget = portfolioValue * max_portfolio_risk_pct - currentRisk;
    if (riskBudget <= 0) {
      return this.noTrade(
        0,
        maxAllowed,
        `Portfolio risk budget exhausted (current risk ${round(currentRisk)} vs cap ${round(portfolioValue * max_portfolio_risk_pct)})`,
      );
    }
    const riskCappedSize = riskBudget / riskPerUnit;
    if (positionSize > riskCappedSize) {
      constraintsViolated = true;
      reasons.push(`risk-capped size ${round(riskCappedSize)} below volatility size ${round(positionSize)}`);
      positionSize = riskCappedSize;
    }

    // Correlation cap: shrink (or reject) positions correlated with the book.
    const positions = input.positions ?? [];
    if (positions.length > 0 && positions.every((p) => p.priceSeries.length >= 2)) {
      const corr = this.portfolioCorrelation(candles.map((c) => c.close), positions);
      if (corr > correlation_threshold) {
        constraintsViolated = true;
        reasons.push(`correlation ${corr.toFixed(2)} > ${correlation_threshold} → shrink ×${correlation_factor}`);
        positionSize *= correlation_factor;
      }
    }

    // Minimum size gate: below threshold → NO_TRADE, never a forced fill.
    if (positionSize < min_position_size) {
      return this.noTrade(
        0,
        maxAllowed,
        `Constraints reduced size to ${round(positionSize)}, below minimum ${min_position_size}. ${reasons.join('; ')}`,
      );
    }

    const sizePct = positionSize / portfolioValue;
    return {
      position_size: round(positionSize),
      size_pct_of_portfolio: round(sizePct),
      max_allowed: round(maxAllowed),
      constraints_violated: constraintsViolated,
      action: 'SIZED',
      rationale:
        `ATR(${atr_period})=${atrValue.toFixed(4)} (${atrPct.toFixed(2)}% vs baseline ${baseline_atr_pct}%) → ` +
        `volatility size ${round(base_size / scale)}` +
        (reasons.length ? `; capped: ${reasons.join('; ')}` : '') +
        `; final ${round(positionSize)} (${(sizePct * 100).toFixed(2)}% of portfolio)`,
    };
  }

  /** Max correlation between the new symbol's series and the weighted book. */
  private portfolioCorrelation(symbolCloses: number[], positions: PortfolioPosition[]): number {
    const totalSize = positions.reduce((s, p) => s + p.size, 0) || 1;
    const n = Math.min(symbolCloses.length, ...positions.map((p) => p.priceSeries.length));
    if (n < 2) return 0;

    // Weighted portfolio series, normalized to index 100 to make units comparable.
    const portfolioSeries: number[] = [];
    for (let i = 0; i < n; i++) {
      let weighted = 0;
      for (const p of positions) {
        const series = p.priceSeries.slice(-n);
        const base = series[0] || 1;
        weighted += (p.size / totalSize) * (series[i] / base) * 100;
      }
      portfolioSeries.push(weighted);
    }

    const symbol = symbolCloses.slice(-n);
    const symbolBase = symbol[0] || 1;
    const normalizedSymbol = symbol.map((v) => (v / symbolBase) * 100);

    return pearson(normalizedSymbol, portfolioSeries);
  }

  private noTrade(
    positionSize: number,
    maxAllowed: number,
    rationale: string,
  ): VolatilityScaledSizerResult {
    return {
      position_size: positionSize,
      size_pct_of_portfolio: 0,
      max_allowed: round(maxAllowed),
      constraints_violated: true,
      action: 'NO_TRADE',
      rationale,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export default VolatilityScaledSizer;
