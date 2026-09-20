/**
 * STORY-6.3: Max-Drawdown Circuit Breaker (Epic 6 — Risk Management)
 *
 * Portfolio-level max-drawdown guard: tracks the running peak of cumulative
 * portfolio equity and, when drawdown from that peak exceeds a configured
 * threshold (e.g. 15%), refuses new entries. The breaker gates TRADE
 * EXECUTION only — signal generation continues independently, producing
 * BUY/SELL/HOLD/NO_TRADE as before.
 *
 * Audit requirement (FR-603, audit §13): separate SIGNAL generation from
 * TRADE EXECUTION. The circuit breaker is an execution gate; it must never
 * suppress signal production. A clearly documented recovery path resets the
 * breaker when a new portfolio high is achieved.
 *
 * Governing principle: drawdown is computed deterministically from reported
 * equity and the running peak — never estimated or invented. Confidence is
 * evidence, not win probability.
 */

/** Tunable configuration for the drawdown circuit breaker. */
export interface DrawdownCircuitBreakerConfig {
  /** Max drawdown from peak, as a percentage (e.g. 15 for 15%). */
  max_drawdown_pct: number;
  /** Initial portfolio peak (highest equity seen so far). Default 0. */
  initial_peak: number;
}

export const DEFAULT_DRAWDOWN_CONFIG: DrawdownCircuitBreakerConfig = {
  max_drawdown_pct: 15,
  initial_peak: 0,
};

/** Structured output of a breaker check. */
export interface DrawdownCheckResult {
  /** Current drawdown from peak, as a percentage (0..100). */
  current_drawdown_pct: number;
  /** The configured maximum allowed drawdown percentage. */
  max_allowed: number;
  /** True when drawdown exceeds the threshold (new entries blocked). */
  breached: boolean;
  /** Human-readable rationale / audit trail. */
  message: string;
}

/**
 * DrawdownCircuitBreaker tracks the running portfolio peak and drawdown from
 * that peak. It gates new entries, not exits — existing positions continue to
 * their own TP/SL regardless of breaker state.
 */
export class DrawdownCircuitBreaker {
  private config: DrawdownCircuitBreakerConfig;
  /** Highest portfolio equity observed so far. */
  private peak: number;

  constructor(config: Partial<DrawdownCircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_DRAWDOWN_CONFIG, ...config };
    this.peak = this.config.initial_peak;
  }

  /** The current running peak (highest equity seen). */
  get currentPeak(): number {
    return this.peak;
  }

  /**
   * Update the breaker with the latest portfolio equity. If the new equity
   * exceeds the running peak, the peak is reset to that new high — which
   * resets drawdown to 0 (the documented recovery path).
   *
   * @param equity Current cumulative portfolio equity (must be > 0 to be meaningful).
   */
  update(equity: number): void {
    if (equity > this.peak) {
      this.peak = equity;
    }
  }

  /**
   * Compute the current drawdown from peak.
   *
   * @param equity Current portfolio equity.
   * @returns Drawdown percentage from peak (0 when at or above peak).
   */
  drawdownPct(equity: number): number {
    if (this.peak <= 0 || equity <= 0) return 0;
    if (equity >= this.peak) return 0;
    return ((this.peak - equity) / this.peak) * 100;
  }

  /**
   * Check whether new entries are currently permitted.
   *
   * This is an execution gate only. It does NOT affect signal generation:
   * the caller may still produce BUY/SELL/HOLD/NO_TRADE signals; a `breached`
   * result simply means no new position may be opened.
   *
   * @param equity Current portfolio equity.
   * @returns DrawdownCheckResult with `breached` true when new entries must stop.
   */
  canEnter(equity: number): DrawdownCheckResult {
    // Incorporate the latest equity into the running peak BEFORE checking, so
    // a new high naturally clears the breach (recovery path).
    this.update(equity);

    const drawdown = this.drawdownPct(equity);
    const maxAllowed = this.config.max_drawdown_pct;
    const breached = drawdown > maxAllowed;

    const message = breached
      ? `Drawdown ${drawdown.toFixed(2)}% exceeds max ${maxAllowed}% — new entries BLOCKED. ` +
        `Signals continue; execution gated until a new portfolio high resets the peak (current peak ${round(this.peak)}).`
      : `Drawdown ${drawdown.toFixed(2)}% within max ${maxAllowed}% — new entries permitted.`;

    return {
      current_drawdown_pct: round(drawdown),
      max_allowed: maxAllowed,
      breached,
      message,
    };
  }

  /**
   * Reset the breaker to a fresh peak (e.g. after manual intervention or a
   * confirmed new portfolio high). Drawdown returns to 0.
   *
   * @param newPeak Equity value to set as the new peak (default: unchanged).
   */
  reset(newPeak?: number): void {
    this.peak = newPeak !== undefined ? newPeak : this.peak;
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export default DrawdownCircuitBreaker;
