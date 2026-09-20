/**
 * STORY-5.3: Wire Macro Data (Epic 5 — Data Source Remediation)
 *
 * Integrates macro indicators (DXY, S&P 500, Nasdaq, VIX, US 10-year yield,
 * Fed rate, inflation) and classifies the overall environment as RISK_ON /
 * NEUTRAL / RISK_OFF. The macro verdict (SUPPORT / CONTRADICT / NEUTRAL) gates
 * an existing crypto signal: a high-confidence signal that contradicts the
 * macro environment without strong justification has its confidence reduced.
 *
 * Audit requirement (FR-503, audit §C):
 *  - DXY, S&P 500, Nasdaq, VIX (daily), US 10Y yield, Fed rate, inflation
 *    fetched from verified sources.
 *  - Environment classified RISK_ON / NEUTRAL / RISK_OFF.
 *  - Classification: VIX < 15 AND S&P rising → RISK_ON; VIX > 20 OR S&P falling
 *    → RISK_OFF; otherwise NEUTRAL.
 *  - Crypto signals contradicting the macro environment reduce confidence by
 *    20–30% unless a strong justification is supplied.
 *
 * Design: the *analysis* logic (`analyzeMacro`) is pure and deterministic — it
 * takes already-fetched macro values plus a signal direction and computes the
 * environment + verdict with no network I/O and no invented data. The *fetch*
 * layer (axios to free public endpoints) is separated so it can be mocked in
 * tests. Quantitative inputs come from verified sources; this class never
 * fabricates VIX, yields, indices, or inflation figures. Missing inputs are
 * tagged MISSING and degrade the verdict rather than being guessed.
 */

import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/* ------------------------------------------------------------------ */
/* Types & contracts                                                   */
/* ------------------------------------------------------------------ */

/** The macro environment classification. */
export type MacroEnvironment = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';

/** The macro verdict relative to an existing crypto signal direction. */
export type MacroVerdict = 'SUPPORT' | 'CONTRADICT' | 'NEUTRAL';

/** Direction of a crypto signal being supported/contradicted. */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

/** Structured input to the deterministic analysis (null = missing). */
export interface MacroInput {
  /** US Dollar Index (DXY). null = missing. */
  dxy: number | null;
  /** CBOE Volatility Index (VIX). null = missing. */
  vix: number | null;
  /** S&P 500 index level (used to derive return %). null = missing. */
  sp500: number | null;
  /** S&P 500 prior close (for return %); if null, sp500 return is missing. */
  sp500_prev_close: number | null;
  /** Nasdaq Composite index level. null = missing. */
  nasdaq: number | null;
  /** US 10-year Treasury yield (percent, e.g. 4.2 = 4.2%). null = missing. */
  us10y_yield: number | null;
  /** Federal funds effective rate (percent). null = missing. */
  fed_rate: number | null;
  /** Annual inflation rate (percent). null = missing. */
  inflation_rate: number | null;
}

/** Structured output of the macro analysis. */
export interface MacroResult {
  /** RISK_ON / NEUTRAL / RISK_OFF. */
  macro_environment: MacroEnvironment;
  /** DXY value (null if missing). */
  dxy: number | null;
  /** VIX value (null if missing). */
  vix: number | null;
  /** S&P 500 return % over the lookback (null if missing). */
  sp500_return_pct: number | null;
  /** Yield block. */
  yields: { us10y: number | null; fed_rate: number | null };
  /** Annual inflation rate % (null if missing). */
  inflation_rate: number | null;
  /** SUPPORT / CONTRADICT / NEUTRAL relative to the signal direction. */
  verdict: MacroVerdict;
  /** Confidence reduction to apply when the signal contradicts the macro (0–30). */
  confidence_reduction: number;
  /** Human-readable chain of reasoning (deterministic). */
  evidence: string;
}

/** Tunable thresholds for the macro analysis. */
export interface MacroAnalyzerConfig {
  /** VIX below this (AND S&P rising) → RISK_ON. Default 15. */
  vix_risk_on_threshold: number;
  /** VIX above this → RISK_OFF. Default 20. */
  vix_risk_off_threshold: number;
  /** |S&P return| below this is treated as flat/noise (fraction). Default 0.005. */
  sp500_flat_threshold: number;
  /** DXY above this = strong dollar (crypto headwind). Default 104. */
  dxy_strong_threshold: number;
  /** Confidence reduction % when a high-confidence signal contradicts macro. Default 25. */
  contradiction_confidence_reduction: number;
  /** Minimum macro inputs present before a non-NEUTRAL environment is allowed. Default 2. */
  min_inputs_present: number;
}

export const DEFAULT_MACRO_CONFIG: MacroAnalyzerConfig = {
  vix_risk_on_threshold: 15,
  vix_risk_off_threshold: 20,
  sp500_flat_threshold: 0.005,
  dxy_strong_threshold: 104,
  contradiction_confidence_reduction: 25,
  min_inputs_present: 2,
};

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export class MacroAnalyzer {
  private config: MacroAnalyzerConfig;
  private baseUrl: string;
  private httpClient?: AxiosInstance;

  constructor(config: Partial<MacroAnalyzerConfig> = {}, baseUrl = 'https://query1.finance.yahoo.com') {
    this.config = { ...DEFAULT_MACRO_CONFIG, ...config };
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
   * Fetch the latest quote for a Yahoo Finance ticker and return the
   * regularMarketPrice (null on failure — never fabricated).
   */
  async fetchQuote(symbol: string): Promise<number | null> {
    try {
      const response = await this.getHttpClient().get('/v8/finance/chart/' + encodeURIComponent(symbol));
      const result = response.data?.chart?.result?.[0];
      const meta = result?.meta;
      const price = parseFloat(meta?.regularMarketPrice);
      return isFinite(price) ? price : null;
    } catch (error) {
      Logger.warn(`MacroAnalyzer.fetchQuote failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /**
   * Fetch the prior close for a ticker (used to derive a daily return %).
   * Returns null on failure — never fabricated.
   */
  async fetchPrevClose(symbol: string): Promise<number | null> {
    try {
      const response = await this.getHttpClient().get('/v8/finance/chart/' + encodeURIComponent(symbol));
      const meta = response.data?.chart?.result?.[0]?.meta;
      const prev = parseFloat(meta?.chartPreviousClose ?? meta?.previousClose);
      return isFinite(prev) ? prev : null;
    } catch (error) {
      Logger.warn(`MacroAnalyzer.fetchPrevClose failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /* ---------------------- Analysis layer ------------------------- */

  /**
   * Compute the macro environment and verdict from fetched macro values.
   *
   * Deterministic and network-free. Every quantitative input is supplied by the
   * caller. Classification follows the audit rule exactly:
   *   VIX < 15 AND S&P rising → RISK_ON
   *   VIX > 20 OR S&P falling  → RISK_OFF
   *   otherwise                → NEUTRAL
   *
   * A crypto signal whose direction contradicts the macro environment receives
   * a confidence reduction (default 25%) — the caller applies it to the signal.
   */
  analyzeMacro(input: MacroInput, direction: SignalDirection): MacroResult {
    const evidenceParts: string[] = [];
    const presentCount = [input.dxy, input.vix, input.sp500, input.us10y_yield, input.fed_rate, input.inflation_rate]
      .filter((v) => v !== null && isFinite(v as number)).length;

    const vix = input.vix !== null && isFinite(input.vix) ? input.vix : null;
    const dxy = input.dxy !== null && isFinite(input.dxy) ? input.dxy : null;

    // S&P return % (only computable with both close and prior close).
    let sp500Return: number | null = null;
    if (input.sp500 !== null && input.sp500_prev_close !== null && isFinite(input.sp500) && isFinite(input.sp500_prev_close) && input.sp500_prev_close > 0) {
      sp500Return = (input.sp500 - input.sp500_prev_close) / input.sp500_prev_close;
    }

    const us10y = input.us10y_yield !== null && isFinite(input.us10y_yield) ? input.us10y_yield : null;
    const fedRate = input.fed_rate !== null && isFinite(input.fed_rate) ? input.fed_rate : null;
    const inflation = input.inflation_rate !== null && isFinite(input.inflation_rate) ? input.inflation_rate : null;

    let environment: MacroEnvironment;
    let verdict: MacroVerdict = 'NEUTRAL';
    let confidenceReduction = 0;

    if (presentCount < this.config.min_inputs_present) {
      // Insufficient macro data → NEUTRAL environment, no reduction, transparent evidence.
      environment = 'NEUTRAL';
      evidenceParts.push(`only ${presentCount} macro inputs available — insufficient to classify environment`);
    } else if (vix === null || sp500Return === null) {
      // VIX and S&P return are the two required classification inputs.
      environment = 'NEUTRAL';
      evidenceParts.push('VIX or S&P return missing — cannot classify RISK_ON/RISK_OFF');
    } else if (vix < this.config.vix_risk_on_threshold && sp500Return > this.config.sp500_flat_threshold) {
      environment = 'RISK_ON';
      evidenceParts.push(`VIX ${vix.toFixed(1)} < ${this.config.vix_risk_on_threshold} AND S&P ${(sp500Return * 100).toFixed(2)}% rising → risk-on`);
    } else if (vix > this.config.vix_risk_off_threshold || sp500Return < -this.config.sp500_flat_threshold) {
      environment = 'RISK_OFF';
      const reasons: string[] = [];
      if (vix > this.config.vix_risk_off_threshold) reasons.push(`VIX ${vix.toFixed(1)} > ${this.config.vix_risk_off_threshold}`);
      if (sp500Return < -this.config.sp500_flat_threshold) reasons.push(`S&P ${(sp500Return * 100).toFixed(2)}% falling`);
      evidenceParts.push(`${reasons.join(' OR ')} → risk-off`);
    } else {
      environment = 'NEUTRAL';
      evidenceParts.push(`VIX ${vix.toFixed(1)} and S&P ${(sp500Return * 100).toFixed(2)}% mixed/choppy → neutral`);
    }

    // DXY adds a headwind/tailwind note (does not change the environment class).
    if (dxy !== null) {
      if (dxy >= this.config.dxy_strong_threshold) {
        evidenceParts.push(`DXY ${dxy.toFixed(1)} ≥ ${this.config.dxy_strong_threshold} → strong dollar (crypto headwind)`);
      } else {
        evidenceParts.push(`DXY ${dxy.toFixed(1)} → softer dollar (crypto tailwind)`);
      }
    }

    // Yield / inflation notes.
    if (us10y !== null) evidenceParts.push(`US 10Y ${us10y.toFixed(2)}%`);
    if (fedRate !== null) evidenceParts.push(`Fed rate ${fedRate.toFixed(2)}%`);
    if (inflation !== null) evidenceParts.push(`Inflation ${inflation.toFixed(2)}%`);

    // Verdict vs signal direction.
    if (direction === 'neutral') {
      verdict = 'NEUTRAL';
      evidenceParts.push('signal direction neutral — macro reported, no verdict');
    } else if (environment === 'NEUTRAL') {
      verdict = 'NEUTRAL';
      evidenceParts.push('macro environment neutral — does not support or contradict the signal');
    } else {
      const signalRiskOn = direction === 'bullish';
      const environmentRiskOn = environment === 'RISK_ON';
      if (signalRiskOn === environmentRiskOn) {
        verdict = 'SUPPORT';
        evidenceParts.push(`macro ${environment} supports ${direction} signal`);
      } else {
        verdict = 'CONTRADICT';
        confidenceReduction = this.config.contradiction_confidence_reduction;
        evidenceParts.push(
          `macro ${environment} contradicts ${direction} signal — confidence reduced ${confidenceReduction}% unless justified`,
        );
      }
    }

    // Transparent note when inputs are missing (never silent omission).
    const missing = [];
    if (dxy === null) missing.push('dxy');
    if (vix === null) missing.push('vix');
    if (sp500Return === null) missing.push('sp500_return');
    if (us10y === null) missing.push('us10y');
    if (fedRate === null) missing.push('fed_rate');
    if (inflation === null) missing.push('inflation');
    if (missing.length > 0) {
      evidenceParts.push(`${missing.length} missing (${missing.join(', ')})`);
    }

    return {
      macro_environment: environment,
      dxy,
      vix,
      sp500_return_pct: sp500Return !== null ? Math.round(sp500Return * 10000) / 100 : null,
      yields: { us10y: us10y, fed_rate: fedRate },
      inflation_rate: inflation,
      verdict,
      confidence_reduction: confidenceReduction,
      evidence: evidenceParts.join('; '),
    };
  }
}

export default MacroAnalyzer;
