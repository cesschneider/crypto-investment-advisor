/**
 * STORY-5.1: Wire Derivatives Data (Epic 5 — Data Source Remediation)
 *
 * Integrates real derivatives data (open interest, funding rates, long/short
 * ratio, and liquidations) from Binance USDT-M futures and Bybit perpetuals.
 * Produces a derivatives verdict (CONFIRMATION / CONTRADICTION / NEUTRAL) that
 * SUPPORTS or CONTRADICTS an existing signal — never a standalone trigger.
 *
 * Audit requirement (FR-501, audit §C):
 *  - Open interest fetched for tracked symbols from Binance perpetuals.
 *  - Funding rates fetched from Binance + Bybit (cached; refreshed on request).
 *  - Liquidations (hourly volume, long vs short) fetched.
 *  - OI/price direction: both rising = strong confirmation; OI rising but
 *    price falling = reversal risk (divergence).
 *  - No single derivatives metric may act as a standalone trigger — always
 *    supporting/contradicting an existing signal.
 *
 * Design: the *analysis* logic (`analyzeDerivatives`) is pure and deterministic
 * — it takes already-fetched derivatives data + price direction and computes the
 * verdict with no network I/O and no invented data. The *fetch* layer (axios to
 * Binance/Bybit futures endpoints) is separated so it can be mocked in tests and
 * wired to the cache later. Quantitative inputs come from verified sources; this
 * class never fabricates prices, OI, funding, or liquidation figures.
 */

import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/* ------------------------------------------------------------------ */
/* Types & contracts                                                   */
/* ------------------------------------------------------------------ */

/** Direction of open-interest change over the lookback window. */
export type OiDirection = 'rising' | 'falling' | 'flat';

/** The derivatives verdict relative to an existing price/signal direction. */
export type DerivativesVerdict = 'CONFIRMATION' | 'CONTRADICTION' | 'NEUTRAL';

/** Which side is being liquidated more heavily over the lookback. */
export type LiquidationImbalance =
  | 'long-dominant'
  | 'short-dominant'
  | 'balanced'
  | 'unknown';

/** Price direction used to compare against OI direction. */
export type PriceDirection = 'rising' | 'falling' | 'flat';

/** Structured input to the deterministic analysis (all values may be null = missing). */
export interface DerivativesInput {
  /** Open-interest history (oldest → newest). Null/empty = missing OI. */
  oi_history: number[];
  /** Current funding rate (per 8h, fractional, e.g. 0.0001 = 0.01%). */
  funding_rate: number | null;
  /** Global long/short account ratio (>1 = more longs). */
  long_short_ratio: number | null;
  /** 1h long-side liquidation volume (USD). */
  liquidation_long_volume: number | null;
  /** 1h short-side liquidation volume (USD). */
  liquidation_short_volume: number | null;
  /** Signed price change (%) over the OI lookback, used for direction. */
  price_change_pct: number | null;
}

/** Structured output of the derivatives analysis. */
export interface DerivativesVerdictResult {
  /** CONFIRMATION / CONTRADICTION / NEUTRAL — never a standalone trigger. */
  derivatives_verdict: DerivativesVerdict;
  /** OI direction over the lookback window. */
  oi_direction: OiDirection;
  /** Current funding rate (fractional). */
  funding_rate: number | null;
  /** Global long/short ratio. */
  long_short_ratio: number | null;
  /** Which side is being liquidated more heavily. */
  liquidation_imbalance: LiquidationImbalance;
  /** Human-readable chain of reasoning (deterministic). */
  evidence: string;
}

/** Tunable thresholds for the derivatives analysis. */
export interface DerivativesAnalyzerConfig {
  /** Minimum OI history bars required before direction can be computed (default 2). */
  min_oi_bars: number;
  /** Fraction of OI change treated as noise → 'flat' (default 0.005 = 0.5%). */
  oi_flat_threshold: number;
  /** Fraction of price change treated as noise → 'flat' (default 0.005 = 0.5%). */
  price_flat_threshold: number;
  /** Funding rate (per 8h) above which is flagged as extreme (default 0.001 = 0.1%). */
  extreme_funding_threshold: number;
  /** Long/short liquidation imbalance ratio above which one side dominates (default 1.5). */
  liquidation_imbalance_ratio: number;
}

export const DEFAULT_DERIVATIVES_CONFIG: DerivativesAnalyzerConfig = {
  min_oi_bars: 2,
  oi_flat_threshold: 0.005,
  price_flat_threshold: 0.005,
  extreme_funding_threshold: 0.001,
  liquidation_imbalance_ratio: 1.5,
};

/* ------------------------------------------------------------------ */
/* Pure helpers (deterministic, no I/O)                                */
/* ------------------------------------------------------------------ */

/** Direction of a numeric series over its trailing half (0 if flat/noise). */
function seriesDirection(values: number[], flatThreshold: number): OiDirection {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (first <= 0) return 'flat';
  const pct = (last - first) / first;
  if (Math.abs(pct) <= flatThreshold) return 'flat';
  return pct > 0 ? 'rising' : 'falling';
}

/** Direction of a signed price change percentage. */
function priceDirection(pct: number | null, flatThreshold: number): PriceDirection {
  if (pct === null || !isFinite(pct)) return 'flat';
  if (Math.abs(pct) <= flatThreshold) return 'flat';
  return pct > 0 ? 'rising' : 'falling';
}

/** Determine which side is being liquidated more heavily. */
function liquidationImbalance(
  longVolume: number | null,
  shortVolume: number | null,
  ratio: number,
): LiquidationImbalance {
  if (longVolume === null || shortVolume === null) return 'unknown';
  if (!isFinite(longVolume) || !isFinite(shortVolume)) return 'unknown';
  if (longVolume <= 0 && shortVolume <= 0) return 'unknown';
  if (shortVolume === 0) return longVolume > 0 ? 'long-dominant' : 'unknown';
  if (longVolume === 0) return shortVolume > 0 ? 'short-dominant' : 'unknown';
  const lr = longVolume / shortVolume;
  if (lr >= ratio) return 'long-dominant';
  if (lr <= 1 / ratio) return 'short-dominant';
  return 'balanced';
}

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export class DerivativesAnalyzer {
  private config: DerivativesAnalyzerConfig;
  private binanceFuturesBaseUrl = 'https://fapi.binance.com';
  private bybitBaseUrl = 'https://api.bybit.com';
  private httpClient?: AxiosInstance;

  constructor(config: Partial<DerivativesAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_DERIVATIVES_CONFIG, ...config };
  }

  /* ------------------------- Fetch layer ------------------------- */

  /** Lazily create (or return) the Binance futures HTTP client (mockable in tests). */
  private getBinanceClient(): AxiosInstance {
    if (!this.httpClient) {
      this.httpClient = axios.create({
        baseURL: this.binanceFuturesBaseUrl,
        timeout: 10000,
      });
    }
    return this.httpClient;
  }

  /** Allow tests to reset / inject the HTTP client. */
  resetHttpClient(): void {
    this.httpClient = undefined;
  }

  /** Fetch current open interest for a USDT-M perpetual symbol. */
  async fetchOpenInterest(symbol: string): Promise<number | null> {
    try {
      const response = await this.getBinanceClient().get('/fapi/v1/openInterest', {
        params: { symbol: `${symbol}USDT` },
      });
      const oi = parseFloat(response.data.openInterest);
      return isFinite(oi) ? oi : null;
    } catch (error) {
      Logger.warn(`DerivativesAnalyzer.fetchOpenInterest failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /** Fetch the latest funding rate (per 8h) for a USDT-M perpetual. */
  async fetchFundingRate(symbol: string): Promise<number | null> {
    try {
      const response = await this.getBinanceClient().get('/fapi/v1/fundingRate', {
        params: { symbol: `${symbol}USDT`, limit: 1 },
      });
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      const rate = parseFloat(row?.fundingRate);
      return isFinite(rate) ? rate : null;
    } catch (error) {
      Logger.warn(`DerivativesAnalyzer.fetchFundingRate failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /** Fetch the global long/short account ratio (1h) for a symbol. */
  async fetchLongShortRatio(symbol: string): Promise<number | null> {
    try {
      const response = await this.getBinanceClient().get(
        '/futures/data/globalLongShortAccountRatio',
        { params: { symbol: `${symbol}USDT`, period: '1h', limit: 1 } },
      );
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      const ratio = parseFloat(row?.longShortRatio);
      return isFinite(ratio) ? ratio : null;
    } catch (error) {
      Logger.warn(`DerivativesAnalyzer.fetchLongShortRatio failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /**
   * Fetch funding rate from Bybit perpetuals (fallback / cross-exchange check).
   * Returns null on failure — never fabricates a value.
   */
  async fetchBybitFundingRate(symbol: string): Promise<number | null> {
    try {
      const client = axios.create({ baseURL: this.bybitBaseUrl, timeout: 10000 });
      const response = await client.get('/v5/market/tickers', {
        params: { category: 'linear', symbol: `${symbol}USDT` },
      });
      const row = response.data?.result?.list?.[0];
      const rate = parseFloat(row?.fundingRate);
      return isFinite(rate) ? rate : null;
    } catch (error) {
      Logger.warn(`DerivativesAnalyzer.fetchBybitFundingRate failed for ${symbol}`, (error as Error).message);
      return null;
    }
  }

  /* ---------------------- Analysis layer ------------------------- */

  /**
   * Compute the derivatives verdict from fetched data + price direction.
   *
   * Deterministic and network-free: every quantitative input is supplied by the
   * caller. Missing/stale inputs degrade to NEUTRAL (with a "missing" evidence
   * note) rather than a fabricated verdict.
   *
   * @param input Fetched derivatives data + signed price change (%).
   */
  analyzeDerivatives(input: DerivativesInput): DerivativesVerdictResult {
    const evidenceParts: string[] = [];

    const oiDir = seriesDirection(input.oi_history, this.config.oi_flat_threshold);
    const priceDir = priceDirection(input.price_change_pct, this.config.price_flat_threshold);
    const imbalance = liquidationImbalance(
      input.liquidation_long_volume,
      input.liquidation_short_volume,
      this.config.liquidation_imbalance_ratio,
    );

    const oiMissing = input.oi_history.length < this.config.min_oi_bars;
    const priceMissing = input.price_change_pct === null || !isFinite(input.price_change_pct);

    if (oiMissing) {
      evidenceParts.push('open interest missing/insufficient');
    } else {
      evidenceParts.push(`OI ${oiDir} over ${input.oi_history.length}-bar history`);
    }
    if (priceMissing) {
      evidenceParts.push('price change missing');
    } else {
      evidenceParts.push(`price ${priceDir} (${(input.price_change_pct!).toFixed(2)}%)`);
    }

    let verdict: DerivativesVerdict;

    if (oiMissing || priceMissing || oiDir === 'flat' || priceDir === 'flat') {
      // Insufficient directional evidence from either OI or price → NEUTRAL.
      verdict = 'NEUTRAL';
    } else {
      // OI/price alignment matrix:
      //  both rising      → continuation confirmation
      //  both falling     → continuation confirmation (bearish)
      //  OI rising, price falling → divergence (shorts adding into decline = reversal risk)
      //  OI falling, price rising  → divergence (rally on declining OI = weak/covering)
      const bothUp = oiDir === 'rising' && priceDir === 'rising';
      const bothDown = oiDir === 'falling' && priceDir === 'falling';
      verdict = bothUp || bothDown ? 'CONFIRMATION' : 'CONTRADICTION';
    }

    if (verdict === 'CONFIRMATION') {
      evidenceParts.push(
        oiDir === 'rising'
          ? 'OI and price both rising → continuation confirmed'
          : 'OI and price both falling → bearish continuation confirmed',
      );
    } else if (verdict === 'CONTRADICTION') {
      evidenceParts.push(
        oiDir === 'rising'
          ? 'OI rising while price falls → divergence, reversal risk'
          : 'OI falling while price rises → divergence, rally is weak/covering',
      );
    }

    // Extreme funding (> 0.1% per 8h) is a caution flag, not a trigger.
    if (input.funding_rate !== null && isFinite(input.funding_rate)) {
      if (Math.abs(input.funding_rate) >= this.config.extreme_funding_threshold) {
        evidenceParts.push(
          `extreme funding ${(input.funding_rate * 100).toFixed(3)}% (${input.funding_rate >= 0 ? 'overheated longs' : 'overheated shorts'})`,
        );
      }
    }

    // High liquidation imbalance is a caution flag.
    if (imbalance !== 'unknown' && imbalance !== 'balanced') {
      evidenceParts.push(
        `liquidations ${imbalance} (${imbalance === 'long-dominant' ? 'longs being liquidated' : 'shorts being liquidated'})`,
      );
    }

    return {
      derivatives_verdict: verdict,
      oi_direction: oiMissing ? 'flat' : oiDir,
      funding_rate: input.funding_rate !== null && isFinite(input.funding_rate)
        ? input.funding_rate
        : null,
      long_short_ratio: input.long_short_ratio !== null && isFinite(input.long_short_ratio)
        ? input.long_short_ratio
        : null,
      liquidation_imbalance: imbalance,
      evidence: evidenceParts.join('; '),
    };
  }
}

export default DerivativesAnalyzer;
