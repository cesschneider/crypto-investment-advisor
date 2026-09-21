import { PaperTradingExecutor } from '../paper-trading/executor';
import { getProfile } from '../profiles/investor-profile';
import { EngineResult } from '../engine/signal-engine';

function engineResult(symbol: string, overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    symbol,
    action: 'BUY',
    confidence: 80,
    trade_setup: {
      entry_price: 100,
      stop_loss: 95,
      take_profits: [
        { price: 110, percent: 0.5 },
        { price: 120, percent: 0.5 },
      ],
      risk_reward_ratio: 2.0,
      position_size: 500,
      position_size_pct: 0.05,
    },
    evidence: ['test'],
    ...overrides,
  };
}

describe('PaperTradingExecutor', () => {
  test('opens a position from a tradeable engine result', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('moderate'));
    const opened = ex.openPosition(engineResult('BTC'), new Date().toISOString());
    expect(opened).toBe(true);
    expect(ex.openPositions).toHaveLength(1);
    expect(ex.openPositions[0].symbol).toBe('BTC');
  });

  test('rejects a result without trade_setup', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('moderate'));
    const opened = ex.openPosition(engineResult('BTC', { trade_setup: undefined }), new Date().toISOString());
    expect(opened).toBe(false);
    expect(ex.openPositions).toHaveLength(0);
  });

  test('stop-loss exit closes position and records realized P&L', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('moderate'));
    ex.openPosition(engineResult('BTC'), new Date().toISOString());

    const decisions = ex.runExits({ BTC: 90 }, { BTC: 'HOLD' }); // below stop 95
    expect(decisions).toHaveLength(1);
    expect(decisions[0].reason).toBe('STOP_LOSS');
    expect(ex.openPositions).toHaveLength(0);

    const snap = ex.snapshot({ BTC: 90 });
    expect(snap.closed_trades).toHaveLength(1);
    expect(snap.closed_trades[0].pnl).toBeLessThan(0);
  });

  test('take-profit exit closes and locks a gain', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('moderate'));
    ex.openPosition(engineResult('ETH'), new Date().toISOString());

    const decisions = ex.runExits({ ETH: 115 }, { ETH: 'HOLD' }); // above TP1 110
    expect(decisions).toHaveLength(1);
    expect(decisions[0].reason).toBe('TAKE_PROFIT');

    const snap = ex.snapshot({ ETH: 115 });
    expect(snap.closed_trades[0].pnl).toBeGreaterThan(0);
  });

  test('signal flip closes a long on fresh SELL', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('moderate'));
    ex.openPosition(engineResult('BTC'), new Date().toISOString());

    const decisions = ex.runExits({ BTC: 105 }, { BTC: 'SELL' });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].reason).toBe('SIGNAL_FLIP');
  });

  test('enforces max exposure from profile', () => {
    const ex = new PaperTradingExecutor(1000, getProfile('conservative'));
    // conservative max_exposure 0.30 → 300; position size 500 exceeds it.
    const opened = ex.openPosition(engineResult('BTC', { trade_setup: { entry_price: 100, stop_loss: 95, take_profits: [{ price: 110, percent: 1 }], risk_reward_ratio: 2, position_size: 500, position_size_pct: 0.5 } }), new Date().toISOString());
    expect(opened).toBe(false);
  });

  test('does not open duplicate positions for the same symbol', () => {
    const ex = new PaperTradingExecutor(10000, getProfile('aggressive'));
    ex.openPosition(engineResult('BTC'), new Date().toISOString());
    const again = ex.openPosition(engineResult('BTC'), new Date().toISOString());
    expect(again).toBe(false);
    expect(ex.openPositions).toHaveLength(1);
  });
});
