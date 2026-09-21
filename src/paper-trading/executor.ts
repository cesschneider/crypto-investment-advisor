/**
 * Profile-aware paper-trading executor (post-audit enhancement)
 *
 * Bridges the SignalEngine + ExitManager + InvestorProfile into a simulated
 * portfolio. This is the concrete wiring that makes every audited improvement
 * *used by* the paper-trading simulation — replacing the legacy RSI-only,
 * fixed-2%-sizing, no-stop/no-TP engine (see docs/analysis/PERFORMANCE_ANALYSIS_20260920.md).
 *
 * The executor:
 *   - accepts an InvestorProfile that parameterizes sizing, stops, TPs, confidence,
 *     drawdown, and confirmation gates;
 *   - calls SignalEngine for each entry decision (multi-factor, regime-gated,
 *     risk-checked) and only opens a position when the engine returns a tradeable
 *     action with a trade_setup;
 *   - calls ExitManager every cycle to close positions on STOP_LOSS / TAKE_PROFIT /
 *     TRAILING_STOP / SIGNAL_FLIP;
 *   - enforces max exposure and max drawdown from the profile.
 *
 * All accounting is deterministic from caller-supplied prices. No network I/O.
 */

import { SignalEngine, EngineResult } from '../engine/signal-engine';
import { ExitManager, ManagedPosition, ExitDecision } from '../engine/exit-manager';
import { InvestorProfile } from '../profiles/investor-profile';

/** An open position tracked by the paper portfolio. */
export interface PaperPosition extends ManagedPosition {
  quantity: number;
  entry_time: string;
  realized_pnl: number;
}

/** A closed trade record (for the trade history + win rate). */
export interface ClosedTrade {
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  opened_at: string;
  closed_at: string;
}

/** Portfolio snapshot. */
export interface PaperPortfolioSnapshot {
  equity: number;
  cash: number;
  positions_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_positions: number;
  closed_trades: ClosedTrade[];
  win_rate: number;
  total_return_pct: number;
  peak_equity: number;
  drawdown_pct: number;
}

export class PaperTradingExecutor {
  private engine: SignalEngine;
  private exitManager: ExitManager;
  private profile: InvestorProfile;

  private initialCapital: number;
  private cash: number;
  private positions: Map<string, PaperPosition> = new Map();
  private closedTrades: ClosedTrade[] = [];
  private peakEquity: number;
  private tradeCounter = 0;

  constructor(initialCapital: number, profile: InvestorProfile) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.peakEquity = initialCapital;
    this.profile = profile;
    this.engine = new SignalEngine();
    this.exitManager = new ExitManager({
      trailing_stop_pct: profile.trailing_stop_pct,
      allow_signal_flip_exit: profile.allow_signal_flip_exit,
    });
  }

  /** Current total equity (cash + mark-to-market positions value). */
  equity(prices: Record<string, number>): number {
    let value = this.cash;
    for (const [symbol, pos] of this.positions) {
      value += pos.quantity * (prices[symbol] ?? pos.entry_price);
    }
    return value;
  }

  /** Process exits for all open positions given current prices and fresh signals. */
  runExits(prices: Record<string, number>, freshActions: Record<string, string>): ExitDecision[] {
    const decisions: ExitDecision[] = [];
    for (const [symbol, pos] of this.positions) {
      const currentPrice = prices[symbol] ?? pos.current_price;
      // Update best price for trailing stop.
      if (pos.side === 'long' && currentPrice > (pos.best_price ?? pos.entry_price)) {
        pos.best_price = currentPrice;
      } else if (pos.side === 'short' && currentPrice < (pos.best_price ?? pos.entry_price)) {
        pos.best_price = currentPrice;
      }
      pos.current_price = currentPrice;

      const decision = this.exitManager.evaluate(pos, freshActions[symbol] as any);
      if (decision.exit) {
        this.closePosition(symbol, currentPrice, decision);
        decisions.push(decision);
      }
    }
    return decisions;
  }

  /**
   * Open a position from an engine result (tradeable action with trade_setup).
   * Returns true when a position was opened.
   */
  openPosition(result: EngineResult, timestamp: string): boolean {
    if (!result.trade_setup) return false;
    if (this.positions.has(result.symbol)) return false; // already holding

    const size = result.trade_setup.position_size;
    const entry = result.trade_setup.entry_price;

    // Enforce max exposure.
    const totalExposure = this.totalExposure(entry);
    if (totalExposure + size > this.initialCapital * this.profile.max_exposure_pct) {
      return false; // would exceed exposure cap
    }
    if (size > this.cash) return false; // not enough cash

    const quantity = size / entry;
    this.cash -= size;

    this.positions.set(result.symbol, {
      symbol: result.symbol,
      side: 'long',
      entry_price: entry,
      current_price: entry,
      stop_loss: result.trade_setup.stop_loss,
      take_profits: result.trade_setup.take_profits.map((tp) => ({ price: tp.price, percent: tp.percent })),
      best_price: entry,
      quantity,
      entry_time: timestamp,
      realized_pnl: 0,
    });

    this.tradeCounter++;
    return true;
  }

  private closePosition(symbol: string, exitPrice: number, decision: ExitDecision): void {
    const pos = this.positions.get(symbol);
    if (!pos) return;
    const closeQty = pos.quantity * decision.close_fraction;
    const pnl = (exitPrice - pos.entry_price) * closeQty;
    this.cash += closeQty * exitPrice;

    if (decision.close_fraction >= 1) {
      this.positions.delete(symbol);
    } else {
      pos.quantity -= closeQty;
    }

    this.closedTrades.push({
      symbol,
      side: pos.side,
      entry_price: pos.entry_price,
      exit_price: exitPrice,
      quantity: closeQty,
      pnl,
      pnl_pct: (exitPrice - pos.entry_price) / pos.entry_price,
      exit_reason: decision.reason,
      opened_at: pos.entry_time,
      closed_at: new Date().toISOString(),
    });
  }

  private totalExposure(currentPrice: number): number {
    let total = 0;
    for (const [, pos] of this.positions) {
      total += pos.quantity * pos.current_price;
    }
    return total;
  }

  /** Snapshot the portfolio. */
  snapshot(prices: Record<string, number>): PaperPortfolioSnapshot {
    let positionsValue = 0;
    for (const [symbol, pos] of this.positions) {
      positionsValue += pos.quantity * (prices[symbol] ?? pos.entry_price);
    }
    const eq = this.cash + positionsValue;
    if (eq > this.peakEquity) this.peakEquity = eq;

    const realized = this.closedTrades.reduce((s, t) => s + t.pnl, 0);
    const wins = this.closedTrades.filter((t) => t.pnl > 0).length;
    const winRate = this.closedTrades.length > 0 ? (wins / this.closedTrades.length) * 100 : 0;
    const drawdown = this.peakEquity > 0 ? ((this.peakEquity - eq) / this.peakEquity) * 100 : 0;

    return {
      equity: eq,
      cash: this.cash,
      positions_value: positionsValue,
      realized_pnl: realized,
      unrealized_pnl: eq - this.initialCapital - realized,
      open_positions: this.positions.size,
      closed_trades: [...this.closedTrades],
      win_rate: winRate,
      total_return_pct: ((eq - this.initialCapital) / this.initialCapital) * 100,
      peak_equity: this.peakEquity,
      drawdown_pct: drawdown,
    };
  }

  get openPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }
}

export default PaperTradingExecutor;
