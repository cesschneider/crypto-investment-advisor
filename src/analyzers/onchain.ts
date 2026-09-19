/**
 * On-Chain Analysis Engine
 * Whale tracking, holder distribution, contract verification
 */

interface WhaleTransfer {
  amount: number;
  usdValue: number;
  from: string;
  to: string;
  isAccumulation: boolean;
  timestamp: string;
}

class OnChainAnalyzer {
  /**
   * Analyze holder concentration
   */
  static analyzeHolderConcentration(holders: any[]): {
    concentration: number;
    riskLevel: string;
    top10Holdings: number;
    top50Holdings: number;
  } {
    if (!holders || holders.length === 0) {
      return { concentration: 0, riskLevel: 'UNKNOWN', top10Holdings: 0, top50Holdings: 0 };
    }

    const sortedHolders = holders.sort((a, b) => 
      parseFloat(b.TokenHolderQuantity) - parseFloat(a.TokenHolderQuantity)
    );

    const totalSupply = sortedHolders.reduce((sum, h) => sum + parseFloat(h.TokenHolderQuantity), 0);

    const top10Holdings = sortedHolders.slice(0, 10)
      .reduce((sum, h) => sum + parseFloat(h.TokenHolderQuantity), 0) / totalSupply * 100;

    const top50Holdings = sortedHolders.slice(0, 50)
      .reduce((sum, h) => sum + parseFloat(h.TokenHolderQuantity), 0) / totalSupply * 100;

    let riskLevel = 'LOW';
    if (top10Holdings > 70) riskLevel = 'EXTREME';
    else if (top10Holdings > 50) riskLevel = 'HIGH';
    else if (top10Holdings > 30) riskLevel = 'MEDIUM';

    return {
      concentration: top10Holdings,
      riskLevel: riskLevel,
      top10Holdings: top10Holdings,
      top50Holdings: top50Holdings
    };
  }

  /**
   * Detect whale movements (accumulation vs distribution)
   */
  static analyzeWhaleMovement(transfers: WhaleTransfer[]): {
    accumulationScore: number;
    distributionScore: number;
    trend: string;
  } {
    if (!transfers || transfers.length === 0) {
      return { accumulationScore: 0, distributionScore: 0, trend: 'NEUTRAL' };
    }

    const recentTransfers = transfers.slice(0, 50); // Last 50 transfers
    
    const accumulation = recentTransfers.filter(t => t.isAccumulation).length;
    const distribution = recentTransfers.filter(t => !t.isAccumulation).length;

    const accumulationScore = (accumulation / recentTransfers.length) * 100;
    const distributionScore = (distribution / recentTransfers.length) * 100;

    let trend = 'NEUTRAL';
    if (accumulationScore > 60) trend = 'ACCUMULATION (BULLISH)';
    else if (distributionScore > 60) trend = 'DISTRIBUTION (BEARISH)';

    return {
      accumulationScore: parseFloat(accumulationScore.toFixed(2)),
      distributionScore: parseFloat(distributionScore.toFixed(2)),
      trend: trend
    };
  }

  /**
   * Assess contract safety and verification
   */
  static assessContractSafety(contractData: any): {
    isVerified: boolean;
    hasRenounced: boolean;
    isMintable: boolean;
    safetyScore: number;
    redFlags: string[];
  } {
    if (!contractData) {
      return {
        isVerified: false,
        hasRenounced: false,
        isMintable: false,
        safetyScore: 0,
        redFlags: ['No contract data available']
      };
    }

    const redFlags: string[] = [];
    let safetyScore = 100;

    // Check if contract is verified
    const isVerified = !!(contractData && contractData.SourceCode && contractData.SourceCode.length > 0);
    if (!isVerified) {
      safetyScore -= 30;
      redFlags.push('Contract not verified on explorer');
    }

    // Check for admin functions (simplified)
    const hasAdminFunctions = contractData && contractData.SourceCode && 
      (contractData.SourceCode.includes('owner') || contractData.SourceCode.includes('admin'));
    if (hasAdminFunctions) {
      redFlags.push('Contract has admin/owner functions');
    }

    // Check for mint function
    const isMintable = contractData && contractData.SourceCode && 
      contractData.SourceCode.includes('mint(');
    if (isMintable) {
      safetyScore -= 15;
      redFlags.push('Contract is mintable (supply can be increased)');
    }

    // Check for proxy pattern (upgradeable = risk)
    const isProxy = contractData && contractData.Proxy === '1';
    if (isProxy) {
      safetyScore -= 20;
      redFlags.push('Contract is upgradeable (proxy pattern)');
    }

    // Check for renounce ownership
    const hasRenounced = !hasAdminFunctions && isVerified;

    return {
      isVerified,
      hasRenounced,
      isMintable,
      safetyScore: Math.max(0, safetyScore),
      redFlags
    };
  }

  /**
   * Analyze liquidity pool security
   */
  static analyzeLiquidityPool(lpData: any): {
    liquidityScore: number;
    unlocked: number;
    locked: number;
    risks: string[];
  } {
    if (!lpData) {
      return { liquidityScore: 0, unlocked: 0, locked: 0, risks: ['No liquidity data'] };
    }

    let liquidityScore = 100;
    const risks: string[] = [];

    const totalLiquidity = lpData.totalUsd || 0;
    const unlockedLiquidity = lpData.unlockedUsd || 0;
    const lockedLiquidity = totalLiquidity - unlockedLiquidity;

    // Check if liquidity is primarily locked
    const lockedPercentage = totalLiquidity > 0 ? (lockedLiquidity / totalLiquidity) * 100 : 0;

    if (lockedPercentage < 50) {
      liquidityScore -= 40;
      risks.push('Less than 50% of liquidity is locked');
    }

    if (totalLiquidity < 100000) {
      liquidityScore -= 50;
      risks.push('Liquidity below $100K (rug pull risk)');
    }

    return {
      liquidityScore: Math.max(0, liquidityScore),
      unlocked: unlockedLiquidity,
      locked: lockedLiquidity,
      risks
    };
  }
}

export default OnChainAnalyzer;
