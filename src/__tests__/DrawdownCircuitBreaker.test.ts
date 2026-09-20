import DrawdownCircuitBreaker from '../services/DrawdownCircuitBreaker';

describe('DrawdownCircuitBreaker', () => {
  describe('drawdown tracking', () => {
    it('reports zero drawdown when no equity has been observed', () => {
      const cb = new DrawdownCircuitBreaker();
      expect(cb.drawdownPct(100)).toBe(0);
    });

    it('reports zero drawdown at the peak', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      expect(cb.drawdownPct(100)).toBe(0);
    });

    it('computes drawdown percentage below peak', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      // 100 -> 90 is a 10% drawdown.
      expect(cb.drawdownPct(90)).toBeCloseTo(10, 4);
    });

    it('reports zero drawdown above peak', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      expect(cb.drawdownPct(110)).toBe(0);
    });
  });

  describe('canEnter()', () => {
    it('allows entries when drawdown is zero (no drawdown)', () => {
      const cb = new DrawdownCircuitBreaker();
      const r = cb.canEnter(100);
      expect(r.breached).toBe(false);
      expect(r.current_drawdown_pct).toBe(0);
      expect(r.max_allowed).toBe(15);
    });

    it('allows entries during a partial drawdown below threshold', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      const r = cb.canEnter(90); // 10% drawdown < 15%.
      expect(r.breached).toBe(false);
      expect(r.current_drawdown_pct).toBeCloseTo(10, 4);
    });

    it('blocks entries when drawdown exceeds threshold', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      const r = cb.canEnter(80); // 20% drawdown > 15%.
      expect(r.breached).toBe(true);
      expect(r.current_drawdown_pct).toBeCloseTo(20, 4);
      expect(r.message).toContain('BLOCKED');
    });

    it('respects a custom threshold', () => {
      const cb = new DrawdownCircuitBreaker({ max_drawdown_pct: 10 });
      cb.update(100);
      expect(cb.canEnter(92).breached).toBe(false); // 8% < 10%.
      expect(cb.canEnter(88).breached).toBe(true); // 12% > 10%.
    });
  });

  describe('recovery path', () => {
    it('resets drawdown to zero after a new portfolio high', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      expect(cb.canEnter(80).breached).toBe(true); // breached at 20% drawdown.

      // New portfolio high -> peak resets -> drawdown 0 -> entries allowed.
      const recovered = cb.canEnter(105);
      expect(recovered.breached).toBe(false);
      expect(recovered.current_drawdown_pct).toBe(0);
      expect(cb.currentPeak).toBe(105);
    });

    it('does not lower the peak on a partial recovery that stays below peak', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      cb.update(95); // drawdown, not a new high — peak stays 100.
      expect(cb.currentPeak).toBe(100);
    });

    it('reset() restores entries after a breach', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      expect(cb.canEnter(80).breached).toBe(true);

      cb.reset(120);
      expect(cb.canEnter(120).breached).toBe(false);
      expect(cb.currentPeak).toBe(120);
    });
  });

  describe('output shape', () => {
    it('exposes the full structured output contract', () => {
      const cb = new DrawdownCircuitBreaker();
      cb.update(100);
      const r = cb.canEnter(90);
      expect(r).toEqual(
        expect.objectContaining({
          current_drawdown_pct: expect.any(Number),
          max_allowed: expect.any(Number),
          breached: expect.any(Boolean),
          message: expect.any(String),
        }),
      );
    });
  });
});
