/**
 * STORY-5.2: Unit tests for the On-Chain Analyzer.
 *
 * Covers: MVRV/SOPR/netflow/stablecoin tagging, verdict computation
 * (CONFIRMATION / CONTRADICTION / NEUTRAL / MISSING), missing-data handling
 * (never fabricated), and the fetch layer (mocked axios).
 */

import { OnChainAnalyzer, OnChainInput } from '../services/OnChainAnalyzer';
import Logger from '../utils/logger';

jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

function fullInput(): OnChainInput {
  return {
    mvrv: 0.8, // undervalued → bullish
    sopr: 0.9, // capitulation → bullish
    exchange_netflow: -5000000, // outflow → bullish
    stablecoin_supply: 160000000000,
    stablecoin_supply_change_pct: 0.03, // growing → bullish
  };
}

describe('OnChainAnalyzer — analysis (deterministic)', () => {
  let analyzer: OnChainAnalyzer;

  beforeEach(() => {
    analyzer = new OnChainAnalyzer();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tags each metric with a role', () => {
    const r = analyzer.analyzeOnChain(fullInput(), 'bullish');
    const roles = r.signals.map((s) => s.role);
    expect(roles).toContain('REGIME_INDICATOR');
    expect(roles).toContain('EARLY_WARNING');
    expect(roles).toContain('CONFIRMATION');
    expect(roles).toContain('PRIMARY_SIGNAL');
    expect(r.signals).toHaveLength(5);
  });

  it('bullish signal + bullish on-chain → CONFIRMATION', () => {
    const r = analyzer.analyzeOnChain(fullInput(), 'bullish');
    expect(r.onchain_verdict).toBe('CONFIRMATION');
    expect(r.present_count).toBe(5);
    expect(r.missing_count).toBe(0);
  });

  it('bearish signal + bearish on-chain → CONFIRMATION', () => {
    const input: OnChainInput = {
      mvrv: 3.5, // overheated → bearish
      sopr: 1.1, // profit-taking → bearish
      exchange_netflow: 5000000, // inflow → bearish
      stablecoin_supply: 160000000000,
      stablecoin_supply_change_pct: -0.03, // shrinking → bearish
    };
    const r = analyzer.analyzeOnChain(input, 'bearish');
    expect(r.onchain_verdict).toBe('CONFIRMATION');
  });

  it('bullish signal + bearish on-chain → CONTRADICTION', () => {
    const input: OnChainInput = {
      mvrv: 3.5,
      sopr: 1.1,
      exchange_netflow: 5000000,
      stablecoin_supply: 160000000000,
      stablecoin_supply_change_pct: -0.03,
    };
    const r = analyzer.analyzeOnChain(input, 'bullish');
    expect(r.onchain_verdict).toBe('CONTRADICTION');
    expect(r.evidence).toContain('contradict');
  });

  it('balanced evidence → NEUTRAL', () => {
    const input: OnChainInput = {
      mvrv: 2.0, // neutral
      sopr: 1.0, // neutral
      exchange_netflow: 0, // neutral
      stablecoin_supply: 160000000000,
      stablecoin_supply_change_pct: 0.0, // neutral
    };
    const r = analyzer.analyzeOnChain(input, 'bullish');
    expect(r.onchain_verdict).toBe('NEUTRAL');
  });

  it('neutral direction → NEUTRAL', () => {
    const r = analyzer.analyzeOnChain(fullInput(), 'neutral');
    expect(r.onchain_verdict).toBe('NEUTRAL');
  });

  it('insufficient metrics → MISSING (never fabricated)', () => {
    const input: OnChainInput = {
      mvrv: 2.0,
      sopr: null,
      exchange_netflow: null,
      stablecoin_supply: null,
      stablecoin_supply_change_pct: null,
    };
    const r = analyzer.analyzeOnChain(input, 'bullish');
    expect(r.onchain_verdict).toBe('MISSING');
    expect(r.present_count).toBe(1);
    expect(r.missing_count).toBe(4);
    expect(r.evidence).toContain('insufficient');
  });

  it('all missing → MISSING with all metrics tagged MISSING', () => {
    const input: OnChainInput = {
      mvrv: null,
      sopr: null,
      exchange_netflow: null,
      stablecoin_supply: null,
      stablecoin_supply_change_pct: null,
    };
    const r = analyzer.analyzeOnChain(input, 'bullish');
    expect(r.onchain_verdict).toBe('MISSING');
    expect(r.signals.every((s) => s.status === 'MISSING')).toBe(true);
    expect(r.evidence).toContain('missing');
  });

  it('reports missing metric names in evidence', () => {
    const input: OnChainInput = { ...fullInput(), sopr: null };
    const r = analyzer.analyzeOnChain(input, 'bullish');
    expect(r.missing_count).toBe(1);
    expect(r.evidence).toContain('sopr');
  });

  it('emits the full structured output contract', () => {
    const r = analyzer.analyzeOnChain(fullInput(), 'bullish');
    expect(r).toHaveProperty('onchain_verdict');
    expect(r).toHaveProperty('signals');
    expect(r).toHaveProperty('present_count');
    expect(r).toHaveProperty('missing_count');
    expect(r).toHaveProperty('evidence');
    expect(['CONFIRMATION', 'CONTRADICTION', 'NEUTRAL', 'MISSING']).toContain(r.onchain_verdict);
    expect(typeof r.evidence).toBe('string');
  });
});

describe('OnChainAnalyzer — fetch layer (mocked axios)', () => {
  let analyzer: OnChainAnalyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new OnChainAnalyzer();
    analyzer.resetHttpClient();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchMetric parses array-of-points response', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: [{ v: 1.2 }, { v: 2.4 }, { v: 3.6 }] }),
    } as any);
    const v = await analyzer.fetchMetric('/v1/metrics/market/mvrv');
    expect(v).toBe(3.6);
  });

  it('fetchMetric parses object response', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { value: '2.5' } }),
    } as any);
    const v = await analyzer.fetchMetric('/v1/metrics/some');
    expect(v).toBe(2.5);
  });

  it('fetchMetric returns null on API failure', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('network')),
    } as any);
    const v = await analyzer.fetchMetric('/v1/metrics/market/mvrv');
    expect(v).toBeNull();
  });

  it('fetchMetric returns null on non-numeric data', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: [{ v: 'n/a' }] }),
    } as any);
    const v = await analyzer.fetchMetric('/v1/metrics/market/mvrv');
    expect(v).toBeNull();
  });
});
