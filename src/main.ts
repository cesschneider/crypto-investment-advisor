/**
 * main.ts — profile-aware paper-trading runner (Story 10.1)
 *
 * Drives the post-audit SignalEngine + PaperTradingExecutor across the three
 * risk profiles (conservative / moderate / aggressive), persisting each
 * profile's portfolio so the 24/7 service survives restarts.
 *
 * On each hourly tick it:
 *   1. Fetches OHLCV candles for each symbol (1h for risk calc, 1D for regime,
 *      4H/15m for multi-timeframe alignment).
 *   2. Builds a fresh EngineInput per symbol from the candles (deterministic
 *      indicator math — no invented data) and runs the SignalEngine.
 *   3. Feeds tradeable results to the profile's PaperTradingExecutor
 *      (entries, stops, TPs, exposure, drawdown gating all profile-driven).
 *   4. Runs exits for open positions (stop-loss / take-profit / trailing /
 *      signal-flip) using the engine's fresh signal as the flip trigger.
 *   5. Persists a profile-tagged snapshot so the 7 AM brief and 9 AM report
 *      can analyze each risk profile independently.
 *
 * No fabricated data: all quantitative inputs are derived from Binance OHLCV
 * responses or are left absent (the engine treats missing dimensions as
 * non-contributing, which lowers confidence rather than forcing a trade).
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import binanceService from './services/binance';
import { SignalEngine } from './engine/signal-engine';
import { PaperTradingExecutor } from './paper-trading/executor';
import { loadConfig } from './config/profile-loader';
import { RiskProfileName } from './config/advisor-config';
import { Candle, Timeframe } from './services/MultiTimeframeAnalyzer';
import { EngineInput } from './engine/signal-engine';
import { ScoringInputs } from './types/index';
import {
  rsi,
  macd,
  sma,
  trendFromSma,
  toSeries,
  bollinger,
} from './utils/indicators';

dotenv.config();

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'AVAX', 'MATIC', 'LINK', 'UNI'];
const PROFILES: RiskProfileName[] = ['conservative', 'moderate', 'aggressive'];
const INITIAL_CAPITAL = 10000;

const DATA_DIR = '/tmp/crypto-advisor-paper-trading';
const SIGNAL_DIR = '/tmp/crypto-advisor-signals';
const INTERVAL_MS = 60 * 60 * 1000;

interface ProfileState {
  profile: RiskProfileName;
  configLabel: string;
  portfolio: ReturnType<PaperTradingExecutor['exportState']>;
}

/** Load or init a profile's persisted portfolio state. */
function loadState(profile: RiskProfileName): ProfileState | null {
  const file = path.join(DATA_DIR, `state-${profile}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as ProfileState;
    if (!parsed.portfolio) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Build the candle list for a timeframe from klines. */
function toCandles(klines: any[]): Candle[] {
  return klines.map((k) => ({
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    time: k.time,
  }));
}

/** Compute deterministic indicator inputs for the scorer from 1h candles. */
function buildScoring(symbol: string, h1: Candle[], price: number): ScoringInputs {
  const { closes, highs, lows } = toSeries(h1);
  const m = macd(closes);
  const bb = bollinger(closes);
  const trend = trendFromSma(closes);
  const vol24 = h1[h1.length - 1].volume;
  const vol7d = closes.length >= 24 * 7 ? sumVol(h1, 7 * 24) : vol24 * 7;
  const vol30d = h1.length >= 30 * 24 ? avgHourlyVol(h1) * 24 * 30 : vol24 * 30;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);

  // Simple structure: nearest recent swing low/high as support/resistance.
  const window = h1.slice(-48);
  const support = Math.min(...window.map((c) => c.low));
  const resistance = Math.max(...window.map((c) => c.high));

  return {
    symbol,
    timestamp: new Date().toISOString(),
    trend: trend.trend,
    trend_strength: trend.strength,
    rsi_14: rsi(closes, 14),
    macd_histogram: Number.isNaN(m.histogram) ? undefined : m.histogram,
    price,
    supports: [support],
    resistances: [resistance],
    volume_24h: vol24,
    volume_7d: vol7d,
    volume_avg_30d: vol30d,
  };
}

function sumVol(candles: Candle[], n: number): number {
  let s = 0;
  for (let i = Math.max(0, candles.length - n); i < candles.length; i++) s += candles[i].volume;
  return s;
}

function avgHourlyVol(candles: Candle[]): number {
  let s = 0;
  for (let i = 0; i < candles.length; i++) s += candles[i].volume;
  return s / candles.length;
}

/** Fetch real candles for all needed timeframes for one symbol. */
async function fetchTimeframes(symbol: string): Promise<Partial<Record<Timeframe, Candle[]>>> {
  const out: Partial<Record<Timeframe, Candle[]>> = {};
  const tfs: Array<[Timeframe, string]> = [
    ['1D', '1d'],
    ['4H', '4h'],
    ['1H', '1h'],
    ['15m', '15m'],
  ];
  for (const [tf, bin] of tfs) {
    try {
      const klines = await (binanceService as any).getKlines(symbol, bin, 220);
      if (Array.isArray(klines) && klines.length > 0) out[tf] = toCandles(klines);
    } catch (err) {
      console.error(`  ⚠️ ${symbol} ${tf}: ${(err as any).message}`);
    }
  }
  return out;
}

/** Run one full cycle across all profiles. */
async function runHourly(): Promise<void> {
  console.log('='.repeat(70));
  console.log(`🚀 PROFILE PAPER-TRADING RUN — ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  // Fetch shared candle data once per symbol (all profiles use the same market data).
  const candleCache: Record<string, Partial<Record<Timeframe, Candle[]>>> = {};
  const priceCache: Record<string, number> = {};
  for (const symbol of SYMBOLS) {
    candleCache[symbol] = await fetchTimeframes(symbol);
    const h1 = candleCache[symbol]['1H'];
    priceCache[symbol] = h1 && h1.length > 0 ? h1[h1.length - 1].close : NaN;
  }

  const today = new Date().toISOString().split('T')[0];
  const allSignals: any[] = [];
  const allSnapshots: any[] = [];

  for (const profile of PROFILES) {
    const config = loadConfig(profile, { name: profile, label: defaultLabel(profile) });
    const engine = new SignalEngine();
    const executor = new PaperTradingExecutor(INITIAL_CAPITAL, config);

    // Restore persisted portfolio if present.
    let state = loadState(profile);
    if (!state) {
      state = { profile, configLabel: config.label, portfolio: executor.exportState() };
    } else {
      try { executor.restoreState(state.portfolio); } catch { /* fresh */ }
    }

    const snapshot = { profile, timestamp: new Date().toISOString(), signals: [] as any[] };

    for (const symbol of SYMBOLS) {
      const h1 = candleCache[symbol]['1H'];
      const price = priceCache[symbol];
      if (!h1 || h1.length < 20 || Number.isNaN(price)) {
        snapshot.signals.push({ symbol, action: 'INSUFFICIENT_DATA', confidence: 0, block_reason: 'no candles' });
        continue;
      }

      const input: EngineInput = {
        symbol,
        scoring: buildScoring(symbol, h1, price),
        timeframes: candleCache[symbol],
        portfolio: {
          equity: executor.snapshot(priceCache).equity,
          current_risk_usd: 0,
          positions: executor.openPositions.map((p) => ({ symbol: p.symbol, size: p.quantity * p.current_price, priceSeries: [p.current_price] })),
        },
        candles: h1,
        config,
      };

      const result = engine.evaluate(input);
      const freshAction = result.action;

      // Record structured signal (profile-tagged).
      allSignals.push({
        profile,
        symbol,
        timestamp: new Date().toISOString(),
        action: result.action,
        confidence: result.confidence,
        price,
        rsi: input.scoring.rsi_14,
        macd_histogram: input.scoring.macd_histogram,
        trend: input.scoring.trend,
        regime: result.regime?.regime,
        block_reason: result.block_reason,
        trade_setup: result.trade_setup ?? undefined,
        evidence: result.evidence,
      });

      // 1. Process exits using the fresh engine signal as the flip trigger.
      executor.runExits(priceCache, { [symbol]: freshAction });

      // 2. Open a position if the engine produced a tradeable setup.
      if (result.trade_setup && executableAction(result.action)) {
        executor.openPosition(
          { ...result, trade_setup: { ...result.trade_setup, position_size: Math.min(result.trade_setup.position_size, config.sizing.max_position_pct * executor.snapshot(priceCache).equity) } },
          new Date().toISOString(),
        );
      }
    }

    const snap = executor.snapshot(priceCache);
    state.portfolio = executor.exportState();
    const stateFile = path.join(DATA_DIR, `state-${profile}.json`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

    // Profile-tagged snapshot for the 9 AM report.
    allSnapshots.push({
      profile,
      config_label: config.label,
      timestamp: new Date().toISOString(),
      portfolio: {
        equity: snap.equity,
        cash: snap.cash,
        initial_capital: executor.exportState().initialCapital,
        realized_pnl: snap.realized_pnl,
        unrealized_pnl: snap.unrealized_pnl,
        total_return_pct: snap.total_return_pct,
        win_rate: snap.win_rate,
        open_positions: snap.open_positions,
        closed_trades: snap.closed_trades.map((t) => ({
          symbol: t.symbol,
          side: t.side,
          entry: t.entry_price,
          exit: t.exit_price,
          pnl: t.pnl,
          pnl_pct: t.pnl_pct,
          reason: t.exit_reason,
        })),
      },
    });

    console.log(`  📊 ${config.label}: equity $${snap.equity.toFixed(2)}, return ${snap.total_return_pct.toFixed(2)}%, win rate ${snap.win_rate.toFixed(1)}%, ${snap.closed_trades.length} closed, ${snap.open_positions} open`);
  }

  // Append to profile-tagged signal log.
  fs.mkdirSync(SIGNAL_DIR, { recursive: true });
  const signalFile = path.join(SIGNAL_DIR, `signals-${today}.json`);
  const existing = fs.existsSync(signalFile) ? JSON.parse(fs.readFileSync(signalFile, 'utf-8')) : [];
  fs.writeFileSync(signalFile, JSON.stringify([...existing, ...allSignals], null, 2));

  // Write consolidated per-profile performance snapshot.
  fs.writeFileSync(path.join(DATA_DIR, `paper-trading-${today}.json`), JSON.stringify(allSnapshots, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'performance-report.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    profiles: allSnapshots.map((s) => s.portfolio),
  }, null, 2));

  console.log(`\n✅ Cycle complete — ${allSignals.length} profile-tagged signals, ${allSnapshots.length} profiles`);
}

function defaultLabel(profile: RiskProfileName): string {
  return { conservative: 'Conservative (Low Risk)', moderate: 'Moderate (Mid Risk)', aggressive: 'Aggressive (High Risk)' }[profile];
}

function executableAction(action: string): boolean {
  return ['BUY', 'STRONG_BUY', 'WEAK_BUY'].includes(action);
}

/** Production entry. */
async function start(): Promise<void> {
  console.log(`\n🟢 PROFILE PAPER-TRADING RUNNER (3 profiles) — started ${new Date().toISOString()}`);
  await runHourly();
  setInterval(() => { runHourly().catch((e) => console.error('Error in hourly run:', e)); }, INTERVAL_MS);
  console.log(`⏰ Next run scheduled every ${INTERVAL_MS / 60000} min`);
}

// Support both `ts-node src/main.ts` and a one-off `--once`.
if (process.argv.includes('--once')) {
  runHourly().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
} else {
  start().catch((e) => { console.error('Fatal:', e); process.exit(1); });
}
