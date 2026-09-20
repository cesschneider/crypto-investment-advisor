/**
 * STORY-5.2: Wire On-Chain Data (Epic 5 — Data Source Remediation)
 *
 * Integrates real on-chain metrics (exchange in/outflows, MVRV, SOPR,
 * stablecoin supply) and marks any unavailable dimension as MISSING rather
 * than fabricating a value. Produces an on-chain verdict (CONFIRMATION /
 * CONTRADICTION / NEUTRAL / MISSING) relative to an existing signal — never a
 * standalone trigger.
 *
 * Audit requirement (audit §C, §K):
 *  - Exchange in/outflows, MVRV, SOPR, stablecoin supply wired OR dimension
 *    marked MISSING.
 *  - Each on-chain signal tagged CONFIRMATION / EARLY_WARNING /
 *    REGIME_INDICATOR / PRIMARY_SIGNAL.
 *  - Empty on-chain methods removed or implemented.
 *  - No empty return presented as completed analysis.
 *
 * Design: the *analysis* logic (`analyzeOnChain`) is pure and deterministic —
 * it takes already-fetched on-chain metrics + a signal direction and computes
 * the verdict with no network I/O and no invented data. The *fetch* layer
 * (Glassnode-style metrics supplied by the caller, or a pluggable HTTP client)
 * is separated so it can be mocked in tests. Quantitative inputs come from
 * verified sources; this class never fabricates MVRV, SOPR, inflows, or
 * stablecoin supply figures. Missing inputs are tagged MISSING, never guessed.
 */

import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/* ------------------------------------------------------------------ */
/* Types & contracts                                                   */
/* ------------------------------------------------------------------ */

/** Role of an on-chain metric in the decision hierarchy. */
export type OnChainSignalRole =
  | 'CONFIRMATION'
  | 'EARLY_WARNING'
  | 'REGIME_INDICATOR'
  | 'PRIMARY_SIGNAL';

/** The on-chain verdict relative to an existing signal direction. */
export type OnChainVerdict = 'CONFIRMATION' | 'CONTRADICTION' | 'NEUTRAL' | 'MISSING';

/** Direction of a signal being corroborated/contradicted. */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

/** Structured input to the deterministic analysis (null = missing). */
export interface OnChainInput {
  /** Market Value to Realized Value ratio (null = missing). */
  mvrv: number | null;
  /** Spent Output Profit Ratio (null = missing). */
  sopr: number | null;
  /** Net exchange inflow (positive = inflow to exchanges, USD, null = missing). */
  exchange_netflow: number | null;
  /** Stablecoin total supply (USD, null = missing). */
  stablecoin_supply: number | null;
  /** Stablecoin supply change over lookback (fraction, null = missing). */
  stablecoin_supply_change_pct: number | null;
}

/** A single tagged on-chain signal. */
export interface OnChainSignal {
  metric: string;
  role: OnChainSignalRole;
  value: number | null;
  status: 'PRESENT' | 'MISSING';
  note: string;
}

/** Structured output of the on-chain analysis. */
export interface OnChainResult {
  /** CONFIRMATION / CONTRADICTION / NEUTRAL / MISSING. */
  onchain_verdict: OnChainVerdict;
  /** Per-metric tagged signals. */
  signals: OnChainSignal[];
  /** Count of metrics present (of 5). */
  present_count: number;
  /** Count of metrics missing (of 5). */
  missing_count: number;
  /** Human-readable chain of reasoning (deterministic). */
  evidence: string;
}

/** Tunable thresholds for the on-chain analysis. */
export interface OnChainAnalyzerConfig {
  /** MVRV >= this → overheated (distribution risk). Default 3.0. */
  mvrv_overheated: number;
  /** MVRV <= this → undervalued (accumulation opportunity). Default 1.0. */
  mvrv_undervalued: number;
  /** SOPR >= this → profit-taking pressure. Default 1.05. */
  sopr_profit_taking: number;
  /** SOPR <= this → capitulation. Default 0.95. */
  sopr_capitulation: number;
  /** Stablecoin supply change (fraction) above which = net inflow. Default 0.02. */
  stablecoin_inflow_threshold: number;
  /** Minimum metrics present before a non-MISSING verdict is allowed. Default 3. */
  min_metrics_present: number;
}

export const DEFAULT_ONCHAIN_CONFIG: OnChainAnalyzerConfig = {
  mvrv_overheated: 3.0,
  mvrv_undervalued: 1.0,
  sopr_profit_taking: 1.05,
  sopr_capitulation: 0.95,
  stablecoin_inflow_threshold: 0.02,
  min_metrics_present: 3,
};

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export class OnChainAnalyzer {
  private config: OnChainAnalyzerConfig;
  private httpClient?: AxiosInstance;
  private baseUrl: string;

  constructor(
    config: Partial<OnChainAnalyzerConfig> = {},
    baseUrl = 'https://api.glassnode.com',
  ) {
    this.config = { ...DEFAULT_ONCHAIN_CONFIG, ...config };
    this.baseUrl = baseUrl;
  }

  /* ------------------------- Fetch layer ------------------------- */

  /** Lazily create (or return) the HTTP client (mockable in tests). */
  private getHttpClient(): AxiosInstance {
    if (!this.httpClient) {
      this.httpClient = axios.create({ baseURL: this.baseUrl, timeout: 10000 });
    }
    return this.httpClient;
  }

  /** Allow tests to reset / inject the HTTP client. */
  resetHttpClient(): void {
    this.httpClient = undefined;
  }

  /**
   * Fetch a single on-chain metric from a metrics endpoint.
   * Returns null on failure or missing data — never fabricates.
   */
  async fetchMetric(path: string): Promise<number | null> {
    try {
      const response = await this.getHttpClient().get(path);
      const value = Array.isArray(response.data)
        ? response.data[response.data.length - 1]?.v
        : response.data?.v ?? response.data?.value;
      const parsed = parseFloat(value);
      return isFinite(parsed) ? parsed : null;
    } catch (error) {
      Logger.warn(`OnChainAnalyzer.fetchMetric failed for ${path}`, (error as Error).message);
      return null;
    }
  }

  /* ---------------------- Analysis layer ------------------------- */

  /**
   * Compute the on-chain verdict from fetched metrics + signal direction.
   *
   * Deterministic and network-free. Each metric is tagged with its role and a
   * PRESENT/MISSING status. If fewer than `min_metrics_present` metrics are
   * available, the verdict is MISSING — never a fabricated confirmation.
   */
  analyzeOnChain(input: OnChainInput, direction: SignalDirection): OnChainResult {
    const signals: OnChainSignal[] = [];
    let bullish = 0;
    let bearish = 0;

    const present = (metric: string, value: number | null): boolean =>
      value !== null && isFinite(value);

    // MVRV — regime/valuation indicator
    if (present('mvrv', input.mvrv)) {
      const v = input.mvrv!;
      if (v >= this.config.mvrv_overheated) {
        signals.push({ metric: 'mvrv', role: 'REGIME_INDICATOR', value: v, status: 'PRESENT', note: `MVRV ${v} overheated → distribution risk` });
        bearish++;
      } else if (v <= this.config.mvrv_undervalued) {
        signals.push({ metric: 'mvrv', role: 'REGIME_INDICATOR', value: v, status: 'PRESENT', note: `MVRV ${v} undervalued → accumulation opportunity` });
        bullish++;
      } else {
        signals.push({ metric: 'mvrv', role: 'REGIME_INDICATOR', value: v, status: 'PRESENT', note: `MVRV ${v} neutral valuation` });
      }
    } else {
      signals.push({ metric: 'mvrv', role: 'REGIME_INDICATOR', value: null, status: 'MISSING', note: 'MVRV not available' });
    }

    // SOPR — early warning of profit-taking / capitulation
    if (present('sopr', input.sopr)) {
      const v = input.sopr!;
      if (v >= this.config.sopr_profit_taking) {
        signals.push({ metric: 'sopr', role: 'EARLY_WARNING', value: v, status: 'PRESENT', note: `SOPR ${v} → profit-taking pressure` });
        bearish++;
      } else if (v <= this.config.sopr_capitulation) {
        signals.push({ metric: 'sopr', role: 'EARLY_WARNING', value: v, status: 'PRESENT', note: `SOPR ${v} → capitulation / seller exhaustion` });
        bullish++;
      } else {
        signals.push({ metric: 'sopr', role: 'EARLY_WARNING', value: v, status: 'PRESENT', note: `SOPR ${v} neutral` });
      }
    } else {
      signals.push({ metric: 'sopr', role: 'EARLY_WARNING', value: null, status: 'MISSING', note: 'SOPR not available' });
    }

    // Exchange netflow — confirmation (inflow = bearish, outflow = bullish)
    if (present('exchange_netflow', input.exchange_netflow)) {
      const v = input.exchange_netflow!;
      if (v > 0) {
        signals.push({ metric: 'exchange_netflow', role: 'CONFIRMATION', value: v, status: 'PRESENT', note: `Net inflow $${v} → selling pressure (bearish)` });
        bearish++;
      } else if (v < 0) {
        signals.push({ metric: 'exchange_netflow', role: 'CONFIRMATION', value: v, status: 'PRESENT', note: `Net outflow $${Math.abs(v)} → accumulation (bullish)` });
        bullish++;
      } else {
        signals.push({ metric: 'exchange_netflow', role: 'CONFIRMATION', value: v, status: 'PRESENT', note: 'Net flow neutral' });
      }
    } else {
      signals.push({ metric: 'exchange_netflow', role: 'CONFIRMATION', value: null, status: 'MISSING', note: 'Exchange netflow not available' });
    }

    // Stablecoin supply — primary signal (rising supply = dry powder)
    if (present('stablecoin_supply', input.stablecoin_supply)) {
      signals.push({ metric: 'stablecoin_supply', role: 'PRIMARY_SIGNAL', value: input.stablecoin_supply, status: 'PRESENT', note: `Stablecoin supply $${input.stablecoin_supply}` });
    } else {
      signals.push({ metric: 'stablecoin_supply', role: 'PRIMARY_SIGNAL', value: null, status: 'MISSING', note: 'Stablecoin supply not available' });
    }

    // Stablecoin supply change — direction of dry powder
    if (present('stablecoin_supply_change_pct', input.stablecoin_supply_change_pct)) {
      const v = input.stablecoin_supply_change_pct!;
      if (v >= this.config.stablecoin_inflow_threshold) {
        signals.push({ metric: 'stablecoin_supply_change_pct', role: 'PRIMARY_SIGNAL', value: v, status: 'PRESENT', note: `Stablecoin supply +${(v * 100).toFixed(1)}% → growing dry powder (bullish)` });
        bullish++;
      } else if (v <= -this.config.stablecoin_inflow_threshold) {
        signals.push({ metric: 'stablecoin_supply_change_pct', role: 'PRIMARY_SIGNAL', value: v, status: 'PRESENT', note: `Stablecoin supply ${(v * 100).toFixed(1)}% → shrinking dry powder (bearish)` });
        bearish++;
      } else {
        signals.push({ metric: 'stablecoin_supply_change_pct', role: 'PRIMARY_SIGNAL', value: v, status: 'PRESENT', note: 'Stablecoin supply flat' });
      }
    } else {
      signals.push({ metric: 'stablecoin_supply_change_pct', role: 'PRIMARY_SIGNAL', value: null, status: 'MISSING', note: 'Stablecoin supply change not available' });
    }

    const presentCount = signals.filter((s) => s.status === 'PRESENT').length;
    const missingCount = signals.length - presentCount;

    let verdict: OnChainVerdict;
    let evidenceParts: string[] = [];

    if (presentCount < this.config.min_metrics_present) {
      verdict = 'MISSING';
      evidenceParts.push(`only ${presentCount}/${signals.length} on-chain metrics available — insufficient to judge`);
    } else if (direction === 'neutral') {
      verdict = 'NEUTRAL';
      evidenceParts.push('signal direction neutral — on-chain metrics reported, no verdict');
    } else if (bullish === bearish) {
      verdict = 'NEUTRAL';
      evidenceParts.push('on-chain signals balanced (mixed evidence)');
    } else if (direction === 'bullish' && bullish > bearish) {
      verdict = 'CONFIRMATION';
      evidenceParts.push('on-chain metrics corroborate bullish signal');
    } else if (direction === 'bearish' && bearish > bullish) {
      verdict = 'CONFIRMATION';
      evidenceParts.push('on-chain metrics corroborate bearish signal');
    } else {
      verdict = 'CONTRADICTION';
      evidenceParts.push('on-chain metrics contradict the signal direction');
    }

    // Append missing-metric note for transparency (never silent omission).
    if (missingCount > 0) {
      const missingNames = signals.filter((s) => s.status === 'MISSING').map((s) => s.metric).join(', ');
      evidenceParts.push(`${missingCount} missing (${missingNames})`);
    }

    return {
      onchain_verdict: verdict,
      signals,
      present_count: presentCount,
      missing_count: missingCount,
      evidence: evidenceParts.join('; '),
    };
  }
}

export default OnChainAnalyzer;
