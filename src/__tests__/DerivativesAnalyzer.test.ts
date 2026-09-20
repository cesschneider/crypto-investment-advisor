/**
 * STORY-5.1: Unit tests for the Derivatives Analyzer.
 *
 * Covers: OI/price both up → CONFIRMATION, OI up / price down → CONTRADICTION
 * (divergence), no OI change → NEUTRAL, high liquidations → imbalance, missing
 * data → NEUTRAL (never fabricated), extreme funding flag, and the structured
 * output contract.
 */

import { DerivativesAnalyzer, DerivativesInput } from '../services/DerivativesAnalyzer';
import Logger from '../utils/logger';

jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

function baseInput(): DerivativesInput {
  return {
    oi_history: [1000, 1100, 1200], // rising
    funding_rate: 0.0001,
    long_short_ratio: 1.2,
    liquidation_long_volume: 5000,
    liquidation_short_volume: 5000,
    price_change_pct: 5.0,
  };
}

describe('DerivativesAnalyzer — analysis (deterministic)', () => {
  let analyzer: DerivativesAnalyzer;

  beforeEach(() => {
    analyzer = new DerivativesAnalyzer();
    jest.spyOn(Logger, 'debug').mockImplementation();
    jest.spyOn(Logger, 'info').mockImplementation();
    jest.spyOn(Logger, 'warn').mockImplementation();
    jest.spyOn(Logger, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('OI rising + price rising → CONFIRMATION (continuation)', () => {
    const r = analyzer.analyzeDerivatives(baseInput());
    expect(r.derivatives_verdict).toBe('CONFIRMATION');
    expect(r.oi_direction).toBe('rising');
    expect(r.evidence).toContain('continuation');
  });

  it('OI falling + price falling → CONFIRMATION (bearish continuation)', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      oi_history: [1200, 1100, 1000],
      price_change_pct: -5.0,
    });
    expect(r.derivatives_verdict).toBe('CONFIRMATION');
    expect(r.oi_direction).toBe('falling');
  });

  it('OI rising + price falling → CONTRADICTION (divergence / reversal risk)', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      oi_history: [1000, 1200],
      price_change_pct: -4.0,
    });
    expect(r.derivatives_verdict).toBe('CONTRADICTION');
    expect(r.evidence).toContain('divergence');
  });

  it('OI falling + price rising → CONTRADICTION (weak rally / covering)', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      oi_history: [1200, 1000],
      price_change_pct: 4.0,
    });
    expect(r.derivatives_verdict).toBe('CONTRADICTION');
  });

  it('no OI change (flat) → NEUTRAL', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      oi_history: [1000, 1000],
    });
    expect(r.derivatives_verdict).toBe('NEUTRAL');
    expect(r.oi_direction).toBe('flat');
  });

  it('missing OI history → NEUTRAL, never fabricated', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      oi_history: [],
    });
    expect(r.derivatives_verdict).toBe('NEUTRAL');
    expect(r.evidence).toContain('missing');
  });

  it('missing price change → NEUTRAL', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      price_change_pct: null,
    });
    expect(r.derivatives_verdict).toBe('NEUTRAL');
    expect(r.evidence).toContain('price change missing');
  });

  it('detects long-dominant liquidation imbalance', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      liquidation_long_volume: 20000,
      liquidation_short_volume: 5000,
    });
    expect(r.liquidation_imbalance).toBe('long-dominant');
    expect(r.evidence).toContain('longs being liquidated');
  });

  it('detects short-dominant liquidation imbalance', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      liquidation_long_volume: 5000,
      liquidation_short_volume: 20000,
    });
    expect(r.liquidation_imbalance).toBe('short-dominant');
  });

  it('balanced liquidations → balanced', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      liquidation_long_volume: 5000,
      liquidation_short_volume: 5000,
    });
    expect(r.liquidation_imbalance).toBe('balanced');
  });

  it('unknown liquidations when volumes are null', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      liquidation_long_volume: null,
      liquidation_short_volume: null,
    });
    expect(r.liquidation_imbalance).toBe('unknown');
  });

  it('flags extreme funding (>0.1% per 8h)', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      funding_rate: 0.003,
    });
    expect(r.evidence).toContain('extreme funding');
    expect(r.funding_rate).toBe(0.003);
  });

  it('does not flag normal funding', () => {
    const r = analyzer.analyzeDerivatives({ ...baseInput(), funding_rate: 0.0001 });
    expect(r.evidence).not.toContain('extreme funding');
  });

  it('preserves null funding_rate and long_short_ratio', () => {
    const r = analyzer.analyzeDerivatives({
      ...baseInput(),
      funding_rate: null,
      long_short_ratio: null,
    });
    expect(r.funding_rate).toBeNull();
    expect(r.long_short_ratio).toBeNull();
  });

  it('emits the full structured output contract', () => {
    const r = analyzer.analyzeDerivatives(baseInput());
    expect(r).toHaveProperty('derivatives_verdict');
    expect(r).toHaveProperty('oi_direction');
    expect(r).toHaveProperty('funding_rate');
    expect(r).toHaveProperty('long_short_ratio');
    expect(r).toHaveProperty('liquidation_imbalance');
    expect(r).toHaveProperty('evidence');
    expect(['CONFIRMATION', 'CONTRADICTION', 'NEUTRAL']).toContain(r.derivatives_verdict);
    expect(['rising', 'falling', 'flat']).toContain(r.oi_direction);
    expect(typeof r.evidence).toBe('string');
  });
});

describe('DerivativesAnalyzer — fetch layer (mocked axios)', () => {
  let analyzer: DerivativesAnalyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new DerivativesAnalyzer();
    analyzer.resetHttpClient();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchOpenInterest parses openInterest to a number', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { openInterest: '12345.67' } }),
    } as any);
    const oi = await analyzer.fetchOpenInterest('BTC');
    expect(oi).toBe(12345.67);
  });

  it('fetchOpenInterest returns null on API failure', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('network')),
    } as any);
    const oi = await analyzer.fetchOpenInterest('BTC');
    expect(oi).toBeNull();
  });

  it('fetchFundingRate parses the latest funding rate', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: [{ fundingRate: '0.00015' }] }),
    } as any);
    const rate = await analyzer.fetchFundingRate('BTC');
    expect(rate).toBe(0.00015);
  });

  it('fetchLongShortRatio parses longShortRatio', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: [{ longShortRatio: '1.8' }] }),
    } as any);
    const ratio = await analyzer.fetchLongShortRatio('BTC');
    expect(ratio).toBe(1.8);
  });

  it('fetchBybitFundingRate parses Bybit response and returns null on failure', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { result: { list: [{ fundingRate: '0.0002' }] } } }),
    } as any);
    const rate = await analyzer.fetchBybitFundingRate('BTC');
    expect(rate).toBe(0.0002);
  });

  it('fetchBybitFundingRate returns null when result is empty', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { result: { list: [] } } }),
    } as any);
    const rate = await analyzer.fetchBybitFundingRate('BTC');
    expect(rate).toBeNull();
  });
});
