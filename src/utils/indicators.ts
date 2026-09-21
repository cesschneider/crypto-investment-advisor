/**
 * indicators.ts — deterministic technical-indicator math (no network I/O).
 *
 * Pure functions over OHLCV candles used by the per-profile paper-trading
 * runner to build the quant inputs the SignalEngine expects. All computed
 * fresh from the supplied candles; nothing is invented.
 */

import { Candle } from '../services/MultiTimeframeAnalyzer';

/** Simple Moving Average of `period` across an array of numbers (NaN if short). */
export function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Exponential Moving Average (start = SMA seed). */
export function ema(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/** Relative Strength Index (Wilder's smoothing). Returns 0-100 (NaN if short). */
export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD → { macd, signal, histogram }. Returns NaN if not enough candles. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number } {
  if (closes.length < slow + signalPeriod) {
    return { macd: NaN, signal: NaN, histogram: NaN };
  }
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = fastEma - slowEma;
  // signal = EMA of the MACD line series (sample the last signalPeriod points).
  const macdSeries: number[] = [];
  for (let i = slow; i < closes.length; i++) {
    const f = ema(closes.slice(0, i + 1), fast);
    const s = ema(closes.slice(0, i + 1), slow);
    macdSeries.push(f - s);
  }
  const signal = ema(macdSeries, signalPeriod);
  return { macd: macdLine, signal, histogram: macdLine - signal };
}

/** Bollinger Bands (middle ± std*mult). */
export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { upper: number; middle: number; lower: number } {
  const middle = sma(values, period);
  if (Number.isNaN(middle)) return { upper: NaN, middle, lower: NaN };
  let variance = 0;
  for (let i = values.length - period; i < values.length; i++) {
    variance += (values[i] - middle) ** 2;
  }
  const std = Math.sqrt(variance / period);
  return { upper: middle + mult * std, middle, lower: middle - mult * std };
}

/** True Range + Average True Range (for ATR-based stops, informational). */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return NaN;
  let sum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.open;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    sum += tr;
  }
  return sum / period;
}

/** Closes + high/low arrays from candles. */
export interface CandleSeries {
  closes: number[];
  highs: number[];
  lows: number[];
}

export function toSeries(candles: Candle[]): CandleSeries {
  return {
    closes: candles.map((c) => c.close),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
  };
}

/** Basic trend from SMA20 vs SMA50 vs SMA200 ordering (null if insufficient). */
export function trendFromSma(closes: number[]): { trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'; strength: number } {
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  // Up to 200 available on 1H? Use 20/50 when 200 unavailable.
  if (Number.isNaN(s20) || Number.isNaN(s50)) return { trend: 'SIDEWAYS', strength: 0 };
  if (s20 > s50) return { trend: 'UPTREND', strength: Math.min(30, ((s20 - s50) / s50) * 1000) };
  if (s20 < s50) return { trend: 'DOWNTREND', strength: Math.min(30, ((s50 - s20) / s50) * 1000) };
  return { trend: 'SIDEWAYS', strength: 0 };
}
