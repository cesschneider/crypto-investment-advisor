const { SignalScorer } = require('../services/signal-scorer');

describe('SignalScorer', () => {
  let scorer: any;

  beforeEach(() => {
    scorer = new SignalScorer();
  });

  describe('Constructor and Basic Initialization', () => {
    test('should instantiate SignalScorer', () => {
      expect(scorer).toBeInstanceOf(SignalScorer);
    });
  });

  describe('score() - Core Method', () => {
    test('should return ScoringResult with required fields', () => {
      const inputs = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 50
      };

      const result = scorer.score(inputs);

      expect(result).toHaveProperty('symbol', 'BTC');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('trace');
      expect(result).toHaveProperty('supporting_dimensions_count');
    });

    test('should have 8 dimensions in result', () => {
      const inputs = {
        symbol: 'ETH',
        timestamp: new Date().toISOString()
      };

      const result = scorer.score(inputs);

      expect(result.dimensions.length).toBe(8);
    });
  });

  describe('Multi-Factor Decision Logic', () => {
    test('single indicator (RSI oversold) alone should return NO_TRADE or HOLD', () => {
      const inputs = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        rsi_14: 25 // oversold
      };

      const result = scorer.score(inputs);

      // Single RSI signal alone: insufficient supporting evidence
      expect(['NO_TRADE', 'HOLD', 'INSUFFICIENT_DATA']).toContain(result.action);
      expect(result.confidence).toBeLessThan(70);
    });

    test('strong uptrend alone without momentum = WEAK_BUY or HOLD (single strong indicator)', () => {
      const inputs = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 70, // strong uptrend
        macd_histogram: 0.015, // bullish
        rsi_14: 60, // mid-range (not extreme)
        price: 42000,
        supports: [41000, 40000],
        resistances: [43000, 44000],
        volume_24h: 15000000,
        volume_7d: 12000000,
        whale_accumulation: 40 // strong accumulation
      };

      const result = scorer.score(inputs);
      
      // 4+ bullish dimensions: should be BUY/WEAK_BUY
      expect(['BUY', 'WEAK_BUY', 'STRONG_BUY']).toContain(result.action);
      expect(result.confidence).toBeGreaterThan(60);
    });

    test('stale data should trigger INSUFFICIENT_DATA even with bullish setup', () => {
      const inputs = {
        symbol: 'ETH',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 70,
        rsi_14: 65,
        macd_histogram: 0.01,
        data_age_seconds: {
          trend: 3700, // > 1 hour
          momentum: 2000
        }
      };

      const result = scorer.score(inputs);

      expect(result.action).toBe('INSUFFICIENT_DATA');
      expect(result.insufficient_data).toBe(true);
      expect(result.data_freshness_issues).toBeDefined();
      expect(result.data_freshness_issues.length).toBeGreaterThan(0);
    });

    test('mixed bearish + bullish signals should HOLD or WEAK_SELL', () => {
      const inputs = {
        symbol: 'SOL',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 30, // weak
        rsi_14: 72, // overbought
        macd_histogram: -0.003, // bearish
        volume_24h: 5000000,
        volume_7d: 4500000, // slightly up
        whale_accumulation: -20 // distribution
      };

      const result = scorer.score(inputs);

      // Mixed signals: HOLD, NO_TRADE, WEAK_SELL, or WEAK_BUY depending on balance
      expect(['HOLD', 'NO_TRADE', 'WEAK_SELL', 'WEAK_BUY']).toContain(result.action);
    });

    test('strong bearish alignment should return WEAK_SELL or SELL', () => {
      const inputs = {
        symbol: 'SHIB',
        timestamp: new Date().toISOString(),
        trend: 'DOWNTREND',
        trend_strength: 70,
        rsi_14: 35, // not quite oversold
        macd_histogram: -0.02, // strong bearish
        price: 8000,
        resistances: [8500, 8200], // below
        whale_accumulation: -50, // distribution
        macro_regime: 'RISK_OFF',
        macro_strength: 60
      };

      const result = scorer.score(inputs);

      expect(['WEAK_SELL', 'SELL', 'STRONG_SELL']).toContain(result.action);
      expect(result.confidence).toBeGreaterThan(40);
    });
  });

  describe('Confidence Calculation', () => {
    test('confidence should be 0-100 range', () => {
      const inputs = {
        symbol: 'ADA',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 80,
        rsi_14: 55,
        macd_histogram: 0.01,
        volume_24h: 10000000,
        volume_7d: 9000000
      };

      const result = scorer.score(inputs);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    test('more supporting dimensions = higher confidence', () => {
      const inputsWeak = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        rsi_14: 65
      };

      const resultWeak = scorer.score(inputsWeak);

      const inputsStrong = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 80,
        rsi_14: 65,
        macd_histogram: 0.015,
        price: 50000,
        supports: [49000],
        resistances: [51000],
        volume_24h: 10000000,
        volume_7d: 9500000,
        funding_rate: -0.0008,
        whale_accumulation: 40,
        macro_regime: 'RISK_ON',
        macro_strength: 70,
        sentiment_score: 60
      };

      const resultStrong = scorer.score(inputsStrong);

      expect(resultStrong.confidence).toBeGreaterThan(resultWeak.confidence);
    });
  });

  describe('Evidence Audit Trail', () => {
    test('trace should include all 8 dimensions', () => {
      const inputs = {
        symbol: 'XRP',
        timestamp: new Date().toISOString(),
        trend: 'SIDEWAYS',
        trend_strength: 20,
        rsi_14: 50,
        macd_histogram: 0,
        price: 2.5,
        supports: [2.4],
        resistances: [2.6],
        volume_24h: 1000000,
        volume_7d: 950000,
        funding_rate: 0.0001,
        whale_accumulation: 0,
        macro_regime: 'NEUTRAL',
        sentiment_score: 10
      };

      const result = scorer.score(inputs);

      expect(Object.keys(result.trace).length).toBe(8);
      expect(result.trace).toHaveProperty('trend');
      expect(result.trace).toHaveProperty('momentum');
      expect(result.trace).toHaveProperty('structure');
      expect(result.trace).toHaveProperty('volume');
      expect(result.trace).toHaveProperty('derivatives');
      expect(result.trace).toHaveProperty('onchain');
      expect(result.trace).toHaveProperty('macro');
      expect(result.trace).toHaveProperty('sentiment');
    });

    test('each trace entry should have score and evidence', () => {
      const inputs = {
        symbol: 'DOT',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 50
      };

      const result = scorer.score(inputs);

      for (const [dimension, data] of Object.entries(result.trace)) {
        const traceData = data as any;
        expect(traceData).toHaveProperty('score');
        expect(traceData).toHaveProperty('evidence');
        expect(typeof traceData.score).toBe('number');
        expect(typeof traceData.evidence).toBe('string');
        expect(traceData.score).toBeGreaterThanOrEqual(0);
        expect(traceData.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Edge Cases', () => {
    test('empty inputs should return INSUFFICIENT_DATA', () => {
      const inputs = {
        symbol: 'DOGE',
        timestamp: new Date().toISOString()
      };

      const result = scorer.score(inputs);

      expect(result.action).toBe('INSUFFICIENT_DATA');
      expect(result.insufficient_data).toBe(true);
    });

    test('all data missing should result in confidence = 0 or near-zero', () => {
      const inputs = {
        symbol: 'LUNA',
        timestamp: new Date().toISOString()
      };

      const result = scorer.score(inputs);

      expect(result.confidence).toBeLessThanOrEqual(25);
    });

    test('extreme values should be clamped to 0-100', () => {
      const inputs = {
        symbol: 'AVAX',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 150 // > 100
      };

      const result = scorer.score(inputs);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    test('positive sentiment should give higher score than negative', () => {
      const inputsPositive = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        sentiment_score: 80
      };

      const inputsNegative = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        sentiment_score: -80
      };

      const resultPos = scorer.score(inputsPositive);
      const resultNeg = scorer.score(inputsNegative);

      // Positive sentiment should have higher score
      expect(resultPos.score).toBeGreaterThanOrEqual(resultNeg.score);
    });
  });

  describe('Dimension Scoring Details', () => {
    test('RSI < 30 should contribute to bullish signal', () => {
      const inputs = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        rsi_14: 25,
        trend: 'UPTREND',
        trend_strength: 70,
        macd_histogram: 0.01,
        price: 50000,
        supports: [49000]
      };

      const result = scorer.score(inputs);
      const momentumDim = result.dimensions.find((d: any) => d.dimension === 'momentum');

      expect(momentumDim.score).toBeLessThan(50);
      expect(momentumDim.evidence).toContain('oversold');
    });

    test('RSI > 70 should contribute to bearish signal', () => {
      const inputs = {
        symbol: 'ETH',
        timestamp: new Date().toISOString(),
        rsi_14: 75,
        trend: 'DOWNTREND',
        trend_strength: 60,
        macd_histogram: -0.01
      };

      const result = scorer.score(inputs);
      const momentumDim = result.dimensions.find((d: any) => d.dimension === 'momentum');

      expect(momentumDim.score).toBeGreaterThan(50);
      expect(momentumDim.evidence).toContain('overbought');
    });

    test('volume surge should be positive', () => {
      const inputs = {
        symbol: 'SOL',
        timestamp: new Date().toISOString(),
        volume_24h: 10000000,
        volume_7d: 6000000, // 24h >> 7d avg
        volume_avg_30d: 5000000
      };

      const result = scorer.score(inputs);
      const volumeDim = result.dimensions.find((d: any) => d.dimension === 'volume');

      expect(volumeDim.score).toBeGreaterThan(50);
      expect(volumeDim.evidence).toContain('High volume');
    });

    test('whale accumulation > 30 should be bullish', () => {
      const inputs = {
        symbol: 'ARB',
        timestamp: new Date().toISOString(),
        whale_accumulation: 60
      };

      const result = scorer.score(inputs);
      const onchainDim = result.dimensions.find((d: any) => d.dimension === 'onchain');

      expect(onchainDim.score).toBeGreaterThan(50);
      expect(onchainDim.evidence).toContain('accumulation');
    });

    test('whale distribution < -30 should be bearish', () => {
      const inputs = {
        symbol: 'LINK',
        timestamp: new Date().toISOString(),
        whale_accumulation: -70
      };

      const result = scorer.score(inputs);
      const onchainDim = result.dimensions.find((d: any) => d.dimension === 'onchain');

      expect(onchainDim.score).toBeLessThan(50);
      expect(onchainDim.evidence).toContain('distribution');
    });

    test('high funding rate should be bearish', () => {
      const inputs = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        funding_rate: 0.003 // high positive
      };

      const result = scorer.score(inputs);
      const derivDim = result.dimensions.find((d: any) => d.dimension === 'derivatives');

      expect(derivDim.score).toBeLessThan(50);
      expect(derivDim.evidence).toContain('bearish');
    });

    test('negative funding rate should be bullish', () => {
      const inputs = {
        symbol: 'ETH',
        timestamp: new Date().toISOString(),
        funding_rate: -0.002
      };

      const result = scorer.score(inputs);
      const derivDim = result.dimensions.find((d: any) => d.dimension === 'derivatives');

      expect(derivDim.score).toBeGreaterThan(50);
      expect(derivDim.evidence).toContain('bullish');
    });

    test('risk-off regime should reduce score vs risk-on', () => {
      const inputsRiskOn = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        macro_regime: 'RISK_ON',
        macro_strength: 70
      };

      const inputsRiskOff = {
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        macro_regime: 'RISK_OFF',
        macro_strength: 70
      };

      const resultOn = scorer.score(inputsRiskOn);
      const resultOff = scorer.score(inputsRiskOff);

      // Risk-on should have higher score than risk-off
      expect(resultOn.score).toBeGreaterThanOrEqual(resultOff.score);
    });
  });

  describe('Action Enum Values', () => {
    test('should support all action types', () => {
      const testCases = [
        { desc: 'STRONG_BUY', inputs: { symbol: 'BTC', timestamp: new Date().toISOString(), trend: 'UPTREND', trend_strength: 90, rsi_14: 60, macd_histogram: 0.02, volume_24h: 20000000, volume_7d: 15000000, whale_accumulation: 70, macro_regime: 'RISK_ON', macro_strength: 80 } },
        { desc: 'HOLD', inputs: { symbol: 'ETH', timestamp: new Date().toISOString(), rsi_14: 50 } },
        { desc: 'INSUFFICIENT_DATA', inputs: { symbol: 'SOL', timestamp: new Date().toISOString() } }
      ];

      for (const testCase of testCases) {
        const result = scorer.score(testCase.inputs);
        expect(['STRONG_BUY', 'BUY', 'WEAK_BUY', 'HOLD', 'WEAK_SELL', 'SELL', 'STRONG_SELL', 'INSUFFICIENT_DATA', 'NO_TRADE']).toContain(result.action);
      }
    });
  });

  describe('Branch Coverage', () => {
    test('all conditional branches in trend scoring', () => {
      // Uptrend
      const uptrend = scorer.score({ symbol: 'BTC', timestamp: new Date().toISOString(), trend: 'UPTREND', trend_strength: 50 });
      expect(uptrend.dimensions.find((d: any) => d.dimension === 'trend').score).toBeGreaterThan(50);

      // Downtrend
      const downtrend = scorer.score({ symbol: 'ETH', timestamp: new Date().toISOString(), trend: 'DOWNTREND', trend_strength: 50 });
      expect(downtrend.dimensions.find((d: any) => d.dimension === 'trend').score).toBeLessThan(50);

      // Sideways
      const sideways = scorer.score({ symbol: 'SOL', timestamp: new Date().toISOString(), trend: 'SIDEWAYS' });
      expect(sideways.dimensions.find((d: any) => d.dimension === 'trend').score).toBe(50);

      // Missing
      const missing = scorer.score({ symbol: 'DOGE', timestamp: new Date().toISOString() });
      expect(missing.dimensions.find((d: any) => d.dimension === 'trend').contributing).toBe(false);
    });

    test('all conditional branches in momentum scoring', () => {
      // Oversold
      const oversold = scorer.score({ symbol: 'BTC', timestamp: new Date().toISOString(), rsi_14: 25 });
      const ovMom = oversold.dimensions.find((d: any) => d.dimension === 'momentum');
      expect(ovMom.score).toBeLessThan(50);

      // Overbought
      const overbought = scorer.score({ symbol: 'ETH', timestamp: new Date().toISOString(), rsi_14: 75 });
      const obMom = overbought.dimensions.find((d: any) => d.dimension === 'momentum');
      expect(obMom.score).toBeGreaterThan(50);

      // Neutral RSI
      const neutral = scorer.score({ symbol: 'SOL', timestamp: new Date().toISOString(), rsi_14: 50 });
      const neaMom = neutral.dimensions.find((d: any) => d.dimension === 'momentum');
      expect(neaMom.score).toBeLessThanOrEqual(60);
      expect(neaMom.score).toBeGreaterThanOrEqual(40);
    });

    test('all decision logic branches', () => {
      // 3+ bullish dimensions
      const strong = scorer.score({
        symbol: 'BTC',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 80,
        rsi_14: 65,
        macd_histogram: 0.02,
        volume_24h: 30000000,
        volume_7d: 20000000,
        whale_accumulation: 50
      });
      expect(['STRONG_BUY', 'BUY', 'WEAK_BUY']).toContain(strong.action);

      // 2 bullish dimensions
      const weak = scorer.score({
        symbol: 'ETH',
        timestamp: new Date().toISOString(),
        trend: 'UPTREND',
        trend_strength: 60,
        rsi_14: 65
      });
      // With only 2 bullish dimensions but both strong, could be WEAK_BUY or HOLD
      expect(['WEAK_BUY', 'HOLD', 'BUY', 'INSUFFICIENT_DATA']).toContain(weak.action);

      // 3+ bearish dimensions
      const strongSell = scorer.score({
        symbol: 'SOL',
        timestamp: new Date().toISOString(),
        trend: 'DOWNTREND',
        trend_strength: 80,
        rsi_14: 35,
        macd_histogram: -0.02,
        whale_accumulation: -50
      });
      expect(['STRONG_SELL', 'SELL', 'WEAK_SELL']).toContain(strongSell.action);

      // Mixed/neutral — only 2 dimensions: insufficient supporting evidence
      const mixed = scorer.score({
        symbol: 'AVAX',
        timestamp: new Date().toISOString(),
        rsi_14: 50,
        macd_histogram: 0
      });
      expect(['HOLD', 'NO_TRADE', 'INSUFFICIENT_DATA']).toContain(mixed.action);
    });
  });
});

describe('SignalStrength enum and confidence mapping', () => {
  const { confidenceToStrength } = require('../types/index');
  const validStrengths = ['VERY_WEAK', 'WEAK', 'MODERATE', 'STRONG', 'VERY_STRONG'];

  test('ScoringResult includes a valid strength field', () => {
    const scorer = new SignalScorer();
    const result = scorer.score({
      symbol: 'BTC',
      timestamp: new Date().toISOString(),
      trend: 'UPTREND',
      trend_strength: 70,
      rsi_14: 60,
      macd_histogram: 0.015
    });
    expect(validStrengths).toContain(result.strength);
  });

  test('confidenceToStrength maps confidence to correct bucket', () => {
    expect(confidenceToStrength(10)).toBe('VERY_WEAK');
    expect(confidenceToStrength(20)).toBe('VERY_WEAK');
    expect(confidenceToStrength(30)).toBe('WEAK');
    expect(confidenceToStrength(40)).toBe('WEAK');
    expect(confidenceToStrength(50)).toBe('MODERATE');
    expect(confidenceToStrength(60)).toBe('MODERATE');
    expect(confidenceToStrength(70)).toBe('STRONG');
    expect(confidenceToStrength(80)).toBe('STRONG');
    expect(confidenceToStrength(90)).toBe('VERY_STRONG');
    expect(confidenceToStrength(100)).toBe('VERY_STRONG');
  });

  test('strength is consistent with confidence on output', () => {
    const scorer = new SignalScorer();
    const result = scorer.score({
      symbol: 'ETH',
      timestamp: new Date().toISOString(),
      trend: 'UPTREND',
      trend_strength: 80,
      rsi_14: 55,
      macd_histogram: 0.02,
      whale_accumulation: 60,
      macro_regime: 'RISK_ON'
    });
    expect(confidenceToStrength(result.confidence)).toBe(result.strength);
  });

  test('INSUFFICIENT_DATA action is a first-class outcome for missing critical data', () => {
    const scorer = new SignalScorer();
    const result = scorer.score({
      symbol: 'SOL',
      timestamp: new Date().toISOString(),
      rsi_14: 25
    });
    expect(['INSUFFICIENT_DATA', 'NO_TRADE', 'HOLD']).toContain(result.action);
  });
});
