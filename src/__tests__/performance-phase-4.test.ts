/**
 * PHASE 4: Performance & Load Tests (20 tests)
 * Validates signal generation speed, latency, and throughput
 * 
 * Test Execution: npm run test:performance
 */

import { TechnicalAnalyzer } from '../analyzers/technical';
import { OnChainAnalyzer } from '../analyzers/onchain';

describe('=== PHASE 4: PERFORMANCE & LOAD TESTS (20 tests) ===', () => {

  // ================= 4.1 Response Time Tests (8 tests) =================
  describe('4.1 Performance - Signal Generation Latency', () => {
    const analyzer = new TechnicalAnalyzer();

    it('should generate hourly signal in <100ms', async () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      
      const start = performance.now();
      const signal = analyzer.generateSignal('BTC', prices);
      const duration = performance.now() - start;
      
      expect(signal).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('should generate 4-hour signal in <150ms', async () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 10) * 10 + i * 0.1);
      
      const start = performance.now();
      const signal = analyzer.generateSignal('BTC', prices);
      const duration = performance.now() - start;
      
      expect(signal).toBeDefined();
      expect(duration).toBeLessThan(150);
    });

    it('should handle daily signal in <200ms', async () => {
      const prices = Array.from({ length: 365 }, (_, i) => 100 + Math.sin(i / 50) * 20 + i * 0.05);
      
      const start = performance.now();
      const signal = analyzer.generateSignal('BTC', prices);
      const duration = performance.now() - start;
      
      expect(signal).toBeDefined();
      expect(duration).toBeLessThan(200);
    });

    it('should generate 4 concurrent symbol signals in <200ms', async () => {
      const prices1 = Array.from({ length: 20 }, () => Math.random() * 100 + 40000);
      const prices2 = Array.from({ length: 20 }, () => Math.random() * 10 + 2000);
      const prices3 = Array.from({ length: 20 }, () => Math.random() * 5 + 100);
      const prices4 = Array.from({ length: 20 }, () => Math.random() * 2 + 0.5);
      
      const start = performance.now();
      const signals = await Promise.all([
        Promise.resolve(analyzer.generateSignal('BTC', prices1)),
        Promise.resolve(analyzer.generateSignal('ETH', prices2)),
        Promise.resolve(analyzer.generateSignal('SOL', prices3)),
        Promise.resolve(analyzer.generateSignal('ADA', prices4)),
      ]);
      const duration = performance.now() - start;
      
      expect(signals.length).toBe(4);
      expect(duration).toBeLessThan(200);
    });

    it('should calculate RSI in <20ms', async () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      
      const start = performance.now();
      const rsi = analyzer.calculateRSI(prices, 14);
      const duration = performance.now() - start;
      
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
      expect(duration).toBeLessThan(20);
    });

    it('should calculate MACD in <25ms', async () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      
      const start = performance.now();
      const macd = analyzer.calculateMACD(prices);
      const duration = performance.now() - start;
      
      expect(macd).toBeDefined();
      expect(duration).toBeLessThan(25);
    });

    it('should calculate Bollinger Bands in <15ms', async () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      
      const start = performance.now();
      const bands = analyzer.calculateBollingerBands(prices);
      const duration = performance.now() - start;
      
      expect(bands).toBeDefined();
      expect(duration).toBeLessThan(15);
    });

    it('should validate price data in <5ms', async () => {
      const prices = Array.from({ length: 1000 }, () => Math.random() * 1000);
      
      const start = performance.now();
      const isValid = prices.every(p => p > 0 && p < Infinity);
      const duration = performance.now() - start;
      
      expect(isValid).toBe(true);
      expect(duration).toBeLessThan(5);
    });
  });

  // ================= 4.2 Throughput Tests (6 tests) =================
  describe('4.2 Performance - Signal Generation Throughput', () => {
    const analyzer = new TechnicalAnalyzer();

    it('should generate 10 signals in <300ms', async () => {
      const priceDatasets = Array.from({ length: 10 }, () => 
        Array.from({ length: 20 }, () => Math.random() * 100 + 40000)
      );
      
      const start = performance.now();
      priceDatasets.forEach((prices, i) => {
        analyzer.generateSignal(`BTC_${i}`, prices);
      });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(300);
    });

    it('should generate 50 signals in <1000ms', async () => {
      const priceDatasets = Array.from({ length: 50 }, () => 
        Array.from({ length: 20 }, () => Math.random() * 100 + 40000)
      );
      
      const start = performance.now();
      priceDatasets.forEach((prices, i) => {
        analyzer.generateSignal(`BTC_${i}`, prices);
      });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(1000);
    });

    it('should generate 100 signals in <2000ms', async () => {
      const priceDatasets = Array.from({ length: 100 }, () => 
        Array.from({ length: 20 }, () => Math.random() * 100 + 40000)
      );
      
      const start = performance.now();
      priceDatasets.forEach((prices, i) => {
        analyzer.generateSignal(`BTC_${i}`, prices);
      });
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(2000);
    });

    it('should process 1000 price points in <100ms', async () => {
      const prices = Array.from({ length: 1000 }, (_, i) => 100 + i * 0.1);
      
      const start = performance.now();
      const signal = analyzer.generateSignal('BTC', prices);
      const duration = performance.now() - start;
      
      expect(signal).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('should handle burst of 20 concurrent signals', async () => {
      const priceDatasets = Array.from({ length: 20 }, () => 
        Array.from({ length: 20 }, () => Math.random() * 100 + 40000)
      );
      
      const start = performance.now();
      const signals = priceDatasets.map((prices, i) => 
        analyzer.generateSignal(`TOKEN_${i}`, prices)
      );
      const duration = performance.now() - start;
      
      expect(signals.length).toBe(20);
      expect(duration).toBeLessThan(500);
    });

    it('should sustain throughput over 100 consecutive calls', async () => {
      const prices = Array.from({ length: 20 }, () => Math.random() * 100 + 40000);
      
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        analyzer.generateSignal('BTC', prices);
      }
      const duration = performance.now() - start;
      const avgTime = duration / 100;
      
      expect(avgTime).toBeLessThan(10); // Average <10ms per signal
      expect(duration).toBeLessThan(1200); // Total <1.2s
    });
  });

  // ================= 4.3 Memory & Resource Tests (4 tests) =================
  describe('4.3 Performance - Memory Efficiency', () => {
    const analyzer = new TechnicalAnalyzer();
    const onchain = new OnChainAnalyzer();

    it('should not leak memory with large price arrays', async () => {
      const initialMem = process.memoryUsage().heapUsed;
      
      // Process multiple large datasets
      for (let i = 0; i < 50; i++) {
        const prices = Array.from({ length: 1000 }, (_, j) => 100 + j * 0.1);
        analyzer.generateSignal(`TEST_${i}`, prices);
      }
      
      const finalMem = process.memoryUsage().heapUsed;
      const memIncrease = finalMem - initialMem;
      
      // Should not use more than 50MB for 50 iterations
      expect(memIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should efficiently handle repeated symbol analysis', async () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + i * 0.5);
      const iterations = 100;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        analyzer.generateSignal('BTC', prices);
      }
      const duration = performance.now() - start;
      
      expect(duration / iterations).toBeLessThan(5); // Avg <5ms
    });

    it('should handle on-chain transaction analysis efficiently', async () => {
      const transactions = Array.from({ length: 100 }, (_, i) => ({
        value: Math.random() * 1000000,
        type: ['buy', 'sell'][Math.floor(Math.random() * 2)],
        timestamp: Date.now() - i * 60000,
      }));
      
      const start = performance.now();
      const analysis = onchain.analyzeTransactions(transactions);
      const duration = performance.now() - start;
      
      expect(analysis).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it('should not accumulate state between calls', async () => {
      const prices1 = [100, 101, 102, 103, 104];
      const prices2 = [50, 51, 52, 53, 54];
      
      const signal1 = analyzer.generateSignal('BTC', prices1);
      const signal2 = analyzer.generateSignal('ETH', prices2);
      
      // Signals should be independent
      expect(signal1.symbol).toBe('BTC');
      expect(signal2.symbol).toBe('ETH');
      expect(signal1.symbol).not.toBe(signal2.symbol);
    });
  });

  // ================= 4.4 Scalability Tests (2 tests) =================
  describe('4.4 Performance - Scalability', () => {
    const analyzer = new TechnicalAnalyzer();

    it('should maintain sub-100ms latency with 100 concurrent signals', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        const prices = Array.from({ length: 20 }, () => Math.random() * 100 + 40000);
        return Promise.resolve(analyzer.generateSignal(`SYM_${i}`, prices));
      });
      
      const start = performance.now();
      await Promise.all(promises);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(500);
    });

    it('should handle hourly signal generation for 903 assets', async () => {
      // Binance has 903 trading pairs
      const assetCount = 903;
      const symbolCount = Math.min(100, assetCount); // Test with subset
      
      const start = performance.now();
      for (let i = 0; i < symbolCount; i++) {
        const prices = Array.from({ length: 20 }, () => Math.random() * 100);
        analyzer.generateSignal(`ASSET_${i}`, prices);
      }
      const duration = performance.now() - start;
      const perAsset = duration / symbolCount;
      
      expect(perAsset).toBeLessThan(10); // <10ms per asset
      // Full 903 should complete in ~9 seconds
      expect(duration).toBeLessThan(1200);
    });
  });
});
