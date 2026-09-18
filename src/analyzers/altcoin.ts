/**
 * Altcoin Discovery & Scoring Engine
 * Identifies new token launches and scores opportunity potential
 */

import OnChainAnalyzer from './onchain';

interface AltcoinData {
  address: string;
  symbol: string;
  name: string;
  launchDate: Date;
  totalSupply: number;
  circulatingSupply: number;
  liquidityUsd: number;
  volume24h: number;
  holders: any[];
  contractData: any;
  lpData: any;
}

class AltcoinAnalyzer {
  /**
   * Calculate overall altcoin opportunity score (0-100)
   */
  static scoreOpportunity(data: AltcoinData): {
    score: number;
    recommendation: string;
    riskLevel: string;
    details: any;
  } {
    const now = new Date();
    const ageDays = (now.getTime() - data.launchDate.getTime()) / (1000 * 60 * 60 * 24);

    // Age score (new tokens are higher potential)
    const ageScore = Math.max(0, 100 - (ageDays * 2));

    // Liquidity score
    const liquidityScore = this.calculateLiquidityScore(data.liquidityUsd);

    // Volume score
    const volumeScore = this.calculateVolumeScore(data.volume24h, data.liquidityUsd);

    // Tokenomics score
    const tokenomicsScore = this.calculateTokenomicsScore(data);

    // Holder concentration score
    const holderScore = this.calculateHolderScore(data.holders);

    // Contract safety
    const contractSafety = OnChainAnalyzer.assessContractSafety(data.contractData);

    // Weighted calculation
    const score = (
      (ageScore * 0.15) +           // 15% - Age
      (liquidityScore * 0.25) +     // 25% - Liquidity
      (volumeScore * 0.15) +        // 15% - Volume trend
      (tokenomicsScore * 0.20) +    // 20% - Tokenomics
      (holderScore * 0.15) +        // 15% - Holder distribution
      (contractSafety.safetyScore * 0.10)  // 10% - Contract safety
    );

    let recommendation = 'AVOID';
    let riskLevel = 'EXTREME';

    if (score >= 80) {
      recommendation = 'STRONG_BUY';
      riskLevel = 'LOW';
    } else if (score >= 65) {
      recommendation = 'BUY';
      riskLevel = 'MEDIUM';
    } else if (score >= 50) {
      recommendation = 'HOLD';
      riskLevel = 'HIGH';
    } else if (score >= 30) {
      riskLevel = 'HIGH';
    }

    return {
      score: parseFloat(score.toFixed(2)),
      recommendation,
      riskLevel,
      details: {
        ageScore: parseFloat(ageScore.toFixed(2)),
        liquidityScore: parseFloat(liquidityScore.toFixed(2)),
        volumeScore: parseFloat(volumeScore.toFixed(2)),
        tokenomicsScore: parseFloat(tokenomicsScore.toFixed(2)),
        holderScore: parseFloat(holderScore.toFixed(2)),
        contractSafetyScore: contractSafety.safetyScore,
        ageDays: parseFloat(ageDays.toFixed(2)),
        contractVerified: contractSafety.isVerified,
        redFlags: contractSafety.redFlags
      }
    };
  }

  /**
   * Score liquidity quality
   */
  private static calculateLiquidityScore(liquidityUsd: number): number {
    if (liquidityUsd < 50000) return 10;
    if (liquidityUsd < 100000) return 30;
    if (liquidityUsd < 500000) return 60;
    if (liquidityUsd < 2000000) return 80;
    return 100;
  }

  /**
   * Score volume relative to liquidity (shows demand)
   */
  private static calculateVolumeScore(volume24h: number, liquidityUsd: number): number {
    if (liquidityUsd === 0) return 0;

    const volumeLiquidityRatio = volume24h / liquidityUsd;

    if (volumeLiquidityRatio > 5) return 100;    // Very active
    if (volumeLiquidityRatio > 2) return 80;     // Active
    if (volumeLiquidityRatio > 1) return 60;     // Moderate
    if (volumeLiquidityRatio > 0.5) return 40;   // Low
    return 20;                                    // Very low
  }

  /**
   * Score tokenomics (supply, distribution, burn)
   */
  private static calculateTokenomicsScore(data: AltcoinData): number {
    let score = 50;

    // Check circulating vs total supply ratio
    const supplyRatio = data.circulatingSupply / data.totalSupply;
    if (supplyRatio > 0.9) score += 20;  // Most supply already in circulation (good for early)
    else if (supplyRatio < 0.3) score -= 20; // Large dilution risk

    // Favor mid-range supplies (avoids pump tokens and whale-heavy distributions)
    if (data.totalSupply > 100000 && data.totalSupply < 10000000000) {
      score += 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score holder distribution (centralization risk)
   */
  private static calculateHolderScore(holders: any[]): number {
    if (!holders || holders.length < 10) return 20;

    const holderAnalysis = OnChainAnalyzer.analyzeHolderConcentration(holders);
    const concentration = holderAnalysis.concentration;

    // Lower concentration is better
    if (concentration < 20) return 95;
    if (concentration < 35) return 80;
    if (concentration < 50) return 60;
    if (concentration < 70) return 40;
    return 10;
  }

  /**
   * Detect if token is a honey pot (cannot sell)
   */
  static checkHoneyPot(contractData: any): boolean {
    if (!contractData || !contractData.SourceCode) return false;

    const redFlags = [
      'require(false',
      'revert',
      'pauseTrading',
      'disableSelling',
      'sellForbidden',
      'noSells'
    ];

    const source = contractData.SourceCode.toLowerCase();
    return redFlags.some(flag => source.includes(flag));
  }

  /**
   * Find breakout signals in altcoin price action
   */
  static analyzeBreakout(prices: number[], lookback: number = 20): {
    isBreakout: boolean;
    breakoutType: string;
    intensity: number;
  } {
    if (prices.length < lookback + 5) {
      return { isBreakout: false, breakoutType: 'NONE', intensity: 0 };
    }

    const historical = prices.slice(0, -lookback);
    const recent = prices.slice(-lookback);

    const highestHigh = Math.max(...historical);
    const lowestLow = Math.min(...historical);
    const currentPrice = recent[recent.length - 1];

    const upBreakout = currentPrice > highestHigh;
    const downBreakout = currentPrice < lowestLow;

    if (!upBreakout && !downBreakout) {
      return { isBreakout: false, breakoutType: 'NONE', intensity: 0 };
    }

    // Calculate intensity (% above/below breakout)
    const intensity = upBreakout 
      ? ((currentPrice - highestHigh) / highestHigh) * 100
      : ((lowestLow - currentPrice) / lowestLow) * 100;

    return {
      isBreakout: true,
      breakoutType: upBreakout ? 'BULLISH' : 'BEARISH',
      intensity: parseFloat(intensity.toFixed(2))
    };
  }
}

export default AltcoinAnalyzer;
