/**
 * STORY-3.4: Unit tests for the Data Freshness & Input Validation Gate.
 *
 * Covers:
 *   - max_data_age_seconds enforced per source (critical vs secondary)
 *   - future timestamps rejected
 *   - cross-source discrepancy checks (spot/perp divergence, bid/ask spread)
 *   - impossible values flagged
 *   - stale/inconsistent critical data -> INSUFFICIENT_DATA
 *   - valid data passes cleanly
 */

import {
  InputValidator,
  validateInput,
  FreshnessConfig,
} from '../services/InputValidator';
import { SignalInput, DataSource } from '../types';

/** Build a minimal valid SignalInput with the given data sources. */
function buildInput(overrides: Partial<SignalInput> = {}): SignalInput {
  const now = Date.now();
  const freshTs = new Date(now - 30 * 1000).toISOString();

  const marketSource: DataSource = {
    name: 'Binance Spot',
    category: 'market',
    timestamp: freshTs,
    age_seconds: 30,
    reliability: 'PRIMARY',
  };

  return {
    request_id: 'req-1',
    timestamp: new Date(now).toISOString(),
    symbol: 'BTC/USDT',
    market_data: {
      current_price: 50000,
      price_24h_high: 51000,
      price_24h_low: 49000,
      volume_24h_usd: 1000000000,
      market_cap_usd: 1000000000000,
      timestamp: freshTs,
      data_source: marketSource,
    },
    ...overrides,
  };
}

/** Build a technical source with a given age in seconds. */
function technicalSource(ageSeconds: number): DataSource {
  return {
    name: 'Internal Calculator',
    category: 'technical',
    timestamp: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    age_seconds: ageSeconds,
    reliability: 'PRIMARY',
  };
}

describe('InputValidator (Story 3.4)', () => {
  describe('valid data', () => {
    it('passes when all critical data is fresh', () => {
      const input = buildInput({
        technical_indicators: {
          trend: 'UPTREND',
          trend_strength: 70,
          rsi_14: 45,
          timestamp: new Date(Date.now() - 60 * 1000).toISOString(),
          data_source: technicalSource(60),
        },
      });
      const result = validateInput(input);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.insufficient_data_signal).toBeUndefined();
    });

    it('passes when only critical market data is present', () => {
      const input = buildInput();
      const result = validateInput(input);
      expect(result.valid).toBe(true);
    });
  });

  describe('max_data_age_seconds enforcement', () => {
    it('flags critical data older than critical_max_age_seconds', () => {
      const input = buildInput({
        technical_indicators: {
          trend: 'SIDEWAYS',
          timestamp: new Date(Date.now() - 400 * 1000).toISOString(),
          data_source: technicalSource(400),
        },
      });
      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.insufficient_data_signal).toBe('INSUFFICIENT_DATA');
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'technical_indicators',
            severity: 'critical',
          }),
        ]),
      );
    });

    it('treats secondary data as warning, not critical, when stale within secondary window', () => {
      const sentimentSource: DataSource = {
        name: 'Fear & Greed',
        category: 'sentiment',
        timestamp: new Date(Date.now() - 1800 * 1000).toISOString(),
        age_seconds: 1800,
        reliability: 'SECONDARY',
      };
      const input = buildInput({
        sentiment: {
          fear_and_greed_index: 45,
          timestamp: new Date(Date.now() - 1800 * 1000).toISOString(),
          data_source: sentimentSource,
        },
      });
      // 1800s is stale for critical (300s) but within secondary (3600s)
      const result = validateInput(input);
      expect(result.valid).toBe(true);
    });

    it('flags secondary data stale beyond secondary_max_age_seconds as warning', () => {
      const sentimentSource: DataSource = {
        name: 'Fear & Greed',
        category: 'sentiment',
        timestamp: new Date(Date.now() - 4000 * 1000).toISOString(),
        age_seconds: 4000,
        reliability: 'SECONDARY',
      };
      const input = buildInput({
        sentiment: {
          fear_and_greed_index: 45,
          timestamp: new Date(Date.now() - 4000 * 1000).toISOString(),
          data_source: sentimentSource,
        },
      });
      const result = validateInput(input);
      expect(result.valid).toBe(true); // secondary stale is warning-only
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: 'warning' }),
        ]),
      );
    });
  });

  describe('future timestamp rejection', () => {
    it('rejects timestamps far in the future', () => {
      const futureTs = new Date(Date.now() + 600 * 1000).toISOString(); // 10 min ahead
      const input = buildInput();
      input.market_data.data_source.timestamp = futureTs;
      input.market_data.timestamp = futureTs;

      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.insufficient_data_signal).toBe('INSUFFICIENT_DATA');
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'market_data',
            severity: 'critical',
            message: expect.stringContaining('future timestamp'),
          }),
        ]),
      );
    });

    it('rejects timestamps 10 years in the future', () => {
      const tenYears = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString();
      const input = buildInput();
      input.market_data.data_source.timestamp = tenYears;
      input.market_data.timestamp = tenYears;

      const result = validateInput(input);
      expect(result.valid).toBe(false);
    });

    it('tolerates small clock skew within tolerance window', () => {
      const smallSkew = new Date(Date.now() + 30 * 1000).toISOString(); // 30s ahead
      const input = buildInput();
      input.market_data.data_source.timestamp = smallSkew;
      input.market_data.timestamp = smallSkew;

      const result = validateInput(input);
      expect(result.valid).toBe(true);
    });
  });

  describe('unparseable timestamp', () => {
    it('flags a non-ISO timestamp as critical', () => {
      const input = buildInput();
      input.market_data.data_source.timestamp = 'not-a-date';
      input.market_data.timestamp = 'not-a-date';

      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.insufficient_data_signal).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('cross-source discrepancy checks', () => {
    it('flags spot/perp price divergence beyond 2%', () => {
      const input = buildInput();
      // spot = 50000, perp mark = 52000 => 4% divergence
      (input as any).derivatives = {
        mark_price: 52000,
        timestamp: new Date().toISOString(),
        data_source: {
          name: 'Binance Futures',
          category: 'derivatives',
          timestamp: new Date().toISOString(),
          age_seconds: 30,
          reliability: 'PRIMARY',
        },
      };

      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.insufficient_data_signal).toBe('INSUFFICIENT_DATA');
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'derivatives',
            severity: 'critical',
            message: expect.stringContaining('divergence'),
          }),
        ]),
      );
    });

    it('does not flag small spot/perp divergence within threshold', () => {
      const input = buildInput();
      (input as any).derivatives = {
        mark_price: 50500, // 1% divergence
        timestamp: new Date().toISOString(),
        data_source: {
          name: 'Binance Futures',
          category: 'derivatives',
          timestamp: new Date().toISOString(),
          age_seconds: 30,
          reliability: 'PRIMARY',
        },
      };
      const result = validateInput(input);
      expect(result.valid).toBe(true);
    });

    it('flags extreme spot/perp divergence (spot $1000 vs perp $10)', () => {
      const input = buildInput();
      input.market_data.current_price = 1000;
      (input as any).derivatives = {
        mark_price: 10,
        timestamp: new Date().toISOString(),
        data_source: {
          name: 'Binance Futures',
          category: 'derivatives',
          timestamp: new Date().toISOString(),
          age_seconds: 30,
          reliability: 'PRIMARY',
        },
      };
      const result = validateInput(input);
      expect(result.valid).toBe(false);
    });

    it('flags bid/ask spread beyond 1% as warning', () => {
      const input = buildInput();
      (input as any).market_data.bid_price = 50000;
      (input as any).market_data.ask_price = 51000; // 2% spread

      const result = validateInput(input);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'market_data',
            severity: 'warning',
            message: expect.stringContaining('spread'),
          }),
        ]),
      );
    });
  });

  describe('impossible values', () => {
    it('flags non-positive current_price as critical', () => {
      const input = buildInput();
      input.market_data.current_price = 0;
      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.insufficient_data_signal).toBe('INSUFFICIENT_DATA');
    });

    it('flags negative volume', () => {
      const input = buildInput();
      input.market_data.volume_24h_usd = -500;
      const result = validateInput(input);
      expect(result.valid).toBe(false);
    });

    it('flags high below low as warning', () => {
      const input = buildInput();
      input.market_data.price_24h_high = 40000;
      input.market_data.price_24h_low = 50000;
      const result = validateInput(input);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: 'warning' }),
        ]),
      );
    });
  });

  describe('ordering and severity', () => {
    it('orders critical issues before warnings', () => {
      const input = buildInput();
      // Add a warning (spread) and a critical (future timestamp)
      (input as any).market_data.bid_price = 50000;
      (input as any).market_data.ask_price = 51000; // warning
      input.market_data.data_source.timestamp = new Date(Date.now() + 600 * 1000).toISOString(); // critical

      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.issues[0].severity).toBe('critical');
    });
  });

  describe('InputValidator class', () => {
    it('uses custom config overrides', () => {
      const config: FreshnessConfig = {
        critical_max_age_seconds: 1000,
        secondary_max_age_seconds: 7200,
        future_timestamp_tolerance_seconds: 60,
        max_spot_perp_divergence: 0.05,
        max_spread: 0.02,
      };
      const validator = new InputValidator(config);
      const input = buildInput({
        technical_indicators: {
          trend: 'SIDEWAYS',
          timestamp: new Date(Date.now() - 600 * 1000).toISOString(),
          data_source: technicalSource(600),
        },
      });
      // 600s would be stale under default (300s) but fresh under 1000s override
      const result = validator.validate(input);
      expect(result.valid).toBe(true);
    });
  });
});
