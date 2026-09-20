/**
 * STORY-4.2: Unit tests for the Multi-Timeframe Alignment Analyzer.
 *
 * Covers: perfect alignment, partial conflict (1D down vs 1H up), cascading
 * agreement, insufficient-data handling, and the anti-trend confidence penalty.
 */

import {
  MultiTimeframeAnalyzer,
  Candle,
  Timeframe,
} from '../services/MultiTimeframeAnalyzer';

/** Build a deterministic trend series. Positive step = up, negative = down. */
function trend(count: number, step: number, base = 100): Candle[] {
  const candles: Candle[] = [];
  let close = base;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = close + step;
    candles.push({ open, high: close + 0.2, low: open - 0.2, close, volume: 1000 });
  }
  return candles;
}

/** Build a flat series (all closes equal → NEUTRAL trend). */
function flat(count: number, base = 100): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({ open: base, high: base + 0.1, low: base - 0.1, close: base, volume: 1000 });
  }
  return candles;
}

describe('MultiTimeframeAnalyzer', () => {
  let analyzer: MultiTimeframeAnalyzer;

  beforeEach(() => {
    analyzer = new MultiTimeframeAnalyzer();
  });

  it('reports perfect alignment when all timeframes agree (all bullish)', () => {
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1W': trend(100, 0.5),
      '1D': trend(100, 0.3),
      '4H': trend(100, 0.1),
      '1H': trend(100, 0.05),
      '15m': trend(100, 0.02),
    };
    const result = analyzer.analyze(data);
    expect(result.higher_tf_direction).toBe('BULLISH');
    expect(result.alignment_score).toBe(100);
    expect(result.confirmation_flag).toBe(true);
    expect(result.conflict_list).toHaveLength(0);
    expect(result.confidence_penalty).toBe(0);
    expect(result.per_timeframe).toHaveLength(5);
  });

  it('detects partial conflict: 1D downtrend vs 1H/15m uptrend', () => {
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1W': trend(100, -0.5),
      '1D': trend(100, -0.3),
      '4H': trend(100, -0.1),
      '1H': trend(100, 0.05),
      '15m': trend(100, 0.02),
    };
    const result = analyzer.analyze(data);
    expect(result.higher_tf_direction).toBe('BEARISH');
    expect(result.confirmation_flag).toBe(false);
    // 1H and 15m conflict with the higher BEARISH direction.
    expect(result.conflict_list.length).toBeGreaterThan(0);
    expect(result.conflict_list.some((c) => c.includes('1H'))).toBe(true);
    expect(result.conflict_list.some((c) => c.includes('15m'))).toBe(true);
    // Short-term opposition → 30-50% penalty.
    expect(result.confidence_penalty).toBeGreaterThanOrEqual(30);
    expect(result.confidence_penalty).toBeLessThanOrEqual(50);
    // Higher TFs still agree → alignment score reflects 3/5 agreement.
    expect(result.alignment_score).toBe(60);
  });

  it('computes cascading timeframe agreement (1W/1D/4H up, 1H/15m down)', () => {
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1W': trend(100, 0.5),
      '1D': trend(100, 0.3),
      '4H': trend(100, 0.1),
      '1H': trend(100, -0.05),
      '15m': trend(100, -0.02),
    };
    const result = analyzer.analyze(data);
    expect(result.higher_tf_direction).toBe('BULLISH');
    expect(result.confirmation_flag).toBe(false);
    expect(result.alignment_score).toBe(60);
    expect(result.confidence_penalty).toBeGreaterThanOrEqual(30);
  });

  it('skips timeframes with insufficient data and records them', () => {
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1W': trend(100, 0.5),
      '1D': trend(100, 0.3),
      '4H': trend(5, 0.1), // < min_candles → insufficient
    };
    const result = analyzer.analyze(data);
    // Only 1W, 1D analyzed; 4H/1H/15m insufficient.
    expect(result.per_timeframe).toHaveLength(2);
    expect(result.conflict_list.some((c) => c.includes('insufficient'))).toBe(true);
    // No short-term timeframe analyzed → no penalty.
    expect(result.confidence_penalty).toBe(0);
  });

  it('returns NEUTRAL higher direction when no higher timeframe is decisive', () => {
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1W': flat(100),
      '1D': flat(100),
      '4H': flat(100),
    };
    const result = analyzer.analyze(data);
    expect(result.higher_tf_direction).toBe('NEUTRAL');
    expect(result.confidence_penalty).toBe(0);
  });

  it('produces per-timeframe detail with trend, momentum, SR levels, volatility', () => {
    // Oscillating series with upward drift → clear S/R levels + bullish trend.
    const candles: Candle[] = [];
    let base = 100;
    for (let i = 0; i < 100; i++) {
      base += 0.1; // gentle drift up
      const open = base + Math.sin(i * 0.6) * 2;
      const close = base + Math.sin((i + 1) * 0.6) * 2;
      candles.push({
        open,
        high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.5,
        close,
        volume: 1000,
      });
    }
    const data: Partial<Record<Timeframe, Candle[]>> = {
      '1D': candles,
      '1H': trend(100, 0.05),
    };
    const result = analyzer.analyze(data);
    const oneDay = result.per_timeframe.find((a) => a.timeframe === '1D');
    expect(oneDay).toBeDefined();
    expect(oneDay!.trend).toBe('BULLISH');
    expect(typeof oneDay!.momentum_score).toBe('number');
    expect(oneDay!.support_levels.length).toBeGreaterThan(0);
    expect(oneDay!.resistance_levels.length).toBeGreaterThan(0);
    expect(oneDay!.volatility_pct).toBeGreaterThanOrEqual(0);
  });
});
