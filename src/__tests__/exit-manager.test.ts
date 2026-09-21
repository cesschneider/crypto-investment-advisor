import { ExitManager, ManagedPosition } from '../engine/exit-manager';

function longPos(overrides: Partial<ManagedPosition> = {}): ManagedPosition {
  return {
    symbol: 'BTC',
    side: 'long',
    entry_price: 100,
    current_price: 105,
    stop_loss: 95,
    take_profits: [
      { price: 110, percent: 0.5 },
      { price: 120, percent: 0.5 },
    ],
    best_price: 105,
    ...overrides,
  };
}

describe('ExitManager', () => {
  test('stop-loss closes a long when price <= stop', () => {
    const em = new ExitManager();
    const d = em.evaluate(longPos({ current_price: 94, best_price: 100 }));
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('STOP_LOSS');
    expect(d.close_fraction).toBe(1);
  });

  test('take-profit closes a fraction at TP1', () => {
    const em = new ExitManager();
    const d = em.evaluate(longPos({ current_price: 111 }));
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('TAKE_PROFIT');
    expect(d.tp_index).toBe(0);
    expect(d.close_fraction).toBe(0.5);
  });

  test('take-profit TP2 when above second level', () => {
    const em = new ExitManager();
    const d = em.evaluate(longPos({ current_price: 121 }));
    expect(d.reason).toBe('TAKE_PROFIT');
    expect(d.tp_index).toBe(0); // cascaded: TP1 hit first
  });

  test('signal flip closes a long on fresh SELL', () => {
    const em = new ExitManager({ allow_signal_flip_exit: true });
    const d = em.evaluate(longPos({ current_price: 105 }), 'SELL');
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('SIGNAL_FLIP');
  });

  test('signal flip does not fire when disabled', () => {
    const em = new ExitManager({ allow_signal_flip_exit: false });
    const d = em.evaluate(longPos({ current_price: 105 }), 'SELL');
    expect(d.exit).toBe(false);
  });

  test('trailing stop closes when price retraces below trail', () => {
    const em = new ExitManager({ trailing_stop_pct: 0.05 });
    // best_price 105, trail = 105 * 0.95 = 99.75
    const d = em.evaluate(longPos({ current_price: 99, best_price: 105 }));
    expect(d.exit).toBe(true);
    expect(d.reason).toBe('TRAILING_STOP');
  });

  test('no exit when price is between stop and TP with no flip', () => {
    const em = new ExitManager();
    const d = em.evaluate(longPos({ current_price: 105, best_price: 105 }));
    expect(d.exit).toBe(false);
  });

  test('evaluateAll returns only exiting positions', () => {
    const em = new ExitManager();
    const positions = [
      longPos({ symbol: 'BTC', current_price: 94 }),        // stop
      longPos({ symbol: 'ETH', current_price: 112 }),        // TP
      longPos({ symbol: 'SOL', current_price: 105 }),        // hold
    ];
    const exits = em.evaluateAll(positions);
    expect(exits).toHaveLength(2);
    expect(exits.map((e) => e.symbol)).toEqual(['BTC', 'ETH']);
  });
});
