/**
 * Altcoin Analyzer Tests
 * Validates token scoring and opportunity detection
 */

import AltcoinAnalyzer from '../src/analyzers/altcoin';

describe('AltcoinAnalyzer', () => {

  describe('scoreOpportunity', () => {
    test('should score high-quality altcoin well', () => {
      const data = {
        address: '0x123456',
        symbol: 'NEW',
        name: 'New Token',
        launchDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        totalSupply: 1000000000,
        circulatingSupply: 850000000,
        liquidityUsd: 800000,
        volume24h: 500000,
        holders: Array(50).fill(null).map((_, i) => ({
          TokenHolderQuantity: i < 5 ? '100000000' : '10000000'
        })),
        contractData: {
          SourceCode: 'contract code here'
        },
        lpData: {
          totalUsd: 800000,
          unlockedUsd: 200000
        }
      };

      const result = AltcoinAnalyzer.scoreOpportunity(data);
      
      expect(result.score).toBeGreaterThan(50);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['STRONG_BUY', 'BUY', 'HOLD', 'AVOID']).toContain(result.recommendation);
    });

    test('should flag risky new launches', () => {
      const data = {
        address: '0x123456',
        symbol: 'SCAM',
        name: 'Scam Token',
        launchDate: new Date(),
        totalSupply: 1000000000,
        circulatingSupply: 100000000, // Only 10% circulating
        liquidityUsd: 50000, // Very low liquidity
        volume24h: 10000,
        holders: [
          { TokenHolderQuantity: '500000000' }, // 50% in 1 holder
          { TokenHolderQuantity: '300000000' }  // 30% in another
        ],
        contractData: null,
        lpData: {
          totalUsd: 50000,
          unlockedUsd: 40000
        }
      };

      const result = AltcoinAnalyzer.scoreOpportunity(data);
      
      expect(result.score).toBeLessThan(50);
      expect(result.recommendation).toBe('AVOID');
      expect(result.riskLevel).toMatch(/HIGH|EXTREME/);
    });

    test('should include detailed breakdown', () => {
      const data = {
        address: '0x123456',
        symbol: 'NEW',
        name: 'New Token',
        launchDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        totalSupply: 1000000000,
        circulatingSupply: 800000000,
        liquidityUsd: 500000,
        volume24h: 300000,
        holders: Array(50).fill({ TokenHolderQuantity: '5000000' }),
        contractData: { SourceCode: 'code' },
        lpData: { totalUsd: 500000, unlockedUsd: 100000 }
      };

      const result = AltcoinAnalyzer.scoreOpportunity(data);
      
      expect(result.details).toHaveProperty('ageScore');
      expect(result.details).toHaveProperty('liquidityScore');
      expect(result.details).toHaveProperty('tokenomicsScore');
      expect(result.details).toHaveProperty('holderScore');
      expect(result.details).toHaveProperty('ageDays');
    });
  });

  describe('checkHoneyPot', () => {
    test('should detect honey pot contracts', () => {
      const contractData = {
        SourceCode: `
          function transfer(address to, uint amount) public {
            require(false, "transfers disabled");
            // Honey pot - can't sell
          }
        `
      };

      const result = AltcoinAnalyzer.checkHoneyPot(contractData);
      expect(result).toBe(true);
    });

    test('should allow normal contracts', () => {
      const contractData = {
        SourceCode: `
          function transfer(address to, uint amount) public {
            balances[msg.sender] -= amount;
            balances[to] += amount;
            return true;
          }
        `
      };

      const result = AltcoinAnalyzer.checkHoneyPot(contractData);
      expect(result).toBe(false);
    });
  });

  describe('analyzeBreakout', () => {
    test('should detect bullish breakout', () => {
      const prices = Array(25).fill(100); // Historical: all 100
      prices.push(105, 110, 115, 120); // Recent: breaking out

      const result = AltcoinAnalyzer.analyzeBreakout(prices, 20);
      
      expect(result.isBreakout).toBe(true);
      expect(result.breakoutType).toBe('BULLISH');
      expect(result.intensity).toBeGreaterThan(0);
    });

    test('should detect bearish breakout', () => {
      const prices = Array(25).fill(100); // Historical: all 100
      prices.push(95, 90, 85, 80); // Recent: breaking down

      const result = AltcoinAnalyzer.analyzeBreakout(prices, 20);
      
      expect(result.isBreakout).toBe(true);
      expect(result.breakoutType).toBe('BEARISH');
      expect(result.intensity).toBeGreaterThan(0);
    });

    test('should detect no breakout in consolidation', () => {
      const prices = Array(30).fill(100); // All at 100

      const result = AltcoinAnalyzer.analyzeBreakout(prices, 20);
      
      expect(result.isBreakout).toBe(false);
      expect(result.breakoutType).toBe('NONE');
    });

    test('should handle insufficient data', () => {
      const result = AltcoinAnalyzer.analyzeBreakout([100, 101, 102], 20);
      
      expect(result.isBreakout).toBe(false);
      expect(result.breakoutType).toBe('NONE');
    });
  });
});
