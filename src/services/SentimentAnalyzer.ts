/**
 * STORY-5.4: Wire Sentiment Data (Fear & Greed) (Epic 5 — Data Source Remediation)
 *
 * Integrates the Crypto Fear & Greed Index (free API) and defines sentiment's
 * role as a CONFIRMING / CONTRARIAN input — never a standalone trigger.
 *
 * Audit requirement (FR-504, audit §C):
 *  - Fear & Greed index fetched from a free API (api.alternative.me/fng/).
 *  - Index classified: Extreme Fear (<25), Fear (25-45), Neutral (45-55),
 *    Greed (55-75), Extreme Greed (>75).
 *  - Sentiment role defined in output:
 *      CONFIRM    (greed at highs → sell / supports bearish)
 *      CONTRARIAN (fear at lows → buy / supports bullish)
 *      NEUTRAL    (middle ranges, no signal)
 *  - Social/news sentiment wired OR marked MISSING with reason (never fabricated).
 *  - Sentiment never used as a standalone trigger; only supports/contradicts an
 *    existing signal.
 *
 * Design: the *analysis* logic (`analyzeSentiment`) is pure and deterministic —
 * it takes an already-fetched Fear & Greed value plus a signal direction and
 * computes the classification + role with no network I/O and no invented data.
 * The *fetch* layer (axios to api.alternative.me/fng/) is separated so it can
 * be mocked in tests. Social sentiment is intentionally left as MISSING (no
 * free reliable source at MVP) and is reported transparently, never guessed.
 */

import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/* ------------------------------------------------------------------ */
/* Types & contracts                                                   */
/* ------------------------------------------------------------------ */

/** Classification of the Fear & Greed index value. */
export type SentimentClassification =
  | 'EXTREME_FEAR'
  | 'FEAR'
  | 'NEUTRAL'
  | 'GREED'
  | 'EXTREME_GREED';

/** Role sentiment plays relative to an existing crypto signal direction. */
export type SentimentRole = 'CONFIRM' | 'CONTRARIAN' | 'NEUTRAL';

/** Direction of a crypto signal being supported/contradicted. */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

/** Structured input to the deterministic analysis (null = missing). */
export interface SentimentInput {
  /** Fear & Greed index value 0–100 (0 = extreme fear, 100 = extreme greed). null = missing. */
  fear_greed_index: number | null;
}

/** Structured output of the sentiment analysis. */
export interface SentimentResult {
  /** 0–100 Fear & Greed value (null if missing). */
  fear_greed_index: number | null;
  /** EXTREME_FEAR / FEAR / NEUTRAL / GREED / EXTREME_GREED. */
  classification: SentimentClassification | 'MISSING';
  /** CONFIRM / CONTRARIAN / NEUTRAL relative to the signal direction. */
  role: SentimentRole;
  /** Social/news sentiment: value or 'MISSING' (never fabricated). */
  social_sentiment: string | 'MISSING';
  /** Human-readable chain of reasoning (deterministic). */
  evidence: string;
}

/** Tunable thresholds for the sentiment analysis. */
export interface SentimentAnalyzerConfig {
  /** Below this → EXTREME_FEAR. Default 25. */
  extreme_fear_threshold: number;
  /** Below this → FEAR (above extreme fear). Default 45. */
  fear_threshold: number;
  /** Above this → GREED (below extreme greed). Default 55. */
  greed_threshold: number;
  /** Above this → EXTREME_GREED. Default 75. */
  extreme_greed_threshold: number;
}

export const DEFAULT_SENTIMENT_CONFIG: SentimentAnalyzerConfig = {
  extreme_fear_threshold: 25,
  fear_threshold: 45,
  greed_threshold: 55,
  extreme_greed_threshold: 75,
};

/* ------------------------------------------------------------------ */
/* Analyzer                                                            */
/* ------------------------------------------------------------------ */

export class SentimentAnalyzer {
  private config: SentimentAnalyzerConfig;
  private baseUrl: string;
  private httpClient?: AxiosInstance;

  constructor(
    config: Partial<SentimentAnalyzerConfig> = {},
    baseUrl = 'https://api.alternative.me',
  ) {
    this.config = { ...DEFAULT_SENTIMENT_CONFIG, ...config };
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
   * Fetch the current Fear & Greed index value (0–100) from
   * api.alternative.me/fng/. Returns null on failure — never fabricated.
   */
  async fetchFearGreedIndex(): Promise<number | null> {
    try {
      const response = await this.getHttpClient().get('/fng/', {
        params: { limit: 1 },
      });
      const entry = response.data?.data?.[0];
      const value = parseFloat(entry?.value);
      return isFinite(value) ? value : null;
    } catch (error) {
      Logger.warn('SentimentAnalyzer.fetchFearGreedIndex failed', (error as Error).message);
      return null;
    }
  }

  /* ---------------------- Analysis layer ------------------------- */

  /**
   * Classify the Fear & Greed index into a bucket given a value.
   * Pure and deterministic — no I/O.
   */
  classifyFearGreed(value: number): SentimentClassification {
    if (value < this.config.extreme_fear_threshold) return 'EXTREME_FEAR';
    if (value < this.config.fear_threshold) return 'FEAR';
    if (value < this.config.greed_threshold) return 'NEUTRAL';
    if (value < this.config.extreme_greed_threshold) return 'GREED';
    return 'EXTREME_GREED';
  }

  /**
   * Compute the sentiment classification and role from a fetched Fear & Greed
   * value + signal direction.
   *
   * Deterministic and network-free. Sentiment is a CONFIRMING / CONTRARIAN
   * input only — it never produces a standalone signal. The role is derived by
   * mapping greed → risk of overextension (supports bearish, contradicts
   * bullish) and fear → capitulation (supports bullish, contradicts bearish).
   */
  analyzeSentiment(input: SentimentInput, direction: SignalDirection): SentimentResult {
    const evidenceParts: string[] = [];
    const fg = input.fear_greed_index !== null && isFinite(input.fear_greed_index)
      ? input.fear_greed_index
      : null;

    let classification: SentimentClassification | 'MISSING';
    let role: SentimentRole = 'NEUTRAL';

    if (fg === null) {
      classification = 'MISSING';
      role = 'NEUTRAL';
      evidenceParts.push('Fear & Greed index missing — sentiment cannot be judged');
    } else {
      classification = this.classifyFearGreed(fg);
      evidenceParts.push(`Fear & Greed ${fg} → ${classification}`);

      // Map classification to a directional bias (sentiment is contrarian at
      // extremes: greed → overbought/caution, fear → oversold/opportunity).
      const sentimentBias: 'bullish' | 'bearish' | 'neutral' =
        classification === 'EXTREME_GREED' || classification === 'GREED'
          ? 'bearish'
          : classification === 'EXTREME_FEAR' || classification === 'FEAR'
            ? 'bullish'
            : 'neutral';

      if (direction === 'neutral' || sentimentBias === 'neutral') {
        role = 'NEUTRAL';
        evidenceParts.push('sentiment neutral or no signal direction — no confirmation/contradiction');
      } else if (sentimentBias === direction) {
        role = 'CONFIRM';
        evidenceParts.push(`sentiment ${classification} confirms ${direction} signal`);
      } else {
        role = 'CONTRARIAN';
        evidenceParts.push(`sentiment ${classification} is contrarian to ${direction} signal`);
      }
    }

    // Social/news sentiment — intentionally MISSING (no free reliable source).
    // Reported transparently, never fabricated (audit §C, FR-504).
    const social = 'MISSING';
    evidenceParts.push('social/news sentiment: MISSING (no free reliable source wired)');

    return {
      fear_greed_index: fg,
      classification,
      role,
      social_sentiment: social,
      evidence: evidenceParts.join('; '),
    };
  }
}

export default SentimentAnalyzer;
