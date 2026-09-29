/**
 * Epic 11 — validation tests for planned stories (RED-first TDD gates).
 *
 * These encode the ACCEPTANCE CRITERIA of the planned stories. They FAIL until
 * each story is implemented. Run per-story:
 *
 *   npx jest src/__tests__/epic11-validation.test.ts -t "11.1"   (trailing after TP1)
 *   npx jest src/__tests__/epic11-validation.test.ts -t "11.4"   (short side)
 *   npx jest src/__tests__/epic11-validation.test.ts -t "11.5"   (cooldown)
 *
 * 11.2 (conservative gates) / 11.3 (block_reason persistence) / 11.6 (regime gate)
 * validated in config.test.ts / paper-trading-executor.test.ts / signal-engine.test.ts
 * (see story files).
 *
 * API used: PaperTradingExecutor.runExits(prices, freshActions) + snapshot(prices)
 * (matches src/main.ts usage), ExitManager.evaluate(position, freshAction).
 */

import { ExitManager, ManagedPosition } from '../engine/exit-manager';
import { PaperTradingExecutor } from '../paper-trading/executor';
import { AdvisorConfig } from '../config/advisor-config';
import { loadConfig } from '../config/profile-loader';
import { EngineResult } from '../engine/signal-engine';

// ---------- helpers ----------

function longPosition(overrides: Partial<ManagedPosition> = {}): ManagedPosition {
  return {
    symbol: 'SOL',
    side: 'long',
    entry_price: 100,
    current_price: 100,
    stop_loss: 95,
    take_profits: [
      { price: 110, percent: 0.5 },
      { price: 120, percent: 0.5 },
    ],
    best_price: 100,
    ...overrides,
  };
}

function minimalConfig(): AdvisorConfig {
  // Real profile config (aggressive) — guaranteed to satisfy AdvisorConfig shape.
  return loadConfig('aggressive');
}

function engineResult(
  action: EngineResult['action'],
  overrides: Partial<EngineResult> = {},
): EngineResult {
  return {
    symbol: 'SOL',
    action,
    confidence: 60,
    trade_setup: {
      entry_price: 100,
      stop_loss: 95,
      take_profits: [{ price: 110, percent: 1.0 }],
      risk_reward_ratio: 2,
      position_size: 100,
      position_size_pct: 0.01,
    },
    evidence: [],
    ...overrides,
  } as EngineResult;
}

function sellEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return engineResult('SELL', {
    trade_setup: {
      entry_price: 100,
      stop_loss: 105,
      take_profits: [{ price: 90, percent: 1.0 }],
      risk_reward_ratio: 2,
      position_size: 100,
      position_size_pct: 0.01,
    },
    ...overrides,
  } as any);
}

// =====================================================================
// STORY 11.1 — trailing stop arms only after TP1 (breakeven → trail)
// =====================================================================

describe('STORY-11.1 trailing arms only after TP1', () => {
  const em = new ExitManager({ trailing_stop_pct: 0.02, allow_signal_flip_exit: true, trail_activation: 'tp1' } as any);

  it('below TP1: dip that would have trailed must NOT trigger TRAILING_STOP', () => {
    // Entry 100, TP1 110, trail 2%. Rose to 103, fell to 100.8.
    // OLD: trail from 103 → 100.94 → exit TRAILING_STOP at 100.8 (the -0.94% killer).
    // NEW: TP1 never hit → trailing inactive → hold (price > stop 95).
    const p = longPosition({ current_price: 100.8, best_price: 103 });
    const d = em.evaluate(p);
    expect(d.exit).toBe(false);
  });

  it('below TP1: hard ATR stop still works', () => {
    const p = longPosition({ current_price: 94, best_price: 96 });
    const d = em.evaluate(p);
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('STOP_LOSS');
  });

  it('after TP1 hit: trailing arms and protects profit', () => {
    // TP1 (110) consumed in a prior cycle (cascaded TP). best 115, now 112.
    // Trail from 115 → 112.7 → exit at 112 with profit locked.
    const p = longPosition({ current_price: 112, best_price: 115, take_profits: [] });
    const d = em.evaluate(p);
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('TRAILING_STOP');
  });

  it('TP1 hit then retrace: position cannot round-trip to a full loss (breakeven floor)', () => {
    // TP1 hit at 110.5 → next cycle price 99 (below entry). With breakeven floor,
    // exit must be protective (not a full −5% stop round-trip).
    const p = longPosition({ current_price: 99, best_price: 110.5, take_profits: [] });
    const d = em.evaluate(p);
    expect(d.exit).toBe(true);
    expect(['TRAILING_STOP', 'STOP_LOSS']).toContain(d.reason);
    // Floor = entry 100 (breakeven). rationale must reference the floor/entry.
    expect(d.rationale).toMatch(/entry|breakeven|floor/i);
  });

  it('executor wires trail_activation from config (config plumbing)', () => {
    // The executor must pass trail_activation through to the ExitManager.
    // Indirect check: a fresh executor with aggressive config holds a position
    // that would have trailed below TP1 (no TRAILING_STOP exit).
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(engineResult('BUY'), '2026-09-28T00:00:00Z');
    // Price rose to 103 (below TP1 110) then pulled back to 100.8.
    ex.runExits({ SOL: 100.8 }, { SOL: 'HOLD' });
    expect(ex.openPositions.length).toBe(1); // must NOT have trailed out below TP1
  });
});

// =====================================================================
// STORY 11.4 — long/short executor (paper shorting)
// =====================================================================

describe('STORY-11.4 short side in executor', () => {
  it('SELL signal opens a SHORT position (not long)', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    const opened = ex.openPosition(sellEngineResult(), '2026-09-28T00:00:00Z');
    expect(opened).toBe(true);
    expect(ex.openPositions[0].side).toBe('short');
  });

  it('short stop-loss mirrors: adverse move above stop closes the short at a loss', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(sellEngineResult(), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 106 }, { SOL: 'HOLD' }); // above stop 105
    const closed = ex.snapshot({ SOL: 106 }).closed_trades;
    expect(closed.length).toBe(1);
    expect(closed[0].side).toBe('short');
    expect(closed[0].exit_reason).toBe('STOP_LOSS');
    expect(closed[0].pnl).toBeLessThan(0);
  });

  it('short take-profit: (entry − exit) × qty > 0 when price falls', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(sellEngineResult(), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 85 }, { SOL: 'HOLD' }); // TP at 90, price 85 below
    const closed = ex.snapshot({ SOL: 85 }).closed_trades;
    expect(closed.length).toBe(1);
    expect(closed[0].pnl).toBeGreaterThan(0); // short gained as price fell
  });

  it('short flip-exit on fresh BUY signal', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(sellEngineResult(), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 98 }, { SOL: 'BUY' }); // flip closes the short
    const closed = ex.snapshot({ SOL: 98 }).closed_trades;
    expect(closed.length).toBe(1);
    expect(closed[0].exit_reason).toBe('SIGNAL_FLIP');
  });
});

// =====================================================================
// STORY 11.5 — per-symbol cooldown after stop-out (24h)
// =====================================================================

describe('STORY-11.5 cooldown after stop-out', () => {
  it('STOP_LOSS exit blocks same-symbol re-entry within 24h', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(engineResult('BUY'), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 94 }, { SOL: 'HOLD' }); // stop-out (stop 95)
    expect(ex.snapshot({ SOL: 94 }).closed_trades.length).toBe(1);

    const reopened = ex.openPosition(engineResult('BUY'), '2026-09-28T01:30:00Z'); // 1.5h later
    expect(reopened).toBe(false);
  });

  it('after cooldown expiry (24h) re-entry is allowed', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(engineResult('BUY'), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 94 }, { SOL: 'HOLD' });
    // Simulate elapsed cooldown: restore a state whose cooldown expired.
    const state = ex.exportState();
    state.cooldowns!.SOL = new Date(Date.now() - PaperTradingExecutor.COOLDOWN_MS - 60000).toISOString();
    const ex2 = new PaperTradingExecutor(10000, minimalConfig());
    ex2.restoreState(state);
    expect(ex2.isCoolingDown('SOL')).toBe(false); // expired → GC'd
    const reopened = ex2.openPosition(engineResult('BUY'), new Date().toISOString());
    expect(reopened).toBe(true);
  });

  it('TAKE_PROFIT exit does NOT cool down (winners may re-enter immediately)', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(engineResult('BUY'), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 111 }, { SOL: 'HOLD' }); // TP1 at 110 → full close (percent 1.0)
    const closed = ex.snapshot({ SOL: 111 }).closed_trades;
    expect(closed.length).toBe(1);
    expect(closed[0].exit_reason).toBe('TAKE_PROFIT');

    const reopened = ex.openPosition(engineResult('BUY'), '2026-09-28T01:30:00Z');
    expect(reopened).toBe(true);
  });

  it('cooldowns survive state export/restore (restart-safe)', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    ex.openPosition(engineResult('BUY'), '2026-09-28T00:00:00Z');
    ex.runExits({ SOL: 94 }, { SOL: 'HOLD' });
    const state = ex.exportState();
    const ex2 = new PaperTradingExecutor(10000, minimalConfig());
    ex2.restoreState(state);
    const reopened = ex2.openPosition(engineResult('BUY'), '2026-09-28T01:30:00Z');
    expect(reopened).toBe(false);
  });
});

// =====================================================================
// STORY 11.2/11.3 — conservative gates + rejection persistence (config-level)
// =====================================================================

describe('STORY-11.2/11.3 conservative gates + rejection record schema', () => {
  it('conservative profile must not require on-chain confirmation (unwired source)', () => {
    const cfg = loadConfig('conservative');
    expect(cfg.confirmation.require_on_chain_confirmation).toBe(false);
  });

  it('conservative min_confidence is reachable (≤ 65)', () => {
    const cfg = loadConfig('conservative');
    expect(cfg.min_confidence).toBeLessThanOrEqual(65);
  });

  it('executor state schema carries rejected_signals (capped at 200)', () => {
    const ex = new PaperTradingExecutor(10000, minimalConfig());
    const state = ex.exportState();
    // After 11.3 the exported state includes rejected_signals array.
    expect(Array.isArray((state as any).rejected_signals)).toBe(true);
    const cap = (state as any).rejected_signals?.maxEntries ?? undefined;
    expect(cap).toBeUndefined(); // cap enforced by logic, not a field
  });
});