/**
 * ExitManager — position lifecycle (post-audit enhancement)
 *
 * Closes the last open gap from the legacy report: the strategy had "no exit
 * mechanism" (report finding #6/#7 — "no take-profit", "no stop-loss", and the
 * signal-reality mismatch where owned assets flipped to SELL but were never sold).
 *
 * The ATRRiskCalculator computes stops/take-profits; ExitManager *acts* on them.
 * Each cycle it evaluates every open position against:
 *   - stop-loss (entry - stopDistance)
 *   - cascaded take-profit (TP1 / TP2)
 *   - trailing stop (optional, profile-driven)
 *   - signal flip (a fresh SELL/exit signal on a long position)
 * and emits deterministic exit decisions with a logged reason.
 *
 * All logic is pure/deterministic — prices come from the caller. No network I/O.
 */

/** An open position under management. */
export interface ManagedPosition {
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  /** Current market price. */
  current_price: number;
  /** Stop-loss price (already computed by ATRRiskCalculator). */
  stop_loss: number;
  /** Take-profit levels (cascaded, computed by ATRRiskCalculator). */
  take_profits: Array<{ price: number; percent: number }>;
  /** Highest favorable price since entry (for trailing stop). */
  best_price?: number;
}

/** Reasons a position can exit. */
export type ExitReason =
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'TRAILING_STOP'
  | 'SIGNAL_FLIP'
  | 'DRAWDOWN'
  | 'MANUAL';

/** A single deterministic exit decision. */
export interface ExitDecision {
  symbol: string;
  exit: boolean;
  reason: ExitReason;
  /** Which take-profit level was hit (only for TAKE_PROFIT). */
  tp_index?: number;
  /** Fraction of the position to close (0..1). */
  close_fraction: number;
  rationale: string;
}

/** Config for the exit manager. */
export interface ExitManagerConfig {
  /** Trailing stop as a fraction of favorable move (0 = disabled). */
  trailing_stop_pct: number;
  /** Allow a signal-flip (fresh SELL on a long) to close the position. */
  allow_signal_flip_exit: boolean;
}

/** A fresh signal action for an owned symbol (for signal-flip detection). */
export type FreshSignalAction =
  | 'BUY' | 'STRONG_BUY' | 'WEAK_BUY'
  | 'SELL' | 'STRONG_SELL' | 'WEAK_SELL'
  | 'HOLD' | 'NO_TRADE' | 'INSUFFICIENT_DATA';

export class ExitManager {
  private config: ExitManagerConfig;

  constructor(config: Partial<ExitManagerConfig> = {}) {
    this.config = { trailing_stop_pct: 0.015, allow_signal_flip_exit: true, ...config };
  }

  /**
   * Evaluate one open position and produce an exit decision.
   *
   * @param position The open position.
   * @param freshAction The latest signal action for this symbol (for signal-flip).
   * @returns A deterministic ExitDecision.
   */
  evaluate(position: ManagedPosition, freshAction: FreshSignalAction = 'HOLD'): ExitDecision {
    const { entry_price, current_price, stop_loss, take_profits, side } = position;

    // --- Stop-loss ---
    if (side === 'long' && current_price <= stop_loss) {
      return {
        symbol: position.symbol,
        exit: true,
        reason: 'STOP_LOSS',
        close_fraction: 1,
        rationale: `price ${current_price} <= stop ${stop_loss} (entry ${entry_price})`,
      };
    }
    if (side === 'short' && current_price >= stop_loss) {
      return {
        symbol: position.symbol,
        exit: true,
        reason: 'STOP_LOSS',
        close_fraction: 1,
        rationale: `price ${current_price} >= stop ${stop_loss} (entry ${entry_price})`,
      };
    }

    // --- Cascaded take-profit (long: price >= TP; short: price <= TP) ---
    for (let i = 0; i < take_profits.length; i++) {
      const tp = take_profits[i];
      const hit = side === 'long' ? current_price >= tp.price : current_price <= tp.price;
      if (hit) {
        return {
          symbol: position.symbol,
          exit: true,
          reason: 'TAKE_PROFIT',
          tp_index: i,
          close_fraction: tp.percent,
          rationale: `take-profit ${i + 1} hit (price ${current_price} vs TP ${tp.price}, close ${(tp.percent * 100).toFixed(0)}%)`,
        };
      }
    }

    // --- Trailing stop ---
    if (this.config.trailing_stop_pct > 0) {
      const best = position.best_price ?? entry_price;
      const trailPrice = side === 'long'
        ? best * (1 - this.config.trailing_stop_pct)
        : best * (1 + this.config.trailing_stop_pct);
      const breached = side === 'long' ? current_price <= trailPrice : current_price >= trailPrice;
      if (breached) {
        return {
          symbol: position.symbol,
          exit: true,
          reason: 'TRAILING_STOP',
          close_fraction: 1,
          rationale: `trailing stop breached (price ${current_price} vs trail ${trailPrice.toFixed(4)})`,
        };
      }
    }

    // --- Signal flip (fresh SELL on a long, or BUY on a short) ---
    if (this.config.allow_signal_flip_exit) {
      const flip = side === 'long' ? freshAction === 'SELL' || freshAction === 'STRONG_SELL' || freshAction === 'WEAK_SELL'
        : freshAction === 'BUY' || freshAction === 'STRONG_BUY' || freshAction === 'WEAK_BUY';
      if (flip) {
        return {
          symbol: position.symbol,
          exit: true,
          reason: 'SIGNAL_FLIP',
          close_fraction: 1,
          rationale: `signal flipped to ${freshAction} on a ${side} position`,
        };
      }
    }

    // --- No exit ---
    return {
      symbol: position.symbol,
      exit: false,
      reason: 'MANUAL',
      close_fraction: 0,
      rationale: 'no exit condition met',
    };
  }

  /**
   * Evaluate a batch of positions and return only those that should exit.
   *
   * @param positions Open positions.
   * @param freshActions Map of symbol → latest action (optional).
   */
  evaluateAll(
    positions: ManagedPosition[],
    freshActions: Record<string, FreshSignalAction> = {},
  ): ExitDecision[] {
    return positions
      .map((p) => this.evaluate(p, freshActions[p.symbol] ?? 'HOLD'))
      .filter((d) => d.exit);
  }
}

export default ExitManager;
