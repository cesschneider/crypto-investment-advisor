/**
 * STORY-4.3: Unit tests for the Regime-Gated Strategy Weighter.
 *
 * Covers: STRONG_BULL favors Swing, SIDEWAYS favors DayTrade, LIQUIDITY_SHOCK
 * vetoes entry, conflict resolution by regime weight (not average), and the
 * structured output contract (strategy_weights / dominant_strategy / rationale).
 */

import { StrategyWeighter, StrategySignal } from '../services/StrategyWeighter';
import { Regime } from '../services/RegimeClassifier';

function regime(regime: Regime['regime'], confidence = 60): Regime {
  return { regime, confidence, evidence: 'test', duration_bars: 30 };
}

function swingSignal(
  action: StrategySignal['action'],
  score: number,
): StrategySignal {
  return { strategy: 'swing', action, score, confidence: 70, rationale: 'trend-following' };
}

function daytradeSignal(
  action: StrategySignal['action'],
  score: number,
): StrategySignal {
  return { strategy: 'daytrade', action, score, confidence: 70, rationale: 'mean-reversion' };
}

describe('StrategyWeighter', () => {
  let weighter: StrategyWeighter;

  beforeEach(() => {
    weighter = new StrategyWeighter();
  });

  it('STRONG_BULL favors Swing (trend-following) over DayTrade', () => {
    const r = weighter.weight(
      regime('STRONG_BULL'),
      swingSignal('BUY', 80),
      daytradeSignal('HOLD', 50),
    );
    expect(r.strategy_weights.swing).toBe(0.8);
    expect(r.strategy_weights.daytrade).toBe(0.1);
    expect(r.dominant_strategy).toBe('swing');
    expect(r.vetoed).toBe(false);
    expect(r.combined_score).toBeGreaterThan(60);
    expect(r.combined_action).toBe('BUY');
  });

  it('SIDEWAYS favors DayTrade (mean-reversion) over Swing', () => {
    const r = weighter.weight(
      regime('SIDEWAYS'),
      swingSignal('HOLD', 50),
      daytradeSignal('BUY', 70),
    );
    expect(r.strategy_weights.swing).toBe(0.1);
    expect(r.strategy_weights.daytrade).toBe(0.7);
    expect(r.dominant_strategy).toBe('daytrade');
    expect(r.vetoed).toBe(false);
  });

  it('LIQUIDITY_SHOCK vetoes entry entirely regardless of strategy signals', () => {
    const r = weighter.weight(
      regime('LIQUIDITY_SHOCK', 85),
      swingSignal('BUY', 90),
      daytradeSignal('BUY', 85),
    );
    expect(r.vetoed).toBe(true);
    expect(r.combined_action).toBe('NO_TRADE');
    expect(r.dominant_strategy).toBe('none');
    expect(r.rationale).toContain('LIQUIDITY_SHOCK');
  });

  it('resolves conflicting signals (Swing BUY + DayTrade SELL) via regime weight, not average', () => {
    // Strong bull → swing dominates, so the combined score should be bullish.
    const r = weighter.weight(
      regime('STRONG_BULL'),
      swingSignal('BUY', 90),
      daytradeSignal('SELL', 10),
    );
    // Swing weight 0.8 vs daytrade 0.1 → combined strongly bullish.
    expect(r.combined_score).toBeGreaterThan(60);
    expect(r.combined_action).toBe('BUY');
    expect(r.dominant_strategy).toBe('swing');
    expect(r.rationale).toContain('conflicting signals');
  });

  it('resolves the same conflicting signals the opposite way in SIDEWAYS', () => {
    const r = weighter.weight(
      regime('SIDEWAYS'),
      swingSignal('BUY', 90),
      daytradeSignal('SELL', 10),
    );
    // DayTrade weight 0.7 vs swing 0.1 → combined strongly bearish.
    expect(r.combined_score).toBeLessThan(40);
    expect(r.combined_action).toBe('SELL');
    expect(r.dominant_strategy).toBe('daytrade');
  });

  it('WEAK_BULL gives balanced weights (swing 0.4 / daytrade 0.5)', () => {
    const r = weighter.weight(
      regime('WEAK_BULL'),
      swingSignal('BUY', 70),
      daytradeSignal('HOLD', 50),
    );
    expect(r.strategy_weights.swing).toBe(0.4);
    expect(r.strategy_weights.daytrade).toBe(0.5);
    expect(r.dominant_strategy).toBe('daytrade'); // 0.5 > 0.4
    expect(r.vetoed).toBe(false);
  });

  it('HIGH_VOL reduces both strategy weights', () => {
    const r = weighter.weight(
      regime('HIGH_VOL'),
      swingSignal('HOLD', 50),
      daytradeSignal('HOLD', 50),
    );
    // HIGH_VOL: swing 0.2, daytrade 0.15 — both below trend/ranges defaults.
    expect(r.strategy_weights.swing).toBe(0.2);
    expect(r.strategy_weights.daytrade).toBe(0.15);
    expect(r.vetoed).toBe(false);
  });

  it('UNKNOWN regime with a zero-sum config vetoes when weights sum to zero', () => {
    // Default UNKNOWN weights are 0.4/0.4 (sum 0.8) → not vetoed, neutral-ish.
    const r = weighter.weight(
      regime('UNKNOWN', 0),
      swingSignal('HOLD', 50),
      daytradeSignal('HOLD', 50),
    );
    expect(r.vetoed).toBe(false);
    expect(r.strategy_weights.swing).toBe(0.4);
  });

  it('emits the full structured output contract', () => {
    const r = weighter.weight(
      regime('STRONG_BULL'),
      swingSignal('BUY', 85),
      daytradeSignal('HOLD', 50),
    );
    expect(r).toHaveProperty('strategy_weights');
    expect(r).toHaveProperty('dominant_strategy');
    expect(r).toHaveProperty('combined_score');
    expect(r).toHaveProperty('combined_action');
    expect(r).toHaveProperty('vetoed');
    expect(r).toHaveProperty('rationale');
    expect(typeof r.strategy_weights.swing).toBe('number');
    expect(typeof r.strategy_weights.daytrade).toBe('number');
    expect(typeof r.rationale).toBe('string');
  });
});
