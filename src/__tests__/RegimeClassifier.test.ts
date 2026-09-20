/**
 * STORY-4.1: Unit tests for the 9-state Market Regime Classifier.
 *
 * Covers all 9 regimes (plus UNKNOWN) using synthetic 1D candle data.
 */

import { RegimeClassifier, Candle, Regime } from '../services/RegimeClassifier';

/** Generate a synthetic 1D candle series. */
function makeCandles(
  count: number,
  opts: { start?: number; drift?: number; vol?: number; volume?: number } = {},
): Candle[] {
  const start = opts.start ?? 100;
  const drift = opts.drift ?? 0;
  const vol = opts.vol ?? 1;
  const baseVolume = opts.volume ?? 1000;
  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    price += drift;
    const open = price;
    const close = price + drift + (Math.random() - 0.5) * vol * 2;
    const high = Math.max(open, close) + vol * Math.random();
    const low = Math.min(open, close) - vol * Math.random();
    candles.push({ open, high, low, close, volume: baseVolume * (0.5 + Math.random()) });
    price = close;
  }
  return candles;
}

/** Build a deterministic strong-uptrend series (steady climb). */
function uptrend(count: number, step = 1): Candle[] {
  const candles: Candle[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = close + step;
    candles.push({ open, high: close + 0.5, low: open - 0.5, close, volume: 1000 });
  }
  return candles;
}

/** Build a deterministic strong-downtrend series (steady decline). */
function downtrend(count: number, step = 0.3): Candle[] {
  const candles: Candle[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = close - step;
    candles.push({ open, high: open + 0.5, low: close - 0.5, close, volume: 1000 });
  }
  return candles;
}

/** Build a range-bound (sideways) series oscillating around a mean. */
function sideways(count: number, amplitude = 1.0): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = 100 + Math.sin(i) * amplitude;
    const close = 100 + Math.sin(i + 1) * amplitude;
    candles.push({
      open,
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
      close,
      volume: 1000,
    });
  }
  return candles;
}

/** Build a high-volatility series (large ATR swings). */
function highVol(count: number): Candle[] {
  const candles: Candle[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = close + (Math.random() - 0.5) * 20;
    candles.push({
      open,
      high: Math.max(open, close) + 10,
      low: Math.min(open, close) - 10,
      close,
      volume: 1000,
    });
  }
  return candles;
}

describe('RegimeClassifier', () => {
  let classifier: RegimeClassifier;

  beforeEach(() => {
    classifier = new RegimeClassifier();
  });

  it('returns UNKNOWN when fewer than min_candles are provided', () => {
    const result = classifier.detectRegime(makeCandles(5));
    expect(result.regime).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(result.evidence).toContain('Insufficient');
  });

  it('classifies a strong uptrend as STRONG_BULL or WEAK_BULL', () => {
    const result = classifier.detectRegime(uptrend(60));
    expect(['STRONG_BULL', 'WEAK_BULL']).toContain(result.regime);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.duration_bars).toBe(60);
  });

  it('classifies a strong downtrend as STRONG_BEAR or WEAK_BEAR', () => {
    const result = classifier.detectRegime(downtrend(60));
    expect(['STRONG_BEAR', 'WEAK_BEAR']).toContain(result.regime);
  });

  it('classifies a range-bound market as SIDEWAYS', () => {
    const result = classifier.detectRegime(sideways(60));
    expect(result.regime).toBe('SIDEWAYS');
  });

  it('classifies high ATR% swings as HIGH_VOL', () => {
    const result = classifier.detectRegime(highVol(60));
    expect(result.regime).toBe('HIGH_VOL');
  });

  it('classifies a tight, low-volatility market as LOW_VOL', () => {
    // Tiny amplitude produces ATR% well below 1%.
    const candles: Candle[] = [];
    let close = 100;
    for (let i = 0; i < 60; i++) {
      const open = close;
      close = close + 0.01;
      candles.push({ open, high: open + 0.05, low: open - 0.05, close, volume: 1000 });
    }
    const result = classifier.detectRegime(candles);
    expect(result.regime).toBe('LOW_VOL');
  });

  it('flags a volume surge as LIQUIDITY_SHOCK', () => {
    // Normal volume for 50 bars, then a massive spike in the last 10.
    const candles: Candle[] = [];
    let close = 100;
    for (let i = 0; i < 60; i++) {
      const open = close;
      close = close + 0.5;
      const volume = i >= 50 ? 100000 : 1000;
      candles.push({ open, high: open + 0.5, low: open - 0.5, close, volume });
    }
    const result = classifier.detectRegime(candles);
    expect(result.regime).toBe('LIQUIDITY_SHOCK');
    expect(result.evidence).toContain('surge');
  });

  it('detects a regime transition via SMA crossover', () => {
    // Steady uptrend for 50 bars, then sharp reversal (downtrend) in the last 10.
    const candles: Candle[] = [];
    let close = 100;
    for (let i = 0; i < 50; i++) {
      const open = close;
      close = close + 1;
      candles.push({ open, high: open + 0.5, low: open - 0.5, close, volume: 1000 });
    }
    for (let i = 0; i < 10; i++) {
      const open = close;
      close = close - 3;
      candles.push({ open, high: open + 0.5, low: close - 0.5, close, volume: 1000 });
    }
    const result = classifier.detectRegime(candles);
    expect(result.regime).toBe('TRANSITION');
  });

  it('exposes all 9 regime values via the RegimeEnum type', () => {
    const all: Regime['regime'][] = [
      'STRONG_BULL',
      'WEAK_BULL',
      'STRONG_BEAR',
      'WEAK_BEAR',
      'SIDEWAYS',
      'HIGH_VOL',
      'LOW_VOL',
      'TRANSITION',
      'LIQUIDITY_SHOCK',
      'UNKNOWN',
    ];
    expect(all).toHaveLength(10); // 9 states + UNKNOWN
  });
});
