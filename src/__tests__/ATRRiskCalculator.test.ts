import ATRBasedRiskCalculator, { atr, Candle, ATRRiskResult } from '../services/ATRRiskCalculator';

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

describe('ATRBasedRiskCalculator', () => {
  const calc = new ATRBasedRiskCalculator();

  describe('atr() helper', () => {
    it('returns 0 when fewer than period+1 candles', () => {
      expect(atr([], 14)).toBe(0);
      expect(atr(flatCandles(14), 14)).toBe(0);
    });

    it('computes ATR from high-low range for flat candles', () => {
      // Each candle has high-low = 2, so TR = 2 and ATR = 2.
      expect(atr(flatCandles(20, 100, 1), 14)).toBeCloseTo(2, 4);
    });
  });

  describe('calculate()', () => {
    it('returns INADEQUATE_RR for insufficient candles', () => {
      const r = calc.calculate(flatCandles(10), 100);
      expect(r.verdict).toBe('INADEQUATE_RR');
      expect(r.stop_price).toBe(0);
    });

    it('rejects zero/negative entry price', () => {
      const r = calc.calculate(flatCandles(20), 0);
      expect(r.verdict).toBe('INADEQUATE_RR');
    });

    it('produces a valid stop and cascaded take-profits in a NEUTRAL regime', () => {
      // range=1 → ATR=2. Neutral multiplier 1.0 → stop distance 2.
      const r = calc.calculate(flatCandles(20, 100, 1), 100, 'NEUTRAL');
      expect(r.stop_price).toBeCloseTo(98, 2);
      expect(r.tp_level1).toBeCloseTo(103, 2); // 100 + 1.5*2
      expect(r.tp_level2).toBeCloseTo(105, 2); // 100 + 2.5*2
      expect(r.risk_pct).toBeCloseTo(0.02, 4);
      expect(r.ratio).toBeGreaterThan(0);
    });

    it('uses wider stop distance in HIGH_VOL regime', () => {
      const hi = calc.calculate(flatCandles(20, 100, 1), 100, 'HIGH_VOL');
      const lo = calc.calculate(flatCandles(20, 100, 1), 100, 'LOW_VOL');
      // HIGH_VOL multiplier 1.5 → stop distance 3; LOW_VOL 0.8 → 1.6.
      expect(hi.stop_price).toBeCloseTo(97, 2);
      expect(lo.stop_price).toBeCloseTo(98.4, 2);
      expect(hi.stop_price).toBeLessThan(lo.stop_price);
    });

    it('returns OK when reward/risk ratio meets the minimum', () => {
      // ATR=2, stop distance 2 (risk 2%), blended TP = 0.5*103 + 0.5*105 = 104 (reward 4%).
      // ratio = 4/2 = 2.0 >= 1.5 → OK.
      const r = calc.calculate(flatCandles(20, 100, 1), 100, 'NEUTRAL');
      expect(r.ratio).toBeCloseTo(2.0, 2);
      expect(r.verdict).toBe('OK');
    });

    it('returns INADEQUATE_RR when reward/risk ratio is below minimum', () => {
      // Force a huge stop distance (tiny reward relative to risk) via a custom config
      // with a very high stop multiplier and tiny TP multiples.
      const custom = new ATRBasedRiskCalculator({
        high_vol_multiplier: 10,
        neutral_multiplier: 10,
        low_vol_multiplier: 10,
        tp1_atr_multiple: 0.2,
        tp2_atr_multiple: 0.3,
        min_reward_risk_ratio: 1.5,
      });
      const r = custom.calculate(flatCandles(20, 100, 1), 100, 'NEUTRAL');
      expect(r.verdict).toBe('INADEQUATE_RR');
      expect(r.ratio).toBeLessThan(1.5);
    });

    it('exposes the full structured output shape', () => {
      const r: ATRRiskResult = calc.calculate(flatCandles(20, 100, 1), 100, 'LOW_VOL');
      expect(r).toEqual(
        expect.objectContaining({
          stop_price: expect.any(Number),
          tp_level1: expect.any(Number),
          tp_level2: expect.any(Number),
          risk_pct: expect.any(Number),
          reward_pct: expect.any(Number),
          ratio: expect.any(Number),
          verdict: expect.stringMatching(/OK|INADEQUATE_RR/),
          rationale: expect.any(String),
        }),
      );
    });
  });
});
