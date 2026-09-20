/**
 * STORY-5.4: Unit tests for the Sentiment Analyzer (Fear & Greed).
 *
 * Covers: Fear & Greed classification buckets, sentiment role (CONFIRM /
 * CONTRARIAN / NEUTRAL), missing-data handling (never fabricated), the
 * social/news sentiment MISSING contract, and the fetch layer (mocked axios).
 */

import { SentimentAnalyzer, SentimentInput } from '../services/SentimentAnalyzer';
import Logger from '../utils/logger';

jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('SentimentAnalyzer — classification (deterministic)', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });

  it('value < 25 → EXTREME_FEAR', () => {
    expect(analyzer.classifyFearGreed(10)).toBe('EXTREME_FEAR');
    expect(analyzer.classifyFearGreed(24)).toBe('EXTREME_FEAR');
  });

  it('25 ≤ value < 45 → FEAR', () => {
    expect(analyzer.classifyFearGreed(25)).toBe('FEAR');
    expect(analyzer.classifyFearGreed(44)).toBe('FEAR');
  });

  it('45 ≤ value < 55 → NEUTRAL', () => {
    expect(analyzer.classifyFearGreed(45)).toBe('NEUTRAL');
    expect(analyzer.classifyFearGreed(54)).toBe('NEUTRAL');
  });

  it('55 ≤ value < 75 → GREED', () => {
    expect(analyzer.classifyFearGreed(55)).toBe('GREED');
    expect(analyzer.classifyFearGreed(74)).toBe('GREED');
  });

  it('value ≥ 75 → EXTREME_GREED', () => {
    expect(analyzer.classifyFearGreed(75)).toBe('EXTREME_GREED');
    expect(analyzer.classifyFearGreed(90)).toBe('EXTREME_GREED');
  });
});

describe('SentimentAnalyzer — analysis (deterministic)', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extreme fear supports a bullish signal → CONFIRM', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 12 }, 'bullish');
    expect(r.classification).toBe('EXTREME_FEAR');
    expect(r.role).toBe('CONFIRM');
    expect(r.evidence).toContain('confirms');
  });

  it('extreme greed supports a bearish signal → CONFIRM', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 85 }, 'bearish');
    expect(r.classification).toBe('EXTREME_GREED');
    expect(r.role).toBe('CONFIRM');
  });

  it('extreme greed contradicts a bullish signal → CONTRARIAN', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 85 }, 'bullish');
    expect(r.classification).toBe('EXTREME_GREED');
    expect(r.role).toBe('CONTRARIAN');
    expect(r.evidence).toContain('contrarian');
  });

  it('extreme fear contradicts a bearish signal → CONTRARIAN', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 10 }, 'bearish');
    expect(r.role).toBe('CONTRARIAN');
  });

  it('neutral range (45-55) → NEUTRAL role regardless of direction', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 50 }, 'bullish');
    expect(r.classification).toBe('NEUTRAL');
    expect(r.role).toBe('NEUTRAL');
  });

  it('neutral signal direction → NEUTRAL role', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 85 }, 'neutral');
    expect(r.role).toBe('NEUTRAL');
  });

  it('missing Fear & Greed → classification MISSING, no fabrication', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: null }, 'bullish');
    expect(r.classification).toBe('MISSING');
    expect(r.role).toBe('NEUTRAL');
    expect(r.fear_greed_index).toBeNull();
  });

  it('social/news sentiment is reported MISSING, not fabricated', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 50 }, 'bullish');
    expect(r.social_sentiment).toBe('MISSING');
    expect(r.evidence).toContain('MISSING');
  });

  it('emits the full structured output contract', () => {
    const r = analyzer.analyzeSentiment({ fear_greed_index: 70 }, 'bearish');
    expect(r).toHaveProperty('fear_greed_index');
    expect(r).toHaveProperty('classification');
    expect(r).toHaveProperty('role');
    expect(r).toHaveProperty('social_sentiment');
    expect(r).toHaveProperty('evidence');
    expect(['EXTREME_FEAR', 'FEAR', 'NEUTRAL', 'GREED', 'EXTREME_GREED', 'MISSING']).toContain(r.classification);
    expect(['CONFIRM', 'CONTRARIAN', 'NEUTRAL']).toContain(r.role);
    expect(typeof r.evidence).toBe('string');
  });
});

describe('SentimentAnalyzer — fetch layer (mocked axios)', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new SentimentAnalyzer();
    analyzer.resetHttpClient();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchFearGreedIndex parses the value field', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        data: { data: [{ value: '42', value_classification: 'Fear', timestamp: '1690000000' }] },
      }),
    } as any);
    const v = await analyzer.fetchFearGreedIndex();
    expect(v).toBe(42);
  });

  it('fetchFearGreedIndex returns null on API failure', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('network')),
    } as any);
    const v = await analyzer.fetchFearGreedIndex();
    expect(v).toBeNull();
  });

  it('fetchFearGreedIndex returns null on empty/malformed data', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { data: [] } }),
    } as any);
    const v = await analyzer.fetchFearGreedIndex();
    expect(v).toBeNull();
  });
});
