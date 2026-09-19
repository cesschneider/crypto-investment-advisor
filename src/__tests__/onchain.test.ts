/**
 * On-Chain Analyzer Tests
 * Validates whale tracking and contract safety
 */

import OnChainAnalyzer from '../analyzers/onchain';

describe('OnChainAnalyzer', () => {

  describe('analyzeHolderConcentration', () => {
    test('should calculate concentration correctly', () => {
      const holders = [
        { TokenHolderQuantity: '1000000' },  // 10%
        { TokenHolderQuantity: '1000000' },  // 10%
        { TokenHolderQuantity: '1000000' },  // 10%
        { TokenHolderQuantity: '1000000' },  // 10%
        { TokenHolderQuantity: '1000000' },  // 10%
        { TokenHolderQuantity: '500000' },   // 5%
        { TokenHolderQuantity: '500000' },   // 5%
        { TokenHolderQuantity: '500000' },   // 5%
        { TokenHolderQuantity: '500000' },   // 5%
        { TokenHolderQuantity: '500000' }    // 5%
      ];

      const result = OnChainAnalyzer.analyzeHolderConcentration(holders);
      
      expect(result.concentration).toBeGreaterThan(0);
      expect(result.concentration).toBeLessThanOrEqual(100);
      expect(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']).toContain(result.riskLevel);
    });

    test('should return HIGH risk when top 10 > 50%', () => {
      const holders = Array(100).fill(null).map((_, i) => ({
        TokenHolderQuantity: i < 10 ? '1000000' : '100000'
      }));

      const result = OnChainAnalyzer.analyzeHolderConcentration(holders);
      expect(result.riskLevel).toMatch(/HIGH|EXTREME/);
    });

    test('should handle empty holders', () => {
      const result = OnChainAnalyzer.analyzeHolderConcentration([]);
      expect(result.concentration).toBe(0);
      expect(result.riskLevel).toBe('UNKNOWN');
    });
  });

  describe('analyzeWhaleMovement', () => {
    test('should detect accumulation trend', () => {
      const transfers = Array(30).fill(null).map((_, i) => ({
        amount: 100,
        usdValue: 50000,
        from: 'exchange',
        to: 'whale',
        isAccumulation: true,
        timestamp: new Date().toISOString()
      }));

      const result = OnChainAnalyzer.analyzeWhaleMovement(transfers);
      expect(result.accumulationScore).toBeGreaterThan(50);
      expect(result.trend).toContain('ACCUMULATION');
    });

    test('should detect distribution trend', () => {
      const transfers = Array(30).fill(null).map((_, i) => ({
        amount: 100,
        usdValue: 50000,
        from: 'whale',
        to: 'exchange',
        isAccumulation: false,
        timestamp: new Date().toISOString()
      }));

      const result = OnChainAnalyzer.analyzeWhaleMovement(transfers);
      expect(result.distributionScore).toBeGreaterThan(50);
      expect(result.trend).toContain('DISTRIBUTION');
    });

    test('should handle empty transfers', () => {
      const result = OnChainAnalyzer.analyzeWhaleMovement([]);
      expect(result.accumulationScore).toBe(0);
      expect(result.distributionScore).toBe(0);
    });
  });

  describe('assessContractSafety', () => {
    test('should mark unverified contracts as unsafe', () => {
      const contractData = { SourceCode: '' };
      const result = OnChainAnalyzer.assessContractSafety(contractData);
      
      expect(result.isVerified).toBe(false);
      expect(result.safetyScore).toBeLessThan(100);
      expect(result.redFlags.length).toBeGreaterThan(0);
    });

    test('should detect mintable contracts', () => {
      const contractData = { 
        SourceCode: 'function mint(uint amount) public onlyOwner { balances[msg.sender] += amount; }'
      };
      const result = OnChainAnalyzer.assessContractSafety(contractData);
      
      expect(result.isMintable).toBe(true);
      expect(result.redFlags.some((f: string) => f.toLowerCase().includes('mint'))).toBe(true);
    });

    test('should handle null contract data', () => {
      const result = OnChainAnalyzer.assessContractSafety(null);
      expect(result.safetyScore).toBe(0);
      expect(result.isVerified).toBe(false);
    });
  });

  describe('analyzeLiquidityPool', () => {
    test('should score high liquidity well', () => {
      const lpData = {
        totalUsd: 2000000,
        unlockedUsd: 500000
      };
      const result = OnChainAnalyzer.analyzeLiquidityPool(lpData);
      
      expect(result.liquidityScore).toBeGreaterThan(50);
      expect(result.risks.length).toBeLessThan(2);
    });

    test('should flag low liquidity', () => {
      const lpData = {
        totalUsd: 50000,
        unlockedUsd: 40000
      };
      const result = OnChainAnalyzer.analyzeLiquidityPool(lpData);
      
      expect(result.liquidityScore).toBeLessThan(70);
      expect(result.risks.some((r: string) => r.includes('$'))).toBe(true);
    });

    test('should flag mostly unlocked liquidity', () => {
      const lpData = {
        totalUsd: 500000,
        unlockedUsd: 400000
      };
      const result = OnChainAnalyzer.analyzeLiquidityPool(lpData);
      
      expect(result.risks.some((r: string) => r.toLowerCase().includes('locked'))).toBe(true);
    });
  });
});
