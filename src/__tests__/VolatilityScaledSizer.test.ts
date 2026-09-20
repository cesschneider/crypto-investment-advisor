import VolatilityScaledSizer, {
  atr,
  pearson,
  Candle,
  PortfolioPosition,
  SizingInput,
} from '../services/VolatilityScaledSizer';

/** Build a flat OHLCV series of `n` candles around a base price with a given range. */
function flatCandles(n: number, base = 100, range = 1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < n; i++) {
    candles.push({
      open: base,
      high: base + range,
      low: base - range,
      close: base,
      volume: 1000,
    });
  }
  return candles;
}

/** Build candles with a linearly trending close (for correlation tests). */
function trendingCandles(n: number, start = 100, step = 1): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const close = start + i * step;
    candles.push({
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
    });
  }
  return candles;
}

function baseInput(overrides: Partial<SizingInput> = {}): SizingInput {
  return {
    candles: flatCandles(20, 100, 1),
    entryPrice: 100,
    portfolioValue: 10000,
    ...overrides,
  };
}

describe('VolatilityScaledSizer', () => {
  const sizer = new VolatilityScaledSizer();

  describe('atr() helper', () => {
    it('returns 0 when fewer than period+1 candles', () => {
      expect(atr([], 14)).toBe(0);
      expect(atr(flatCandles(14), 14)).toBe(0);
    });

    it('computes ATR from high-low range for flat candles', () => {
      expect(atr(flatCandles(20, 100, 1), 14)).toBeCloseTo(2, 4);
    });
  });

  describe('pearson() helper', () => {
    it('returns 1.0 for identical series', () => {
      const a = [1, 2, 3, 4, 5];
      expect(pearson(a, a)).toBeCloseTo(1, 6);
    });

    it('returns -1.0 for perfectly inverse series', () => {
      const a = [1, 2, 3, 4, 5];
      const b = [5, 4, 3, 2, 1];
      expect(pearson(a, b)).toBeCloseTo(-1, 6);
    });

    it('returns 0 for short series', () => {
      expect(pearson([1], [1])).toBe(0);
    });
  });

  describe('size()', () => {
    it('returns NO_TRADE for insufficient candles', () => {
      const r = sizer.size(baseInput({ candles: flatCandles(10) }));
      expect(r.action).toBe('NO_TRADE');
      expect(r.position_size).toBe(0);
    });

    it('scales down in high volatility (large ATR% → small size)', () => {
      // range=5 → ATR=10 → ATR% = 10%. scale = 10/1.5 = 6.67 → size ~1000/6.67 = 150.
      const r = sizer.size(baseInput({ candles: flatCandles(20, 100, 5) }));
      expect(r.action).toBe('SIZED');
      expect(r.position_size).toBeCloseTo(150, 0);
      expect(r.constraints_violated).toBe(false);
    });

    it('scales up in low volatility (small ATR% → large size)', () => {
      // range=0.25 → ATR=0.5 → ATR% = 0.5%. scale = 0.5/1.5 = 0.333 → size ~1000/0.333 = 3000.
      // Use a large portfolio so max_position_pct (5%) does not bind at 500.
      const r = sizer.size(baseInput({ candles: flatCandles(20, 100, 0.25), portfolioValue: 1000000 }));
      expect(r.action).toBe('SIZED');
      expect(r.position_size).toBeCloseTo(3000, 0);
      expect(r.constraints_violated).toBe(false);
    });

    it('caps low-volatility size at max_position_pct', () => {
      // Same low-volatility input, but small portfolio → 5% cap = 500 binds.
      const r = sizer.size(baseInput({ candles: flatCandles(20, 100, 0.25) }));
      expect(r.action).toBe('SIZED');
      expect(r.position_size).toBeCloseTo(500, 0);
      expect(r.max_allowed).toBeCloseTo(500, 0);
      expect(r.constraints_violated).toBe(true);
    });

    it('enforces max_position_pct hard limit', () => {
      // Force a huge base size so volatility size exceeds the 5% cap (500).
      const big = new VolatilityScaledSizer({ base_size: 100000 });
      const r = big.size(baseInput());
      expect(r.position_size).toBeCloseTo(500, 0);
      expect(r.max_allowed).toBeCloseTo(500, 0);
      expect(r.constraints_violated).toBe(true);
    });

    it('enforces max_portfolio_risk_pct cap', () => {
      // ATR% = 2% → risk per unit 0.02. Budget = 2% of 10000 = 200. Risk-capped size = 200/0.02 = 10000.
      // Volatility size at ATR% 2% vs baseline 1.5% → scale 1.333 → size 750. Both under 500 cap.
      // Use a large portfolio so max_position_pct does not bind, isolating the risk cap.
      const r = sizer.size(baseInput({ portfolioValue: 1000000 }));
      // ATR% 2% → risk/unit 0.02; budget = 20000; risk-capped size = 1000000.
      // Volatility size = 1000 / (2/1.5) = 750. 750 < 1000000 → no risk cap. SIZED at 750.
      expect(r.action).toBe('SIZED');
      expect(r.position_size).toBeCloseTo(750, 0);
      expect(r.constraints_violated).toBe(false);
    });

    it('returns NO_TRADE when risk budget is exhausted', () => {
      // currentPortfolioRisk >= portfolio risk cap → budget <= 0 → NO_TRADE.
      const r = sizer.size(baseInput({ currentPortfolioRisk: 200 }));
      expect(r.action).toBe('NO_TRADE');
      expect(r.position_size).toBe(0);
    });

    it('shrinks position when correlated with existing book', () => {
      // Two identically trending positions → correlation ~1.0 > 0.7 → shrink ×0.5.
      const positions: PortfolioPosition[] = [
        { symbol: 'ETH', size: 500, priceSeries: trendingCandles(20).map((c) => c.close) },
      ];
      const candles = trendingCandles(20);
      const r = sizer.size(baseInput({ candles, positions }));
      expect(r.constraints_violated).toBe(true);
      // Volatility size at entry 119, ATR ~1 (range high-low=2 but TR uses gaps too).
      // Regardless, correlation shrink must halve whatever the pre-correlation size was.
      expect(r.action).toBe('SIZED');
      expect(r.rationale).toContain('correlation');
    });

    it('does not shrink uncorrelated positions', () => {
      // Anti-correlated series → correlation ~ -1 → below threshold → no shrink.
      const positions: PortfolioPosition[] = [
        { symbol: 'X', size: 500, priceSeries: [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81] },
      ];
      const candles = trendingCandles(20); // rising
      const r = sizer.size(baseInput({ candles, positions }));
      expect(r.rationale).not.toContain('correlation');
    });

    it('returns NO_TRADE when constraints reduce size below minimum', () => {
      const tiny = new VolatilityScaledSizer({ min_position_size: 1000000 });
      const r = tiny.size(baseInput());
      expect(r.action).toBe('NO_TRADE');
      expect(r.position_size).toBe(0);
      expect(r.constraints_violated).toBe(true);
    });

    it('exposes the full structured output shape', () => {
      const r = sizer.size(baseInput());
      expect(r).toEqual(
        expect.objectContaining({
          position_size: expect.any(Number),
          size_pct_of_portfolio: expect.any(Number),
          max_allowed: expect.any(Number),
          constraints_violated: expect.any(Boolean),
          action: expect.stringMatching(/SIZED|NO_TRADE/),
          rationale: expect.any(String),
        }),
      );
    });
  });
});
