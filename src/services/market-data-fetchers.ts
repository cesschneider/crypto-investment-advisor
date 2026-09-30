/**
 * Market Data Fetchers — derivatives, macro, and sentiment inputs
 * for the signal engine (Epic 11 follow-up: wire the unwired scorer dimensions).
 *
 * All endpoints are public (no API key). Any failure returns a per-field
 * null/missing result — the analyzers treat missing inputs as MISSING/neutral,
 * never fabricating values.
 */

import axios from 'axios';

/* ---------------- Derivatives (Binance Futures fapi) ---------------- */

const FAPI = 'https://fapi.binance.com';

export interface DerivativesFetch {
  oi_history: number[];
  funding_rate: number | null;
  long_short_ratio: number | null;
  liquidation_long_volume: number | null;
  liquidation_short_volume: number | null;
  price_change_pct: number | null;
}

/** Open-interest history (oldest → newest) over the last `hours` hours, hourly. */
async function fetchOpenInterestHistory(pair: string, hours: number): Promise<number[]> {
  const out: number[] = [];
  // /futures/data/openInterestHist returns up to 30 days, period "1h", limit max 500.
  const res = await axios.get(`${FAPI}/futures/data/openInterestHist`, {
    params: { symbol: pair, period: '1h', limit: Math.min(hours, 500) },
    timeout: 10000,
  });
  for (const row of res.data as any[]) {
    const v = parseFloat(row.sumOpenInterestValue ?? row.sumOpenInterest);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Derivatives snapshot for one symbol (e.g. 'BTC' → 'BTCUSDT'). */
export async function fetchDerivatives(symbol: string): Promise<DerivativesFetch> {
  const pair = `${symbol}USDT`;
  const result: DerivativesFetch = {
    oi_history: [],
    funding_rate: null,
    long_short_ratio: null,
    liquidation_long_volume: null,
    liquidation_short_volume: null,
    price_change_pct: null,
  };
  const jobs: Promise<void>[] = [];

  jobs.push(
    fetchOpenInterestHistory(pair, 24)
      .then((h) => { result.oi_history = h; })
      .catch(() => { /* leave empty */ })
  );

  jobs.push(
    axios
      .get(`${FAPI}/fapi/v1/premiumIndex`, { params: { symbol: pair }, timeout: 10000 })
      .then((res) => {
        const r = parseFloat(res.data?.lastFundingRate);
        if (Number.isFinite(r)) result.funding_rate = r;
      })
      .catch(() => { /* null */ })
  );

  jobs.push(
    axios
      .get(`${FAPI}/futures/data/globalLongShortAccountRatio`, {
        params: { symbol: pair, period: '1h', limit: 1 },
        timeout: 10000,
      })
      .then((res) => {
        const r = parseFloat(res.data?.[0]?.longShortRatio);
        if (Number.isFinite(r)) result.long_short_ratio = r;
      })
      .catch(() => { /* null */ })
  );

  // Liquidations: Binance does not expose a public REST endpoint for historical
  // liquidation volume, so this stays null (explicitly MISSING) rather than guessed.
  result.liquidation_long_volume = null;
  result.liquidation_short_volume = null;

  // Price change over the OI lookback (1h klines on spot as a proxy).
  jobs.push(
    axios
      .get(`https://api.binance.com/api/v3/klines`, {
        params: { symbol: pair, interval: '1h', limit: 25 },
        timeout: 10000,
      })
      .then((res) => {
        const rows = res.data as any[][];
        if (rows.length >= 2) {
          const first = parseFloat(rows[0][1]);
          const last = parseFloat(rows[rows.length - 1][4]);
          if (Number.isFinite(first) && Number.isFinite(last) && first > 0) {
            result.price_change_pct = ((last - first) / first) * 100;
          }
        }
      })
      .catch(() => { /* null */ })
  );

  await Promise.all(jobs);
  return result;
}

/* ---------------- Macro (index quotes via Yahoo Finance chart API) ------- */

export interface MacroFetch {
  dxy: number | null;
  vix: number | null;
  sp500: number | null;
  sp500_prev_close: number | null;
  nasdaq: number | null;
  us10y_yield: number | null;
  fed_rate: number | null;
  inflation_rate: number | null;
}

/**
 * Fetch one index from Yahoo Finance chart API.
 * Returns { last, prevClose } or nulls on failure. Never throws.
 */
async function yahooQuote(yahooSymbol: string): Promise<{ last: number | null; prevClose: number | null }> {
  try {
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`, {
      params: { range: '5d', interval: '1d' },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const result = res.data?.chart?.result?.[0];
    const last = Number.isFinite(result?.meta?.regularMarketPrice)
      ? result.meta.regularMarketPrice
      : null;
    // Previous close from the daily closes series (second-to-last entry),
    // falling back to chartPreviousClose.
    let prevClose: number | null = null;
    const closes: number[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (Array.isArray(closes)) {
      const valid = closes.filter((c: number) => Number.isFinite(c) && c !== null);
      if (valid.length >= 2) prevClose = valid[valid.length - 2];
    }
    if (prevClose === null && Number.isFinite(result?.meta?.chartPreviousClose)) {
      prevClose = result.meta.chartPreviousClose;
    }
    return { last, prevClose };
  } catch {
    return { last: null, prevClose: null };
  }
}

const MACRO_CACHE: { at: number; data: MacroFetch | null } = { at: 0, data: null };

/** Macro snapshot, cached for 1 hour (indices move once/day; VIX intraday). */
export async function fetchMacro(): Promise<MacroFetch> {
  const now = Date.now();
  if (now - MACRO_CACHE.at < 3600_000 && MACRO_CACHE.data) {
    return MACRO_CACHE.data;
  }
  const [dxy, vix, spx, ndx] = await Promise.all([
    yahooQuote('DX-Y.NYB'),   // US Dollar Index
    yahooQuote('^VIX'),       // CBOE Volatility Index
    yahooQuote('^GSPC'),      // S&P 500
    yahooQuote('^IXIC'),       // Nasdaq Composite
  ]);
  const data: MacroFetch = {
    dxy: dxy.last,
    vix: vix.last,
    sp500: spx.last,
    sp500_prev_close: spx.prevClose,
    nasdaq: ndx.last,
    us10y_yield: null,   // not on Yahoo free chart API for ^TNX; stays MISSING
    fed_rate: null,      // analyzers tolerate missing
    inflation_rate: null,
  };
  MACRO_CACHE.at = now;
  MACRO_CACHE.data = data;
  return data;
}

/* ---------------- Sentiment (alternative.me Fear & Greed) ---------------- */

export interface SentimentFetch {
  fear_greed_index: number | null;
}

const FG_CACHE: { at: number; value: number | null } = { at: 0, value: null };

/** Crypto Fear & Greed index (0–100), cached for 1 hour. */
export async function fetchSentiment(): Promise<SentimentFetch> {
  const now = Date.now();
  if (now - FG_CACHE.at < 3600_000 && FG_CACHE.value !== null) {
    return { fear_greed_index: FG_CACHE.value };
  }
  try {
    const res = await axios.get('https://api.alternative.me/fng/', {
      params: { limit: 1 },
      timeout: 10000,
    });
    const v = parseInt(res.data?.data?.[0]?.value, 10);
    if (Number.isFinite(v)) {
      FG_CACHE.at = now;
      FG_CACHE.value = v;
      return { fear_greed_index: v };
    }
  } catch {
    /* fallthrough */
  }
  return { fear_greed_index: FG_CACHE.value };
}