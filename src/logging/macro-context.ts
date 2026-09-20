/**
 * Macro Economic Context Collector
 * 
 * Captures US economic indicators and market conditions for each trade decision
 * Enables later analysis of strategy performance in different macro environments
 */

import * as fs from 'fs';
import * as path from 'path';

export interface MacroContext {
  timestamp: string;
  
  // US Economic Indicators (based on latest data)
  usEconomicIndicators: {
    fedFundsRate: number; // Current Fed Rate target
    inflationRate: number; // Latest CPI YoY
    unemploymentRate: number; // Latest unemployment
    gdpGrowth: number; // Latest GDP growth rate
    dollarIndex: number; // DXY - US Dollar Index
    treasuryYield10y: number; // 10-year Treasury yield
    treasuryYield2y: number; // 2-year Treasury yield
    stocksDirection: 'UP' | 'DOWN' | 'FLAT'; // S&P 500 trend
    expectedFedDecision: string; // "HIKE" | "PAUSE" | "CUT"
  };
  
  // Global Market Sentiment
  globalMarketSentiment: {
    riskSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    vixLevel: number; // Volatility Index
    cryptoMarketSentiment: string; // "BULLISH" | "BEARISH" | "NEUTRAL"
    equityMarketTrend: string; // "BULLISH" | "BEARISH" | "RANGING"
    tradingVolume: 'HIGH' | 'NORMAL' | 'LOW';
  };
  
  // Economic Calendar (upcoming events)
  economicCalendar: {
    nextMajorEvent: {
      name: string;
      date: string;
      expectedImpact: 'HIGH' | 'MEDIUM' | 'LOW';
      forecast: string;
      previous: string;
    } | null;
    thisWeek: Array<{
      name: string;
      date: string;
      expectedImpact: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
  };
  
  // Crypto-Specific Context
  cryptoContext: {
    bitcoinDominance: number; // BTC dominance %
    totalCryptoMarketCap: number; // in billions USD
    bitcoinPrice: number; // BTC price
    ethereumPrice: number; // ETH price
    stablecoinFundingRate: number; // Average funding rate
    defiTotalLocked: number; // Total value locked in DeFi (billions)
  };
  
  // Scenario Classification (for later backtesting)
  scenario: {
    macroScenario: 'GROWTH' | 'STAGFLATION' | 'DEFLATION' | 'RECOVERY' | 'UNCERTAINTY';
    riskEnvironment: 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'EXTREME_RISK';
    cryptoPhase: 'ACCUMULATION' | 'BULL_RUN' | 'DISTRIBUTION' | 'BEAR_MARKET' | 'BOTTOM';
  };
  
  // Notes
  contextNotes: string;
}

export class MacroContextCollector {
  private dataDir: string;
  private contextFile: string;
  
  constructor(dataDir: string = '/tmp/crypto-advisor-paper-trading') {
    this.dataDir = dataDir;
    this.contextFile = path.join(dataDir, 'macro-context.jsonl');
  }
  
  /**
   * Save macro context snapshot
   */
  saveContext(context: MacroContext): void {
    try {
      if (!context.timestamp) {
        context.timestamp = new Date().toISOString();
      }
      
      const logEntry = JSON.stringify(context);
      fs.appendFileSync(this.contextFile, logEntry + '\n', 'utf-8');
      
      console.log(`[MACRO CONTEXT] Saved snapshot at ${context.timestamp}`);
    } catch (error) {
      console.error(`[MACRO CONTEXT ERROR] Failed to save context:`, error);
    }
  }
  
  /**
   * Get current macro context (latest saved)
   */
  getLatestContext(): MacroContext | null {
    try {
      const content = fs.readFileSync(this.contextFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      if (lines.length === 0) return null;
      
      return JSON.parse(lines[lines.length - 1]);
    } catch (error) {
      console.error(`[ERROR] Failed to get latest context:`, error);
      return null;
    }
  }
  
  /**
   * Get macro context at specific time
   */
  getContextAtTime(timestamp: string): MacroContext | null {
    try {
      const targetTime = new Date(timestamp).getTime();
      const content = fs.readFileSync(this.contextFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let closestContext: MacroContext | null = null;
      let closestDiff = Infinity;
      
      for (const line of lines) {
        const context: MacroContext = JSON.parse(line);
        const contextTime = new Date(context.timestamp).getTime();
        const diff = Math.abs(contextTime - targetTime);
        
        if (diff < closestDiff) {
          closestDiff = diff;
          closestContext = context;
        }
      }
      
      return closestContext;
    } catch (error) {
      console.error(`[ERROR] Failed to get context at time:`, error);
      return null;
    }
  }
  
  /**
   * Classify current macro scenario
   */
  classifyScenario(context: MacroContext): MacroContext['scenario'] {
    const indicators = context.usEconomicIndicators;
    const sentiment = context.globalMarketSentiment;
    
    // Determine macro scenario
    let macroScenario: MacroContext['scenario']['macroScenario'];
    if (indicators.inflationRate > 4 && indicators.gdpGrowth < 1) {
      macroScenario = 'STAGFLATION';
    } else if (indicators.inflationRate < 2 && indicators.gdpGrowth < 0) {
      macroScenario = 'DEFLATION';
    } else if (indicators.gdpGrowth > 2.5 && indicators.inflationRate < 3) {
      macroScenario = 'GROWTH';
    } else if (indicators.gdpGrowth < 0 && indicators.inflationRate > 3) {
      macroScenario = 'UNCERTAINTY';
    } else {
      macroScenario = 'RECOVERY';
    }
    
    // Determine risk environment
    let riskEnvironment: MacroContext['scenario']['riskEnvironment'];
    if (sentiment.vixLevel > 40) {
      riskEnvironment = 'EXTREME_RISK';
    } else if (sentiment.vixLevel > 25) {
      riskEnvironment = 'HIGH_RISK';
    } else if (sentiment.vixLevel > 15) {
      riskEnvironment = 'MODERATE_RISK';
    } else {
      riskEnvironment = 'LOW_RISK';
    }
    
    // Determine crypto phase
    let cryptoPhase: MacroContext['scenario']['cryptoPhase'];
    const btcMA = context.cryptoContext.bitcoinPrice; // Simplified
    if (context.cryptoContext.bitcoinDominance > 60) {
      cryptoPhase = 'BULL_RUN';
    } else if (context.cryptoContext.bitcoinDominance > 50) {
      cryptoPhase = 'ACCUMULATION';
    } else if (context.cryptoContext.bitcoinDominance < 30) {
      cryptoPhase = 'BEAR_MARKET';
    } else {
      cryptoPhase = 'DISTRIBUTION';
    }
    
    return {
      macroScenario,
      riskEnvironment,
      cryptoPhase,
    };
  }
  
  /**
   * Export macro context history for analysis
   */
  exportContextHistory(startDate?: string, endDate?: string) {
    try {
      const content = fs.readFileSync(this.contextFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      let contexts: MacroContext[] = lines.map(line => JSON.parse(line));
      
      if (startDate && endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        contexts = contexts.filter(ctx => {
          const ctxTime = new Date(ctx.timestamp).getTime();
          return ctxTime >= start && ctxTime <= end;
        });
      }
      
      return contexts;
    } catch (error) {
      console.error(`[ERROR] Failed to export context history:`, error);
      return [];
    }
  }
}

export default MacroContextCollector;
