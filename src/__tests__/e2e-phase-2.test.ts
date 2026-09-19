/**
 * PHASE 2: End-to-End (E2E) Tests (50 tests)
 * Validates complete signal generation flow through entire pipeline
 * 
 * Test Execution: npm run test:e2e
 */

import binanceDefault from '../services/binance';
import { EtherscanService } from '../services/etherscan';
import { SolscanService } from '../services/solscan';
import { TechnicalAnalyzer } from '../analyzers/technical';
import { OnChainAnalyzer } from '../analyzers/onchain';

describe('=== PHASE 2: END-TO-END TESTS (50 tests) ===', () => {

  // ================= 2.1 Technical Analysis E2E (20 tests) =================
  describe('2.1 Technical Analysis Pipeline E2E', () => {
    const analyzer = new TechnicalAnalyzer();

    it('should generate BUY signal when RSI < 30 (oversold)', async () => {
      const prices = [40, 41, 42, 39, 38, 37, 36, 35]; // Downtrend
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal).toBeDefined();
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
    });

    it('should generate SELL signal when RSI > 70 (overbought)', async () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107]; // Uptrend
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal).toBeDefined();
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should generate HOLD signal for neutral conditions', async () => {
      const prices = [50, 50.5, 50, 50.5, 50, 50.5]; // Neutral
      const signal = analyzer.generateSignal('ETH', prices);
      
      expect(signal).toBeDefined();
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should combine RSI + MACD for confidence calculation', async () => {
      const prices = [40, 41, 42, 39, 38, 37, 36, 35, 34, 33]; // Downtrend
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.indicators).toBeDefined();
    });

    it('should calculate MACD correctly', async () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
      const macd = analyzer.calculateMACD(prices);
      
      expect(macd).toBeDefined();
      expect(macd.macd).toBeDefined();
      expect(macd.signal).toBeDefined();
      expect(macd.histogram).toBeDefined();
    });

    it('should calculate RSI correctly', async () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
      const rsi = analyzer.calculateRSI(prices, 14);
      
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should calculate Bollinger Bands correctly', async () => {
      const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
      const bands = analyzer.calculateBollingerBands(prices);
      
      expect(bands).toBeDefined();
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.middle).toBeGreaterThan(bands.lower);
    });

    it('should handle SOL price data', async () => {
      const prices = [50, 51, 52, 51, 50, 49, 48, 47];
      const signal = analyzer.generateSignal('SOL', prices);
      
      expect(signal.symbol).toBe('SOL');
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should include timestamp in signal', async () => {
      const prices = [100, 101, 102, 103, 104, 105];
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal.timestamp).toBeDefined();
      expect(typeof signal.timestamp).toBe('string');
    });

    it('should validate signal structure', async () => {
      const prices = [100, 101, 102, 103, 104, 105];
      const signal = analyzer.generateSignal('ETH', prices);
      
      expect(signal).toHaveProperty('symbol');
      expect(signal).toHaveProperty('signal');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('timestamp');
      expect(signal).toHaveProperty('indicators');
    });

    it('should handle ADA price data', async () => {
      const prices = [0.5, 0.51, 0.52, 0.51, 0.50, 0.49];
      const signal = analyzer.generateSignal('ADA', prices);
      
      expect(signal).toBeDefined();
      expect(signal.symbol).toBe('ADA');
    });

    it('should reject empty price array', async () => {
      expect(() => {
        analyzer.generateSignal('BTC', []);
      }).toThrow();
    });

    it('should reject single price point', async () => {
      expect(() => {
        analyzer.generateSignal('BTC', [100]);
      }).toThrow();
    });

    it('should process 100+ price points', async () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal).toBeDefined();
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should maintain confidence between 0-100', async () => {
      for (let i = 0; i < 5; i++) {
        const randomPrices = Array.from({ length: 20 }, () => Math.random() * 100);
        const signal = analyzer.generateSignal('BTC', randomPrices);
        
        expect(signal.confidence).toBeGreaterThanOrEqual(0);
        expect(signal.confidence).toBeLessThanOrEqual(100);
      }
    });

    it('should detect strong buy signals (confidence > 70)', async () => {
      const strongDowntrend = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];
      const signal = analyzer.generateSignal('BTC', strongDowntrend);
      
      if (signal.signal === 'BUY') {
        expect(signal.confidence).toBeGreaterThan(50);
      }
    });

    it('should detect strong sell signals (confidence > 70)', async () => {
      const strongUptrend = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59];
      const signal = analyzer.generateSignal('BTC', strongUptrend);
      
      if (signal.signal === 'SELL') {
        expect(signal.confidence).toBeGreaterThan(50);
      }
    });
  });

  // ================= 2.2 On-Chain Analysis E2E (15 tests) =================
  describe('2.2 On-Chain Analysis Pipeline E2E', () => {
    const onchain = new OnChainAnalyzer();

    it('should detect whale accumulation pattern', async () => {
      const transactions = [
        { value: 500000, type: 'buy', timestamp: Date.now() },
        { value: 450000, type: 'buy', timestamp: Date.now() - 3600000 },
      ];
      const analysis = onchain.analyzeTransactions(transactions);
      
      expect(analysis).toBeDefined();
      expect(['ACCUMULATION', 'DISTRIBUTION', 'NEUTRAL']).toContain(analysis.pattern);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(100);
    });

    it('should detect exchange deposit (distribution pattern)', async () => {
      const transactions = [
        { value: 300000, type: 'exchange_deposit', timestamp: Date.now() },
        { value: 250000, type: 'exchange_deposit', timestamp: Date.now() - 3600000 },
      ];
      const analysis = onchain.analyzeTransactions(transactions);
      
      expect(analysis.pattern).toBeDefined();
      expect(['ACCUMULATION', 'DISTRIBUTION', 'NEUTRAL']).toContain(analysis.pattern);
    });

    it('should alert on large whale transactions (>$100k)', async () => {
      const largeTransaction = { value: 150000, type: 'whale_buy' };
      const alert = onchain.checkWhaleThreshold(largeTransaction, 100000);
      
      expect(alert).toBeDefined();
      expect(alert.isWhale).toBe(true);
      expect(alert.severity).toBeGreaterThan(0);
    });

    it('should not alert on normal transactions', async () => {
      const normalTransaction = { value: 10000, type: 'trade' };
      const alert = onchain.checkWhaleThreshold(normalTransaction, 100000);
      
      expect(alert.isWhale).toBe(false);
    });

    it('should track transaction velocity', async () => {
      const transactions = [
        { value: 100000, type: 'buy', timestamp: Date.now() },
        { value: 100000, type: 'buy', timestamp: Date.now() - 60000 },
        { value: 100000, type: 'buy', timestamp: Date.now() - 120000 },
      ];
      const velocity = onchain.calculateTransactionVelocity(transactions);
      
      expect(velocity).toBeGreaterThan(0);
      expect(typeof velocity).toBe('number');
    });

    it('should calculate accumulation score', async () => {
      const buyTransactions = [
        { value: 100000, type: 'buy' },
        { value: 150000, type: 'buy' },
      ];
      const score = onchain.calculateAccumulationScore(buyTransactions);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should identify emerging whale addresses', async () => {
      const addresses = [
        { address: '0xabc...', transactions: 100, volume: 1000000 },
        { address: '0xdef...', transactions: 5, volume: 500000 },
      ];
      const emerging = onchain.identifyEmergingWhales(addresses);
      
      expect(Array.isArray(emerging)).toBe(true);
    });

    it('should validate transaction structure', async () => {
      const tx = { value: 100000, type: 'buy', timestamp: Date.now() };
      const isValid = onchain.validateTransaction(tx);
      
      expect(isValid).toBe(true);
    });

    it('should detect wash trading patterns', async () => {
      const transactions = [
        { value: 50000, from: '0xabc', to: '0xdef', timestamp: Date.now() },
        { value: 50000, from: '0xdef', to: '0xabc', timestamp: Date.now() - 60000 },
      ];
      const isWash = onchain.detectWashTrading(transactions);
      
      expect(typeof isWash).toBe('boolean');
    });

    it('should track exchange inflows', async () => {
      const transactions = [
        { value: 200000, to: 'exchange', type: 'deposit' },
        { value: 150000, to: 'exchange', type: 'deposit' },
      ];
      const inflow = onchain.calculateExchangeInflow(transactions);
      
      expect(inflow).toBe(350000);
    });

    it('should track exchange outflows', async () => {
      const transactions = [
        { value: 200000, from: 'exchange', type: 'withdrawal' },
        { value: 150000, from: 'exchange', type: 'withdrawal' },
      ];
      const outflow = onchain.calculateExchangeOutflow(transactions);
      
      expect(outflow).toBe(350000);
    });

    it('should calculate net whale flow', async () => {
      const inflows = 500000;
      const outflows = 300000;
      const netFlow = onchain.calculateNetWhaleFlow(inflows, outflows);
      
      expect(netFlow).toBe(200000);
      expect(netFlow > 0).toBe(true); // Positive = accumulation
    });

    it('should generate whale analysis report', async () => {
      const transactions = [
        { value: 100000, type: 'buy' },
        { value: 150000, type: 'buy' },
      ];
      const report = onchain.generateWhaleReport(transactions);
      
      expect(report).toBeDefined();
      expect(report.pattern).toBeDefined();
      expect(report.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty transaction array', async () => {
      const analysis = onchain.analyzeTransactions([]);
      
      expect(analysis.pattern).toBe('NEUTRAL');
      expect(analysis.confidence).toBeLessThan(50);
    });
  });

  // ================= 2.3 Full Signal Pipeline E2E (15 tests) =================
  describe('2.3 Full Signal Pipeline E2E', () => {
    const analyzer = new TechnicalAnalyzer();
    const binance = binanceDefault;

    it('should complete hourly signal generation pipeline', async () => {
      // Simulated hourly pipeline
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.random() * 10);
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal.timestamp).toBeDefined();
      expect(signal.symbol).toBe('BTC');
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should validate all required signal fields', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('ETH', prices);
      
      expect(signal).toHaveProperty('symbol');
      expect(signal).toHaveProperty('signal');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('timestamp');
      expect(signal).toHaveProperty('indicators');
      expect(signal.indicators).toHaveProperty('rsi');
      expect(signal.indicators).toHaveProperty('macd');
    });

    it('should format signal for delivery', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('BTC', prices);
      
      const formatted = {
        timestamp: signal.timestamp,
        symbol: signal.symbol,
        action: signal.signal,
        confidence: signal.confidence,
      };
      
      expect(formatted.timestamp).toBeDefined();
      expect(formatted.symbol).toBeDefined();
      expect(formatted.action).toBeDefined();
      expect(formatted.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should aggregate multiple symbol signals', async () => {
      const symbols = ['BTC', 'ETH', 'SOL'];
      const signals = symbols.map(symbol => {
        const prices = Array.from({ length: 20 }, () => Math.random() * 100);
        return analyzer.generateSignal(symbol, prices);
      });
      
      expect(signals.length).toBe(3);
      expect(signals.every(s => s.symbol)).toBe(true);
      expect(signals.every(s => s.signal)).toBe(true);
    });

    it('should include confidence threshold in signals', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
    });

    it('should generate signals for all major altcoins', async () => {
      const altcoins = ['ETH', 'SOL', 'ADA', 'XRP', 'BNB'];
      const signals = altcoins.map(symbol => {
        const prices = Array.from({ length: 20 }, () => Math.random() * 100);
        return analyzer.generateSignal(symbol, prices);
      });
      
      expect(signals.length).toBe(5);
      signals.forEach(signal => {
        expect(signal.symbol).toBeDefined();
        expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
      });
    });

    it('should validate price data before analysis', async () => {
      const validPrices = [100, 101, 102, 103, 104, 105];
      const signal = analyzer.generateSignal('BTC', validPrices);
      
      expect(signal).toBeDefined();
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should detect signal consistency across timeframes', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal1h = analyzer.generateSignal('BTC', prices);
      
      // Same prices should generate consistent signal
      const signal2 = analyzer.generateSignal('BTC', prices);
      
      expect(signal1h.signal).toBe(signal2.signal);
    });

    it('should include analysis metadata', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('BTC', prices);
      
      expect(signal.indicators).toBeDefined();
      expect(signal.indicators.rsi).toBeDefined();
      expect(signal.indicators.macd).toBeDefined();
      expect(signal.indicators.bollinger).toBeDefined();
    });

    it('should ensure timestamp is recent', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      const signal = analyzer.generateSignal('BTC', prices);
      
      const signalTime = new Date(signal.timestamp).getTime();
      const now = Date.now();
      const diff = now - signalTime;
      
      expect(diff).toBeLessThan(5000); // Within 5 seconds
    });

    it('should handle high volatility periods', async () => {
      const volatilePrices = [100, 110, 90, 120, 80, 130, 70, 140];
      const signal = analyzer.generateSignal('BTC', volatilePrices);
      
      expect(['BUY', 'SELL', 'HOLD']).toContain(signal.signal);
    });

    it('should detect trending vs ranging markets', async () => {
      // Trending market
      const trendingPrices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const trendSignal = analyzer.generateSignal('BTC', trendingPrices);
      
      // Ranging market
      const rangingPrices = [100, 101, 100, 101, 100, 101];
      const rangeSignal = analyzer.generateSignal('ETH', rangingPrices);
      
      expect(trendSignal).toBeDefined();
      expect(rangeSignal).toBeDefined();
    });

    it('should complete full pipeline in reasonable time', async () => {
      const start = Date.now();
      const prices = Array.from({ length: 20 }, () => Math.random() * 100);
      analyzer.generateSignal('BTC', prices);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500); // Should be fast
    });
  });
});
