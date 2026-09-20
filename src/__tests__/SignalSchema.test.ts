/**
 * STORY-3.3: Unit tests for Structured Signal Schema
 * 
 * Tests for:
 * - SignalInput validation (required fields, data freshness, schema compliance)
 * - SignalOutput structure (all required fields present)
 * - DataSource classification (PRIMARY, SECONDARY, UNRELIABLE, MISSING)
 * - DecisionFactor evidence breakdown
 * - Null field handling (permitted, no fabrication)
 * - createInsufficientDataResponse() skeleton generation
 */

import {
  validateSignalInput,
  createInsufficientDataResponse,
  SignalInput,
  SignalOutput,
  DataSource,
  DecisionFactor,
} from '../types';

describe('SignalSchema', () => {
  describe('validateSignalInput()', () => {
    it('should reject non-object input', () => {
      const result = validateSignalInput('not an object');
      expect('code' in result).toBe(true);
      expect((result as any).code).toBe('INVALID_SCHEMA');
    });

    it('should reject null input', () => {
      const result = validateSignalInput(null);
      expect('code' in result).toBe(true);
      expect((result as any).code).toBe('INVALID_SCHEMA');
    });

    it('should require request_id field', () => {
      const input = {
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: new Date().toISOString(),
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: new Date().toISOString(),
            age_seconds: 30,
            reliability: 'PRIMARY' as const,
          },
        },
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).field).toBe('request_id');
    });

    it('should require symbol field', () => {
      const input = {
        request_id: 'req-123',
        timestamp: new Date().toISOString(),
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: new Date().toISOString(),
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: new Date().toISOString(),
            age_seconds: 30,
            reliability: 'PRIMARY' as const,
          },
        },
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).field).toBe('symbol');
    });

    it('should require market_data', () => {
      const input = {
        request_id: 'req-123',
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).code).toBe('MISSING_REQUIRED_DATA');
      expect((result as any).field).toBe('market_data');
    });

    it('should require market_data.current_price', () => {
      const input = {
        request_id: 'req-123',
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
        market_data: {
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: new Date().toISOString(),
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: new Date().toISOString(),
            age_seconds: 30,
            reliability: 'PRIMARY' as const,
          },
        },
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).message).toContain('market_data.current_price');
    });

    it('should reject stale market_data (> 2 hours)', () => {
      const twoHoursAgo = new Date(Date.now() - 7201 * 1000).toISOString(); // 2 hours 1 second
      const input = {
        request_id: 'req-123',
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: twoHoursAgo,
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: twoHoursAgo,
            age_seconds: 7201,
            reliability: 'PRIMARY' as const,
          },
        },
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).code).toBe('DATA_STALE');
      expect((result as any).message).toContain('stale');
    });

    it('should accept fresh market_data (< 2 hours)', () => {
      const freshTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
      const input = {
        request_id: 'req-123',
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: freshTime,
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: freshTime,
            age_seconds: 3600,
            reliability: 'PRIMARY' as const,
          },
        },
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(false); // no error code = success
      expect((result as SignalInput).symbol).toBe('BTC/USDT');
    });

    it('should accept input with optional fields as null/undefined', () => {
      const freshTime = new Date().toISOString();
      const input = {
        request_id: 'req-123',
        timestamp: freshTime,
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: freshTime,
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: freshTime,
            age_seconds: 30,
            reliability: 'PRIMARY' as const,
          },
        },
        technical_indicators: undefined,
        derivatives: null,
        on_chain: undefined,
        sentiment: null,
        macro: undefined,
        portfolio: null,
        config: undefined,
      };
      const result = validateSignalInput(input);
      expect('code' in result).toBe(false);
    });
  });

  describe('DataSource classification', () => {
    it('should accept PRIMARY reliability', () => {
      const source: DataSource = {
        name: 'Binance OHLCV',
        category: 'market',
        timestamp: new Date().toISOString(),
        age_seconds: 30,
        reliability: 'PRIMARY',
      };
      expect(source.reliability).toBe('PRIMARY');
    });

    it('should accept SECONDARY reliability', () => {
      const source: DataSource = {
        name: 'CoinGecko Sentiment',
        category: 'sentiment',
        timestamp: new Date().toISOString(),
        age_seconds: 300,
        reliability: 'SECONDARY',
      };
      expect(source.reliability).toBe('SECONDARY');
    });

    it('should accept UNRELIABLE reliability', () => {
      const source: DataSource = {
        name: 'TAAPI.IO',
        category: 'technical',
        timestamp: new Date().toISOString(),
        age_seconds: 7200,
        reliability: 'UNRELIABLE',
        error: 'API key not configured',
      };
      expect(source.reliability).toBe('UNRELIABLE');
      expect(source.error).toBe('API key not configured');
    });

    it('should accept MISSING reliability', () => {
      const source: DataSource = {
        name: 'On-chain metrics',
        category: 'onchain',
        timestamp: new Date().toISOString(),
        age_seconds: 0,
        reliability: 'MISSING',
      };
      expect(source.reliability).toBe('MISSING');
    });
  });

  describe('DecisionFactor structure', () => {
    it('should have required fields', () => {
      const factor: DecisionFactor = {
        dimension: 'rsi_oversold',
        category: 'technical',
        direction: 1, // bullish
        weight: 0.25,
        score: 75,
        evidence: 'RSI(14) = 28, below 30 threshold indicates oversold condition',
      };
      expect(factor.dimension).toBe('rsi_oversold');
      expect(factor.direction).toBe(1);
      expect(factor.weight).toBeCloseTo(0.25);
      expect(factor.score).toBe(75);
      expect(factor.evidence).toBeTruthy();
    });

    it('should support neutral direction (0)', () => {
      const factor: DecisionFactor = {
        dimension: 'macro_neutral',
        category: 'macro',
        direction: 0,
        weight: 0.05,
        score: 50,
        evidence: 'Macro regime is neutral; no clear risk-on or risk-off signal',
      };
      expect(factor.direction).toBe(0);
    });

    it('should support bearish direction (-1)', () => {
      const factor: DecisionFactor = {
        dimension: 'negative_whale_flow',
        category: 'onchain',
        direction: -1, // bearish
        weight: 0.15,
        score: 65,
        evidence: 'Large holder distribution detected; -500 BTC moved to exchange',
      };
      expect(factor.direction).toBe(-1);
    });

    it('should include optional value and threshold', () => {
      const factor: DecisionFactor = {
        dimension: 'rsi_threshold_breach',
        category: 'technical',
        direction: 1,
        weight: 0.2,
        score: 80,
        evidence: 'RSI crossed below 30',
        value: 28,
        threshold: 30,
        confidence: 85,
      };
      expect(factor.value).toBe(28);
      expect(factor.threshold).toBe(30);
      expect(factor.confidence).toBe(85);
    });
  });

  describe('createInsufficientDataResponse()', () => {
    it('should create a valid INSUFFICIENT_DATA response', () => {
      const response = createInsufficientDataResponse(
        'req-123',
        'BTC/USDT',
        'market_data timestamp is stale (> 2 hours)',
      );

      expect(response.signal.action).toBe('INSUFFICIENT_DATA');
      expect(response.signal.confidence).toBe(0);
      expect(response.signal.strength).toBe('VERY_WEAK');
      expect(response.request_id).toBe('req-123');
      expect(response.symbol).toBe('BTC/USDT');
    });

    it('should include reason in missing_critical_sources', () => {
      const reason = 'API key for derivatives data not configured';
      const response = createInsufficientDataResponse('req-456', 'ETH/USDT', reason);

      expect(response.data_freshness_summary.missing_critical_sources).toContain(reason);
    });

    it('should have empty decision_factors array', () => {
      const response = createInsufficientDataResponse('req-789', 'SOL/USDT', 'No data');

      expect(response.decision_factors).toEqual([]);
      expect(response.contradictory_factors).toEqual([]);
    });

    it('should mark critical_data_missing = true', () => {
      const response = createInsufficientDataResponse('req-xyz', 'ADA/USDT', 'Network error');

      expect(response.risk_assessment.critical_data_missing).toBe(true);
    });
  });

  describe('SignalOutput structure', () => {
    it('should have all required top-level fields', () => {
      const now = new Date().toISOString();
      const output: SignalOutput = {
        request_id: 'req-123',
        timestamp: now,
        symbol: 'BTC/USDT',
        signal: {
          action: 'WEAK_BUY',
          confidence: 65,
          strength: 'STRONG',
        },
        market_assessment: {
          regime: 'WEAK_UPTREND',
          regime_confidence: 70,
          higher_tf_trend: 'UP',
          medium_tf_trend: 'UP',
          lower_tf_trend: 'SIDEWAYS',
          timeframe_alignment: 'diverging',
          alignment_quality: 45,
          estimated_daily_volume_usd: 5000000000,
          spread_bps: 1.5,
          is_liquid_enough_for_trade: true,
          volatility_regime: 'normal',
          market_conditions: 'Altseason momentum, Bitcoin consolidating',
        },
        decision_factors: [],
        contradictory_factors: [],
        supporting_factors_count: 3,
        contradicting_factors_count: 1,
        net_conviction: 2,
        risk_assessment: {
          portfolio_exposure_percent: 2.5,
          max_portfolio_drawdown_if_liquidated: 0.5,
          leverage: 1.0,
          correlation_with_portfolio: 0.4,
          slippage_estimate_percent: 0.2,
          liquidity_hours: 0.1,
          data_age_max_seconds: 180,
          critical_data_missing: false,
          current_atr: 1500,
          current_volatility_percent: 45,
        },
        data_sources: [],
        data_freshness_summary: {
          all_data_fresh: true,
          stale_sources: [],
          missing_critical_sources: [],
        },
        trace: {
          decision_logic: 'RSI oversold + bullish EMA alignment + positive funding rate',
          assumptions: ['Binance data accuracy', 'Funding rate representative of market intent'],
          caveats: ['Low timeframe trend is sideways; caution on entry timing'],
          multi_factor_summary: 'Signal supported by 3 dimensions; 1 contradictory factor (macro risk-off)',
        },
        rationale: 'Weak buy signal on BTC after oversold RSI and bullish MA alignment in higher timeframes.',
      };

      expect(output.request_id).toBe('req-123');
      expect(output.signal.action).toBe('WEAK_BUY');
      expect(output.market_assessment.regime).toBe('WEAK_UPTREND');
      expect(output.risk_assessment.leverage).toBe(1.0);
    });

    it('should permit trade_setup to be optional (for HOLD/INSUFFICIENT_DATA)', () => {
      const output: SignalOutput = createInsufficientDataResponse('req-x', 'BTC/USDT', 'test');

      // trade_setup should be undefined
      expect(output.trade_setup).toBeUndefined();
      // but signal should be present
      expect(output.signal).toBeDefined();
    });
  });

  describe('Integration: full workflow', () => {
    it('should accept a complete, realistic SignalInput', () => {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

      const input: SignalInput = {
        request_id: 'real-signal-001',
        timestamp: now,
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 52000,
          price_24h_high: 53000,
          price_24h_low: 50000,
          volume_24h_usd: 15000000000,
          market_cap_usd: 1020000000000,
          timestamp: oneHourAgo,
          data_source: {
            name: 'Binance Spot',
            category: 'market',
            timestamp: oneHourAgo,
            age_seconds: 3600,
            reliability: 'PRIMARY',
          },
        },
        technical_indicators: {
          trend: 'UPTREND',
          trend_strength: 72,
          rsi_14: 32,
          macd_line: 150,
          macd_signal: 140,
          macd_histogram: 10,
          sma_50: 50500,
          sma_200: 48000,
          bollinger_upper: 54000,
          bollinger_middle: 52000,
          bollinger_lower: 50000,
          atr_14: 1500,
          timestamp: oneHourAgo,
          data_source: {
            name: 'TradingView / Internal Calculator',
            category: 'technical',
            timestamp: oneHourAgo,
            age_seconds: 3600,
            reliability: 'PRIMARY',
          },
        },
        derivatives: {
          funding_rate_current: 0.01,
          funding_rate_8h_avg: 0.008,
          funding_rate_prediction: 'long',
          open_interest_usd: 500000000,
          open_interest_change_24h_percent: 5,
          open_interest_longs_percent: 55,
          timestamp: oneHourAgo,
          data_source: {
            name: 'Binance Futures',
            category: 'derivatives',
            timestamp: oneHourAgo,
            age_seconds: 3600,
            reliability: 'PRIMARY',
          },
        },
        config: {
          risk_tolerance: 'moderate',
          min_confidence_for_trade: 60,
          allow_market_orders: true,
          max_slippage_bps: 50,
          require_multi_timeframe_alignment: true,
          require_on_chain_confirmation: false,
          require_derivatives_confirmation: false,
        },
      };

      const result = validateSignalInput(input);
      expect('code' in result).toBe(false);
      expect((result as SignalInput).symbol).toBe('BTC/USDT');
      expect((result as SignalInput).technical_indicators?.rsi_14).toBe(32);
    });

    it('should validate multi-factor scoring scenario', () => {
      // Simulate case where signal is BUY: RSI oversold + uptrend + bullish funding
      const factors: DecisionFactor[] = [
        {
          dimension: 'rsi_oversold',
          category: 'technical',
          direction: 1,
          weight: 0.3,
          score: 85,
          evidence: 'RSI = 28, severe oversold',
          value: 28,
          threshold: 30,
        },
        {
          dimension: 'uptrend_confirmation',
          category: 'technical',
          direction: 1,
          weight: 0.3,
          score: 70,
          evidence: 'Price above SMA50 and SMA200; higher lows',
          value: 52000,
          threshold: 50500,
        },
        {
          dimension: 'funding_rate_bullish',
          category: 'derivatives',
          direction: 1,
          weight: 0.2,
          score: 60,
          evidence: 'Funding rate = +0.01%, longs accumulating',
          value: 0.01,
          threshold: 0,
        },
      ];

      // Sum weights should be 0.8 (0.3 + 0.3 + 0.2)
      const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
      expect(totalWeight).toBe(0.8);

      // Average score would be (85*0.3 + 70*0.3 + 60*0.2) / 0.8 = ~73
      const weightedScore =
        (factors[0].score * factors[0].weight +
          factors[1].score * factors[1].weight +
          factors[2].score * factors[2].weight) /
        totalWeight;
      expect(weightedScore).toBeGreaterThan(70);
      expect(weightedScore).toBeLessThan(75);
    });
  });

  describe('Error scenarios (audit compliance)', () => {
    it('should not fabricate missing technical indicators', () => {
      const now = new Date().toISOString();
      const input: SignalInput = {
        request_id: 'no-tech',
        timestamp: now,
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 50000,
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          market_cap_usd: 980000000000,
          timestamp: now,
          data_source: {
            name: 'Binance',
            category: 'market',
            timestamp: now,
            age_seconds: 30,
            reliability: 'PRIMARY',
          },
        },
        // technical_indicators not provided
      };

      const result = validateSignalInput(input);
      expect('code' in result).toBe(false);
      // Validation passes (technical_indicators is optional)
      // But scorer should note missing data and possibly return INSUFFICIENT_DATA
      expect((result as SignalInput).technical_indicators).toBeUndefined();
    });

    it('should handle empty data_sources array gracefully', () => {
      const response = createInsufficientDataResponse('req-empty', 'BTC/USDT', 'No data sources available');

      expect(Array.isArray(response.data_sources)).toBe(true);
      expect(response.data_sources.length).toBe(0);
    });

    it('should reject invalid numeric data in market_data', () => {
      const input = {
        request_id: 'bad-price',
        timestamp: new Date().toISOString(),
        symbol: 'BTC/USDT',
        market_data: {
          current_price: 'fifty thousand', // invalid: string instead of number
          price_24h_high: 51000,
          price_24h_low: 49000,
          volume_24h_usd: 1000000,
          timestamp: new Date().toISOString(),
          data_source: {
            name: 'Binance',
            category: 'market' as const,
            timestamp: new Date().toISOString(),
            age_seconds: 30,
            reliability: 'PRIMARY' as const,
          },
        },
      };

      const result = validateSignalInput(input);
      expect('code' in result).toBe(true);
      expect((result as any).code).toBe('INVALID_SCHEMA');
    });
  });
});
