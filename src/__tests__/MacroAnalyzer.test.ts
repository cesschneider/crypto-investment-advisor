/**
 * STORY-5.3: Unit tests for the Macro Analyzer.
 *
 * Covers: RISK_ON / RISK_OFF / NEUTRAL classification, SUPPORT / CONTRADICT /
 * NEUTRAL verdict, confidence reduction on contradiction, missing-data handling
 * (never fabricated), and the fetch layer (mocked axios).
 */

import { MacroAnalyzer, MacroInput } from '../services/MacroAnalyzer';
import Logger from '../utils/logger';

jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

function fullInput(): MacroInput {
  return {
    dxy: 101.5,
    vix: 12.5, // < 15 → risk-on trigger
    sp500: 5500,
    sp500_prev_close: 5450, // +0.92% rising
    nasdaq: 19000,
    us10y_yield: 4.2,
    fed_rate: 5.25,
    inflation_rate: 3.1,
  };
}

describe('MacroAnalyzer — analysis (deterministic)', () => {
  let analyzer: MacroAnalyzer;

  beforeEach(() => {
    analyzer = new MacroAnalyzer();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('VIX < 15 AND S&P rising → RISK_ON', () => {
    const r = analyzer.analyzeMacro(fullInput(), 'bullish');
    expect(r.macro_environment).toBe('RISK_ON');
    expect(r.evidence).toContain('risk-on');
  });

  it('VIX > 20 → RISK_OFF', () => {
    const input: MacroInput = { ...fullInput(), vix: 24, sp500: 5450, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.macro_environment).toBe('RISK_OFF');
    expect(r.evidence).toContain('risk-off');
  });

  it('S&P falling (even with low VIX) → RISK_OFF', () => {
    const input: MacroInput = { ...fullInput(), vix: 12, sp500: 5400, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.macro_environment).toBe('RISK_OFF');
  });

  it('mixed/choppy → NEUTRAL', () => {
    const input: MacroInput = { ...fullInput(), vix: 17, sp500: 5480, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.macro_environment).toBe('NEUTRAL');
  });

  it('RISK_ON supports a bullish signal → SUPPORT', () => {
    const r = analyzer.analyzeMacro(fullInput(), 'bullish');
    expect(r.verdict).toBe('SUPPORT');
    expect(r.confidence_reduction).toBe(0);
  });

  it('RISK_OFF supports a bearish signal → SUPPORT', () => {
    const input: MacroInput = { ...fullInput(), vix: 24, sp500: 5400, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bearish');
    expect(r.verdict).toBe('SUPPORT');
  });

  it('RISK_OFF contradicts a bullish signal → CONTRADICT + confidence reduction', () => {
    const input: MacroInput = { ...fullInput(), vix: 24, sp500: 5400, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.verdict).toBe('CONTRADICT');
    expect(r.confidence_reduction).toBe(25);
    expect(r.evidence).toContain('contradicts');
  });

  it('RISK_ON contradicts a bearish signal → CONTRADICT', () => {
    const r = analyzer.analyzeMacro(fullInput(), 'bearish');
    expect(r.verdict).toBe('CONTRADICT');
    expect(r.confidence_reduction).toBe(25);
  });

  it('neutral direction → NEUTRAL verdict', () => {
    const r = analyzer.analyzeMacro(fullInput(), 'neutral');
    expect(r.verdict).toBe('NEUTRAL');
  });

  it('neutral environment → NEUTRAL verdict (no support/contradict)', () => {
    const input: MacroInput = { ...fullInput(), vix: 17, sp500: 5480, sp500_prev_close: 5500 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.verdict).toBe('NEUTRAL');
  });

  it('insufficient macro data → NEUTRAL environment, no fabrication', () => {
    const input: MacroInput = {
      dxy: 101.5,
      vix: null,
      sp500: null,
      sp500_prev_close: null,
      nasdaq: null,
      us10y_yield: null,
      fed_rate: null,
      inflation_rate: null,
    };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.macro_environment).toBe('NEUTRAL');
    expect(r.evidence).toContain('insufficient');
  });

  it('missing VIX or S&P return → NEUTRAL (required classification inputs)', () => {
    const input: MacroInput = { ...fullInput(), vix: null };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.macro_environment).toBe('NEUTRAL');
  });

  it('reports missing input names in evidence', () => {
    const input: MacroInput = { ...fullInput(), us10y_yield: null };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.evidence).toContain('us10y');
  });

  it('strong dollar (DXY ≥ 104) adds headwind note', () => {
    const input: MacroInput = { ...fullInput(), dxy: 105 };
    const r = analyzer.analyzeMacro(input, 'bullish');
    expect(r.evidence).toContain('strong dollar');
  });

  it('emits the full structured output contract', () => {
    const r = analyzer.analyzeMacro(fullInput(), 'bullish');
    expect(r).toHaveProperty('macro_environment');
    expect(r).toHaveProperty('dxy');
    expect(r).toHaveProperty('vix');
    expect(r).toHaveProperty('sp500_return_pct');
    expect(r).toHaveProperty('yields');
    expect(r).toHaveProperty('inflation_rate');
    expect(r).toHaveProperty('verdict');
    expect(r).toHaveProperty('confidence_reduction');
    expect(r).toHaveProperty('evidence');
    expect(['RISK_ON', 'NEUTRAL', 'RISK_OFF']).toContain(r.macro_environment);
    expect(['SUPPORT', 'CONTRADICT', 'NEUTRAL']).toContain(r.verdict);
    expect(typeof r.evidence).toBe('string');
  });
});

describe('MacroAnalyzer — fetch layer (mocked axios)', () => {
  let analyzer: MacroAnalyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new MacroAnalyzer();
    analyzer.resetHttpClient();
    jest.spyOn(Logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetchQuote parses regularMarketPrice', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        data: { chart: { result: [{ meta: { regularMarketPrice: 5500.25 } }] } },
      }),
    } as any);
    const v = await analyzer.fetchQuote('^GSPC');
    expect(v).toBe(5500.25);
  });

  it('fetchQuote returns null on API failure', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('network')),
    } as any);
    const v = await analyzer.fetchQuote('^GSPC');
    expect(v).toBeNull();
  });

  it('fetchQuote returns null on non-numeric data', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: { chart: { result: [] } } }),
    } as any);
    const v = await analyzer.fetchQuote('^GSPC');
    expect(v).toBeNull();
  });

  it('fetchPrevClose parses chartPreviousClose', async () => {
    mockAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        data: { chart: { result: [{ meta: { chartPreviousClose: 5450 } }] } },
      }),
    } as any);
    const v = await analyzer.fetchPrevClose('^GSPC');
    expect(v).toBe(5450);
  });
});
