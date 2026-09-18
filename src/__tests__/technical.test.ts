/**
 * Technical Analyzer Tests
 * Validates RSI, MACD, SMA calculations and signal generation
 */

import TechnicalAnalyzer from '../src/analyzers/technical';

describe('TechnicalAnalyzer', () => {
  
  // Mock price data (90 days)
  const mockPrices = [
    27000, 27150, 27300, 27200, 27450, 27600, 27500, 27700, 27900, 28100,
    28200, 28050, 28300, 28400, 28250, 28500, 28600, 28700, 28550, 28900,
    29000, 28800, 29100, 29300, 29200, 29450, 29600, 29500, 29800, 30000,
    30200, 30100, 30300, 30500, 30400, 30650, 30700, 30800, 30900, 31000,
    31200, 31100, 31300, 31400, 31250, 31500, 31600, 31700, 31600, 31800,
    31900, 32000, 32100, 32200, 32300, 32500, 32400, 32600, 32700, 32800,
    32900, 33000, 33100, 33200, 33150, 33300, 33400, 33300, 33500, 33600,
    33700, 33800, 33900, 34000, 34100, 34200, 34300, 34400, 34500, 34600,
    34700, 34800, 34900, 35000, 35100, 35200, 35300, 35400, 35500, 35600,
    35700, 35800, 35900, 36000, 36100, 36200, 36300, 36400, 36500, 36600
  ];

  describe('calculateRSI', () => {
    test('should calculate RSI correctly', () => {
      const rsi = TechnicalAnalyzer.calculateRSI(mockPrices, 14);
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    test('should return 0 for insufficient data', () => {
      const rsi = TechnicalAnalyzer.calculateRSI([100, 101, 102], 14);
      expect(rsi).toBe(0);
    });

    test('RSI should be higher in uptrend', () => {
      const uptrend = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
      const rsi = TechnicalAnalyzer.calculateRSI(uptrend, 14);
      expect(rsi).toBeGreaterThan(50);
    });

    test('RSI should be lower in downtrend', () => {
      const downtrend = [115, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100];
      const rsi = TechnicalAnalyzer.calculateRSI(downtrend, 14);
      expect(rsi).toBeLessThan(50);
    });
  });

  describe('calculateMACD', () => {
    test('should calculate MACD with histogram', () => {
      const macd = TechnicalAnalyzer.calculateMACD(mockPrices);
      expect(macd).toHaveProperty('macdLine');
      expect(macd).toHaveProperty('signalLine');
      expect(macd).toHaveProperty('histogram');
    });

    test('should return numbers', () => {
      const macd = TechnicalAnalyzer.calculateMACD(mockPrices);
      expect(typeof macd.macdLine).toBe('number');
      expect(typeof macd.signalLine).toBe('number');
      expect(typeof macd.histogram).toBe('number');
    });
  });

  describe('calculateSMA', () => {
    test('should calculate SMA-20 correctly', () => {
      const sma20 = TechnicalAnalyzer.calculateSMA(mockPrices, 20);
      expect(sma20).toBeGreaterThan(0);
      expect(sma20).toBeLessThan(Math.max(...mockPrices) + 1000);
    });

    test('should calculate SMA-50 correctly', () => {
      const sma50 = TechnicalAnalyzer.calculateSMA(mockPrices, 50);
      expect(sma50).toBeGreaterThan(0);
    });

    test('should calculate SMA-200 correctly', () => {
      const sma200 = TechnicalAnalyzer.calculateSMA(mockPrices, 200);
      expect(sma200).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 for insufficient data', () => {
      const sma = TechnicalAnalyzer.calculateSMA([100, 101], 20);
      expect(sma).toBe(0);
    });

    test('SMA should be between min and max', () => {
      const sma = TechnicalAnalyzer.calculateSMA(mockPrices, 20);
      const min = Math.min(...mockPrices.slice(-20));
      const max = Math.max(...mockPrices.slice(-20));
      expect(sma).toBeGreaterThanOrEqual(min);
      expect(sma).toBeLessThanOrEqual(max);
    });
  });

  describe('analyzeTrend', () => {
    test('should detect uptrend', () => {
      const sma20 = 34000;
      const sma50 = 33500;
      const sma200 = 33000;
      const price = 34500;
      
      const trend = TechnicalAnalyzer.analyzeTrend([price], sma20, sma50, sma200);
      expect(trend).toBe('UPTREND');
    });

    test('should detect downtrend', () => {
      const sma20 = 30000;
      const sma50 = 31000;
      const sma200 = 32000;
      const price = 29500;
      
      const trend = TechnicalAnalyzer.analyzeTrend([price], sma20, sma50, sma200);
      expect(trend).toBe('DOWNTREND');
    });

    test('should detect sideways', () => {
      const sma20 = 30000;
      const sma50 = 30100;
      const sma200 = 29900;
      const price = 30050;
      
      const trend = TechnicalAnalyzer.analyzeTrend([price], sma20, sma50, sma200);
      expect(trend).toBe('SIDEWAYS');
    });
  });

  describe('generateSignal', () => {
    test('should generate STRONG_BUY when oversold with bullish MACD', () => {
      const signal = TechnicalAnalyzer.generateSignal({
        rsi: 25,
        macd: { macdLine: 50, signalLine: 40, histogram: 10 },
        trend: 'UPTREND',
        price: 35000,
        sma20: 34500,
        sma50: 34000,
        volume24h: 750000000,
        volumeAvg: 500000000
      });

      expect(signal.signal).toBe('STRONG_BUY');
      expect(signal.confidence).toBeGreaterThan(70);
    });

    test('should generate STRONG_SELL when overbought with bearish MACD', () => {
      const signal = TechnicalAnalyzer.generateSignal({
        rsi: 75,
        macd: { macdLine: 30, signalLine: 40, histogram: -10 },
        trend: 'DOWNTREND',
        price: 35000,
        sma20: 34500,
        sma50: 34000,
        volume24h: 750000000,
        volumeAvg: 500000000
      });

      expect(signal.signal).toBe('STRONG_SELL');
      expect(signal.confidence).toBeGreaterThan(70);
    });

    test('should include reasons in signal', () => {
      const signal = TechnicalAnalyzer.generateSignal({
        rsi: 28,
        macd: { macdLine: 50, signalLine: 40, histogram: 10 },
        trend: 'UPTREND',
        price: 35000,
        sma20: 34500,
        sma50: 34000,
        volume24h: 750000000,
        volumeAvg: 500000000
      });

      expect(signal.reasons.length).toBeGreaterThan(0);
      expect(signal.reasons[0]).toBeTruthy();
    });
  });
});
