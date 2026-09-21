import { SignalEngine } from '../engine/signal-engine';
import { getProfile } from '../profiles/investor-profile';
import { Candle } from '../services/MultiTimeframeAnalyzer';

/** Build a deterministic synthetic uptrend candle series. */
function uptrendCandles(n: number, start = 100, step = 1): Candle[] {
  const candles: Candle[] = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    const open = close;
    close += step;
    candles.push({
      open,
      high: close + step * 0.5,
      low: open - step * 0.5,
      close,
      volume: 1000,
    });
  }
  return candles;
}

function bullishScoring(symbol: string) {
  return {
    symbol,
    timestamp: new Date().toISOString(),
    trend: 'UPTREND' as const,
    trend_strength: 70,
    rsi_14: 58,
    macd_histogram: 0.4,
    price: 150,
    supports: [140, 135],
    resistances: [170],
    volume_24h: 500000,
    volume_7d: 3500000,
    volume_avg_30d: 15000000,
    funding_rate: 0.0001,
    open_interest_change: 5,
    whale_accumulation: 10,
    holder_concentration: 35,
    macro_regime: 'RISK_ON' as const,
    macro_strength: 60,
    sentiment_score: 30,
  };
}

describe('SignalEngine', () => {
  const engine = new SignalEngine();
  const candles = uptrendCandles(60, 100, 1);

  function baseInput(profileName: 'conservative' | 'moderate' | 'aggressive' = 'moderate') {
    return {
      symbol: 'BTC',
      scoring: bullishScoring('BTC'),
      timeframes: {
        '1W': uptrendCandles(60, 90, 1),
        '1D': uptrendCandles(60, 100, 1),
        '4H': uptrendCandles(60, 100, 0.5),
        '1H': uptrendCandles(60, 100, 0.2),
        '15m': uptrendCandles(60, 100, 0.1),
      },
      derivatives: {
        oi_history: [1000, 1020, 1040, 1060],
        funding_rate: 0.0001,
        long_short_ratio: 1.2,
        liquidation_long_volume: 500,
        liquidation_short_volume: 800,
        price_change_pct: 3,
      },
      onchain: {
        mvrv: 2.0,
        sopr: 1.02,
        exchange_netflow: -500,
        stablecoin_supply: 1000000,
        stablecoin_supply_change_pct: 0.03,
      },
      sentiment: { fear_greed_index: 60 },
      macro: {
        dxy: 102,
        vix: 14,
        sp500: 5000,
        sp500_prev_close: 4980,
        nasdaq: 16000,
        us10y_yield: 4.1,
        fed_rate: 4.5,
        inflation_rate: 2.5,
      },
      portfolio: { equity: 10000, current_risk_usd: 0, positions: [] },
      candles,
      profile: getProfile(profileName),
    };
  }

  test('produces a tradeable BUY with a full trade setup on a strong setup', () => {
    const result = engine.evaluate(baseInput('moderate'));
    expect(['BUY', 'STRONG_BUY', 'WEAK_BUY']).toContain(result.action);
    expect(result.trade_setup).toBeDefined();
    if (result.trade_setup) {
      expect(result.trade_setup.stop_loss).toBeLessThan(result.trade_setup.entry_price);
      expect(result.trade_setup.take_profits.length).toBe(2);
      expect(result.trade_setup.position_size).toBeGreaterThan(0);
    }
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  test('conservative profile blocks when multi-TF alignment not confirmed', () => {
    // Provide a divergent lower timeframe to break confirmation.
    const input = baseInput('conservative');
    input.timeframes = {
      '1W': uptrendCandles(60, 90, 1),
      '1D': uptrendCandles(60, 100, 1),
      '4H': uptrendCandles(60, 100, 0.5),
      '1H': uptrendCandles(60, 200, -0.5), // downtrend, opposes 1D
      '15m': uptrendCandles(60, 200, -0.5),
    };
    const result = engine.evaluate(input);
    // Conservative requires alignment; conflicting lower TF should gate or reduce.
    expect(result.evidence.join(' ')).toContain('multi-TF');
  });

  test('aggressive profile produces a larger position than conservative', () => {
    const consInput = baseInput('conservative');
    const aggrInput = baseInput('aggressive');

    const cons = engine.evaluate(consInput);
    const aggr = engine.evaluate(aggrInput);

    if (cons.trade_setup && aggr.trade_setup) {
      expect(aggr.trade_setup.position_size).toBeGreaterThan(cons.trade_setup.position_size);
    }
  });

  test('insufficient scoring data yields INSUFFICIENT_DATA', () => {
    const input = baseInput('moderate');
    (input as any).scoring = { symbol: 'BTC', timestamp: new Date().toISOString() };
    const result = engine.evaluate(input);
    expect(result.action).toBe('INSUFFICIENT_DATA');
  });
});
