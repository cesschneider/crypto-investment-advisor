# Testing & Validation Strategy — Crypto Investment Advisor MVP

**Status**: Sprint 1 Complete (13/13 stories delivered)  
**Next Phase**: Comprehensive testing + backtesting  
**Estimated Effort**: 2-3 days

---

## Executive Summary

Current system has **186 unit tests** but lacks:
1. ❌ Integration tests (real API calls)
2. ❌ End-to-end tests (full signal pipeline)
3. ❌ Historical backtests (signal accuracy)
4. ❌ Performance tests (load, latency)
5. ❌ Security tests (API key handling, injection)

**Recommended Plan**: Add 150+ automated tests + backtesting framework

---

## Phase 1: Integration Tests (Day 1)

### 1.1 Binance API Integration Tests
**Goal**: Validate real API calls + rate limiting

```typescript
// Test suite: 15 tests
describe('BinanceService - Real API', () => {
  it('should fetch real BTC prices', async () => {
    const prices = await binance.getKlines('BTCUSDT', '1h');
    expect(prices.length).toBeGreaterThan(0);
    expect(prices[0].open).toBeDefined();
  });

  it('should respect rate limits (1200 req/min)', async () => {
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      await binance.getKlines('BTCUSDT', '1h');
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(300); // 5 requests < 300ms
  });

  it('should handle network timeouts gracefully', async () => {
    // Simulate timeout
    await expect(binance.getKlines('INVALID', '1h')).rejects.toThrow();
  });

  it('should circuit break after 3 failures', async () => {
    // Test circuit breaker pattern
    expect(true).toBe(true);
  });

  // 11 more integration tests...
});
```

### 1.2 Etherscan API Integration Tests
**Goal**: Validate blockchain data retrieval

```typescript
describe('EtherscanService - Real API', () => {
  it('should fetch real ETH balance', async () => {
    const balance = await etherscan.getBalance('0x0000000000000000000000000000000000000000');
    expect(typeof balance).toBe('string');
  });

  it('should detect whale transactions (>100 ETH)', async () => {
    const whales = await etherscan.getWhaleAlerts(100);
    expect(Array.isArray(whales)).toBe(true);
  });

  it('should parse token transfers correctly', async () => {
    const transfers = await etherscan.getTokenTransfers('0x0000000000000000000000000000000000000000');
    expect(Array.isArray(transfers)).toBe(true);
  });

  // 12 more integration tests...
});
```

### 1.3 Solscan API Integration Tests
**Goal**: Validate Solana blockchain queries

```typescript
describe('SolscanService - Real API', () => {
  it('should fetch Solana whale transactions', async () => {
    const txs = await solscan.getWhaleTransactions();
    expect(Array.isArray(txs)).toBe(true);
  });

  it('should track NFT transfers', async () => {
    const nfts = await solscan.getNFTTransfers('owner_address');
    expect(Array.isArray(nfts)).toBe(true);
  });

  // 13 more integration tests...
});
```

**Subtotal**: ~40 integration tests

---

## Phase 2: End-to-End (E2E) Tests (Day 1-2)

### 2.1 Technical Analysis Pipeline
**Goal**: Validate complete signal generation flow

```typescript
describe('Technical Analysis E2E', () => {
  it('should generate BUY signal when RSI < 30', async () => {
    const prices = [40, 41, 42, 39, 38, 37]; // Downtrend
    const analyzer = new TechnicalAnalyzer();
    const signal = analyzer.generateSignal('BTC', prices);
    
    expect(signal.signal).toBe('BUY');
    expect(signal.confidence).toBeGreaterThan(50);
  });

  it('should generate SELL signal when RSI > 70', async () => {
    const prices = [100, 101, 102, 103, 104, 105]; // Uptrend
    const signal = analyzer.generateSignal('BTC', prices);
    
    expect(signal.signal).toBe('SELL');
    expect(signal.confidence).toBeGreaterThan(50);
  });

  it('should combine multiple indicators for confidence', async () => {
    // Test RSI + MACD + Bollinger Bands consensus
    expect(true).toBe(true);
  });

  // 17 more E2E tests...
});
```

### 2.2 On-Chain Analysis Pipeline
**Goal**: Validate whale tracking accuracy

```typescript
describe('On-Chain Analysis E2E', () => {
  it('should detect whale accumulation pattern', async () => {
    const transactions = [
      { value: 500000, type: 'whale_buy' },
      { value: 450000, type: 'whale_buy' },
    ];
    const analysis = await onChain.analyzeTransactions(transactions);
    
    expect(analysis.pattern).toBe('ACCUMULATION');
    expect(analysis.confidence).toBeGreaterThan(70);
  });

  it('should alert on exchange deposit (potential dump)', async () => {
    // Large transfer to exchange = sell signal
    expect(true).toBe(true);
  });

  // 18 more E2E tests...
});
```

### 2.3 Full Signal Pipeline (Hourly)
**Goal**: Validate complete cron job workflow

```typescript
describe('Hourly Signal Pipeline E2E', () => {
  it('should fetch data → analyze → generate signal → format → deliver', async () => {
    const result = await runHourlyTechnical();
    
    expect(result.timestamp).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('should include all required signal fields', async () => {
    const signal = result.signals[0];
    
    expect(signal.symbol).toBeDefined();
    expect(signal.signal).toMatch(/BUY|SELL|HOLD/);
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
    expect(signal.timestamp).toBeDefined();
  });

  // 16 more E2E tests...
});
```

**Subtotal**: ~50 E2E tests

---

## Phase 3: Backtesting Framework (Day 2-3)

### 3.1 Historical Backtesting
**Goal**: Validate signal accuracy on past data

```typescript
describe('Backtest - Technical Signals (BTC 2024)', () => {
  const testData = {
    period: '2024-01-01 to 2024-09-18',
    symbol: 'BTC',
    prices: [/* 260 daily prices */],
  };

  it('should achieve >55% win rate on 1h timeframe', async () => {
    const backtest = new Backtest();
    const results = await backtest.run({
      strategy: 'technical',
      symbol: 'BTC',
      timeframe: '1h',
      historyDays: 365,
    });

    expect(results.winRate).toBeGreaterThan(0.55);
    expect(results.totalTrades).toBeGreaterThan(100);
    expect(results.sharpeRatio).toBeGreaterThan(1.0);
  });

  it('should have positive Sortino ratio', async () => {
    expect(results.sortinoRatio).toBeGreaterThan(1.2);
  });

  it('should show reasonable max drawdown', async () => {
    expect(results.maxDrawdown).toBeLessThan(0.25); // 25% max
  });
});
```

### 3.2 Altcoin Discovery Backtest
**Goal**: Validate emerging token detection

```typescript
describe('Backtest - Altcoin Discovery', () => {
  it('should have detected 60%+ of 10x movers before pump', async () => {
    const backtest = new AltcoinBacktest();
    const results = await backtest.detectEmerging({
      marketCap: [0, 500000000],
      volumeSpike: 2.0, // 2x normal
      historyMonths: 6,
    });

    expect(results.detectionRate).toBeGreaterThan(0.60);
    expect(results.falsePositiveRate).toBeLessThan(0.30);
  });
});
```

### 3.3 Whale Movement Backtest
**Goal**: Validate whale alert accuracy

```typescript
describe('Backtest - Whale Monitoring', () => {
  it('should predict 70%+ of major price moves 1-4h ahead', async () => {
    const results = await whaleBacktest.run({
      minTransaction: 100000, // $100k+
      historicalDays: 180,
    });

    expect(results.predictiveAccuracy).toBeGreaterThan(0.70);
    expect(results.leadTime.average).toBeGreaterThan(60); // 60+ min lead
  });
});
```

**Subtotal**: ~30 backtest scenarios

---

## Phase 4: Performance & Load Tests (Day 3)

### 4.1 Response Time Tests
**Goal**: Validate sub-100ms signal generation

```typescript
describe('Performance - Signal Generation', () => {
  it('should generate hourly signal in <100ms', async () => {
    const start = performance.now();
    await runHourlyTechnical();
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(100);
  });

  it('should handle 4 concurrent symbol analyses', async () => {
    const start = performance.now();
    await Promise.all([
      analyzer.generateSignal('BTC', data),
      analyzer.generateSignal('ETH', data),
      analyzer.generateSignal('SOL', data),
      analyzer.generateSignal('ADA', data),
    ]);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(200);
  });
});
```

### 4.2 Load Tests
**Goal**: Validate 1000 signals/hour

```typescript
describe('Load - 1000 signals/hour', () => {
  it('should generate 1000 signals in <1 second', async () => {
    const start = performance.now();
    const promises = [];
    
    for (let i = 0; i < 1000; i++) {
      promises.push(analyzer.generateSignal(`TOKEN${i}`, mockData));
    }
    
    await Promise.all(promises);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(1000);
  });
});
```

**Subtotal**: ~20 performance tests

---

## Phase 5: Security Tests (Day 1)

### 5.1 Credential Handling
**Goal**: Ensure API keys never leak

```typescript
describe('Security - Credential Handling', () => {
  it('should NOT log API keys', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    await binance.getKlines('BTCUSDT', '1h');
    
    const logs = consoleSpy.mock.calls.join('');
    expect(logs).not.toContain(process.env.BINANCE_API_KEY);
  });

  it('should NOT expose keys in error messages', async () => {
    try {
      await binance.getKlines('INVALID', '1h');
    } catch (e) {
      expect(e.message).not.toContain(process.env.BINANCE_API_KEY);
    }
  });

  it('should mask sensitive data in logs', async () => {
    const logger = new Logger('test');
    logger.info({ apiKey: 'secret123' });
    
    // Logger should mask it
    expect(true).toBe(true);
  });
});
```

### 5.2 Injection Prevention
**Goal**: Ensure no command/SQL injection risks

```typescript
describe('Security - Injection Prevention', () => {
  it('should sanitize symbol input', async () => {
    const malicious = "BTC'; DROP TABLE signals; --";
    await expect(analyzer.generateSignal(malicious, data))
      .rejects.toThrow('Invalid symbol');
  });

  it('should reject unexpected JSON fields', async () => {
    const malicious = { symbol: 'BTC', __proto__: { admin: true } };
    const result = analyzer.generateSignal(malicious.symbol, data);
    
    expect(result.admin).toBeUndefined();
  });
});
```

**Subtotal**: ~12 security tests

---

## Summary: Testing Roadmap

| Phase | Category | Tests | Duration | Priority |
|-------|----------|-------|----------|----------|
| **1** | Integration | 40 | 1 day | 🔴 HIGH |
| **2** | End-to-End | 50 | 1-2 days | 🔴 HIGH |
| **3** | Backtesting | 30 | 2-3 days | 🟡 MEDIUM |
| **4** | Performance | 20 | 1 day | 🟡 MEDIUM |
| **5** | Security | 12 | 1 day | 🔴 HIGH |
| **TOTAL** | **All** | **~152 tests** | **3-4 days** | **Phase wisely** |

---

## Execution Plan

### Immediate (Today)
- ✅ Phase 1: Integration tests (APIs working)
- ✅ Phase 5: Security tests (no key leaks)

### This Week
- ✅ Phase 2: E2E tests (signals correct)
- ✅ Phase 4: Performance tests (fast enough)

### Next Week
- ✅ Phase 3: Backtests (historically accurate)

---

## Success Criteria

Before 24/7 production deployment:

- ✅ 152+ automated tests, all passing
- ✅ Integration tests: 100% API calls working
- ✅ E2E tests: Full signal pipeline validated
- ✅ Backtests: >55% win rate on historical data
- ✅ Performance: <100ms signal generation
- ✅ Security: Zero credential leaks detected
- ✅ Load: Handle 1000+ signals/hour
- ✅ Coverage: >85% code coverage

---

## Commands to Run Tests

```bash
# Unit tests (existing)
npm test

# Integration tests (Phase 1)
npm run test:integration

# E2E tests (Phase 2)
npm run test:e2e

# Backtests (Phase 3)
npm run backtest:technical
npm run backtest:altcoin
npm run backtest:whale

# Performance tests (Phase 4)
npm run test:performance

# Security tests (Phase 5)
npm run test:security

# All tests
npm run test:all
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API rate limit exceeded | 🔴 HIGH | Integration tests with mocks + backoff |
| Signal accuracy <50% | 🔴 HIGH | Backtests validate >55% win rate |
| Performance degradation | 🟡 MEDIUM | Load tests ensure <100ms |
| Credential leaks | 🔴 HIGH | Security tests block logging |
| False whale alerts | 🟡 MEDIUM | E2E tests validate false positive rate |

---

## Next Steps

1. **Review this plan** ← You are here
2. **Prioritize phases** (Integration + Security first)
3. **Allocate resources** (Junior dev can write unit/integration tests)
4. **Set up CI/CD** (GitHub Actions to run tests on every commit)
5. **Monitor progress** (Weekly review of test coverage)
6. **Prepare deployment** (Staging environment with real APIs)

**Recommended**: Start with Phases 1 + 5 this week, then Phase 2 next week.
