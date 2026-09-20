/**
 * Comprehensive Operation Logger
 * 
 * Logs every trading decision with full context:
 * - Trade details (entry, exit, P&L)
 * - Signal generation (indicators, confidence)
 * - Market conditions (price, volume, volatility)
 * - Macro context (US economic indicators, market sentiment)
 * - Strategy rationale (why buy/sell at this price)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface OperationLog {
  // Metadata
  timestamp: string;
  operationId: string;
  operationType: 'SIGNAL_GENERATED' | 'TRADE_EXECUTED' | 'POSITION_CLOSED' | 'STRATEGY_DECISION';
  
  // Trade Details
  trade?: {
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    value: number;
    confidence: number;
    reasonForTrade: string;
  };
  
  // Signal Details
  signal?: {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    timestamp: string;
    indicators: {
      rsi: number;
      macd: { macd: number; signal: number; histogram: number };
      bollinger: { upper: number; middle: number; lower: number };
      sma20: number;
      sma50: number;
      ema12: number;
      ema26: number;
    };
    signalRationale: {
      primary: string;
      secondary: string;
      riskFactors: string[];
    };
  };
  
  // Market Conditions (at time of trade)
  marketConditions?: {
    timestamp: string;
    asset: string;
    price: number;
    priceChange24h: number;
    priceChange7d: number;
    volume24h: number;
    marketCap: number;
    volatility: number;
    trendDirection: 'UP' | 'DOWN' | 'RANGING';
    supportLevels: number[];
    resistanceLevels: number[];
  };
  
  // Macro Economic Context
  macroContext?: {
    timestamp: string;
    usEconomicIndicators: {
      fedRateExpectation: string;
      inflationExpectation: string;
      jobsExpectation: string;
      gdpExpectation: string;
      dollarStrength: string;
    };
    globalMarketSentiment: {
      riskSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
      cryptoSentiment: string;
      equitiesDirection: string;
      bondYields: string;
    };
    economicCalendar: {
      importantEventToday: string | null;
      importantEventThisWeek: string[];
    };
  };
  
  // Portfolio State (at time of operation)
  portfolioState?: {
    timestamp: string;
    totalCapital: number;
    availableBalance: number;
    positionsValue: number;
    totalPnL: number;
    unrealizedPnL: number;
    realizedPnL: number;
    openPositions: number;
    closedPositions: number;
    winRate: number;
  };
  
  // Strategy Details
  strategy?: {
    strategyName: string;
    entryRules: string[];
    exitRules: string[];
    positionSizing: string;
    riskManagement: string;
    reasonForThisDecision: string;
  };
  
  // Position Details (for POSITION_CLOSED events)
  positionClosed?: {
    symbol: string;
    entryPrice: number;
    entryTime: string;
    exitPrice: number;
    exitTime: string;
    quantity: number;
    holdingPeriod: string;
    profitLoss: number;
    profitLossPercent: number;
    reason: string;
    entrySignalConfidence: number;
    exitSignalConfidence: number;
  };
  
  // Notes & Analysis
  notes?: string;
  tags?: string[];
}

export class OperationLogger {
  private logDir: string;
  private dailyLogFile: string;
  private allOperationsFile: string;
  
  constructor(dataDir: string = '/tmp/crypto-advisor-paper-trading') {
    this.logDir = path.join(dataDir, 'operations-logs');
    
    // Ensure directories exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    const today = new Date().toISOString().split('T')[0];
    this.dailyLogFile = path.join(this.logDir, `operations-${today}.jsonl`);
    this.allOperationsFile = path.join(this.logDir, 'all-operations.jsonl');
  }
  
  /**
   * Log an operation with full context
   */
  logOperation(operation: OperationLog): void {
    try {
      // Add timestamp if not present
      if (!operation.timestamp) {
        operation.timestamp = new Date().toISOString();
      }
      
      // Generate operation ID if not present
      if (!operation.operationId) {
        operation.operationId = `OP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const logEntry = JSON.stringify(operation);
      
      // Log to daily file
      fs.appendFileSync(this.dailyLogFile, logEntry + '\n', 'utf-8');
      
      // Log to all-operations file
      fs.appendFileSync(this.allOperationsFile, logEntry + '\n', 'utf-8');
      
      console.log(`[OPERATION LOGGED] ${operation.operationId}: ${operation.operationType}`);
    } catch (error) {
      console.error(`[LOGGING ERROR] Failed to log operation:`, error);
    }
  }
  
  /**
   * Log a trade execution with full rationale
   */
  logTradeExecution(params: {
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    confidence: number;
    signal: any;
    marketConditions: any;
    macroContext: any;
    portfolioState: any;
    strategy: any;
    reasonForTrade: string;
  }): void {
    this.logOperation({
      timestamp: new Date().toISOString(),
      operationId: `TRADE-${params.symbol}-${Date.now()}`,
      operationType: 'TRADE_EXECUTED',
      trade: {
        symbol: params.symbol,
        type: params.type,
        quantity: params.quantity,
        price: params.price,
        value: params.quantity * params.price,
        confidence: params.confidence,
        reasonForTrade: params.reasonForTrade,
      },
      signal: params.signal,
      marketConditions: params.marketConditions,
      macroContext: params.macroContext,
      portfolioState: params.portfolioState,
      strategy: params.strategy,
    });
  }
  
  /**
   * Log position closure with performance analysis
   */
  logPositionClosed(params: {
    symbol: string;
    entryPrice: number;
    entryTime: string;
    exitPrice: number;
    exitTime: string;
    quantity: number;
    reason: string;
    entrySignalConfidence: number;
    exitSignalConfidence: number;
    macroContext: any;
    portfolioState: any;
  }): void {
    const holdingPeriodMs = new Date(params.exitTime).getTime() - new Date(params.entryTime).getTime();
    const holdingPeriodHours = Math.floor(holdingPeriodMs / (1000 * 60 * 60));
    const holdingPeriodDays = Math.floor(holdingPeriodHours / 24);
    
    const profitLoss = (params.exitPrice - params.entryPrice) * params.quantity;
    const profitLossPercent = ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100;
    
    this.logOperation({
      timestamp: new Date().toISOString(),
      operationId: `CLOSE-${params.symbol}-${Date.now()}`,
      operationType: 'POSITION_CLOSED',
      positionClosed: {
        symbol: params.symbol,
        entryPrice: params.entryPrice,
        entryTime: params.entryTime,
        exitPrice: params.exitPrice,
        exitTime: params.exitTime,
        quantity: params.quantity,
        holdingPeriod: `${holdingPeriodDays}d ${holdingPeriodHours % 24}h`,
        profitLoss: profitLoss,
        profitLossPercent: profitLossPercent,
        reason: params.reason,
        entrySignalConfidence: params.entrySignalConfidence,
        exitSignalConfidence: params.exitSignalConfidence,
      },
      macroContext: params.macroContext,
      portfolioState: params.portfolioState,
      notes: `Position held for ${holdingPeriodDays} days. Entry confidence: ${params.entrySignalConfidence}%, Exit confidence: ${params.exitSignalConfidence}%`,
      tags: [params.symbol, profitLoss > 0 ? 'WINNING_TRADE' : 'LOSING_TRADE', 'POSITION_CLOSURE'],
    });
  }
  
  /**
   * Log signal generation
   */
  logSignal(params: {
    symbol: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    indicators: any;
    signalRationale: any;
    marketConditions: any;
    macroContext: any;
  }): void {
    this.logOperation({
      timestamp: new Date().toISOString(),
      operationId: `SIGNAL-${params.symbol}-${Date.now()}`,
      operationType: 'SIGNAL_GENERATED',
      signal: {
        symbol: params.symbol,
        action: params.action,
        confidence: params.confidence,
        timestamp: new Date().toISOString(),
        indicators: params.indicators,
        signalRationale: params.signalRationale,
      },
      marketConditions: params.marketConditions,
      macroContext: params.macroContext,
    });
  }
  
  /**
   * Get all operations for a symbol
   */
  getSymbolOperations(symbol: string): OperationLog[] {
    try {
      const content = fs.readFileSync(this.allOperationsFile, 'utf-8');
      const lines = content.trim().split('\n');
      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((op: OperationLog | null): op is OperationLog => op !== null && (op.trade?.symbol === symbol || op.signal?.symbol === symbol || op.positionClosed?.symbol === symbol));
    } catch (error) {
      console.error(`[ERROR] Failed to read operations for ${symbol}:`, error);
      return [];
    }
  }
  
  /**
   * Get all operations within date range
   */
  getOperationsByDateRange(startDate: string, endDate: string): OperationLog[] {
    try {
      const content = fs.readFileSync(this.allOperationsFile, 'utf-8');
      const lines = content.trim().split('\n');
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      
      return lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((op: OperationLog | null): op is OperationLog => {
          if (!op || !op.timestamp) return false;
          const opTime = new Date(op.timestamp).getTime();
          return opTime >= start && opTime <= end;
        });
    } catch (error) {
      console.error(`[ERROR] Failed to read operations by date range:`, error);
      return [];
    }
  }
  
  /**
   * Generate a report of all operations
   */
  generateReport(): {
    totalOperations: number;
    byType: Record<string, number>;
    bySymbol: Record<string, number>;
    winRate: number;
    profitFactor: number;
    totalPnL: number;
    averageHoldingPeriod: string;
  } {
    try {
      const content = fs.readFileSync(this.allOperationsFile, 'utf-8');
      const lines = content.trim().split('\n');
      const operations: OperationLog[] = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter((op: OperationLog | null): op is OperationLog => op !== null);
      
      const byType: Record<string, number> = {};
      const bySymbol: Record<string, number> = {};
      let closedTrades = 0;
      let winningTrades = 0;
      let totalWinPnL = 0;
      let totalLossPnL = 0;
      let totalHoldingPeriodHours = 0;
      
      operations.forEach(op => {
        byType[op.operationType] = (byType[op.operationType] || 0) + 1;
        
        if (op.positionClosed) {
          closedTrades++;
          bySymbol[op.positionClosed.symbol] = (bySymbol[op.positionClosed.symbol] || 0) + 1;
          
          if (op.positionClosed.profitLoss > 0) {
            winningTrades++;
            totalWinPnL += op.positionClosed.profitLoss;
          } else {
            totalLossPnL += Math.abs(op.positionClosed.profitLoss);
          }
          
          // Parse holding period
          const holdingPeriodMatch = op.positionClosed.holdingPeriod.match(/(\d+)d (\d+)h/);
          if (holdingPeriodMatch) {
            const days = parseInt(holdingPeriodMatch[1]);
            const hours = parseInt(holdingPeriodMatch[2]);
            totalHoldingPeriodHours += days * 24 + hours;
          }
        }
      });
      
      const winRate = closedTrades > 0 ? (winningTrades / closedTrades) * 100 : 0;
      const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? Infinity : 0;
      const totalPnL = totalWinPnL - totalLossPnL;
      const averageHoldingHours = closedTrades > 0 ? totalHoldingPeriodHours / closedTrades : 0;
      const averageHoldingDays = Math.floor(averageHoldingHours / 24);
      const averageHoldingRemainingHours = Math.floor(averageHoldingHours % 24);
      
      return {
        totalOperations: operations.length,
        byType,
        bySymbol,
        winRate: Math.round(winRate * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        totalPnL: Math.round(totalPnL * 100) / 100,
        averageHoldingPeriod: `${averageHoldingDays}d ${averageHoldingRemainingHours}h`,
      };
    } catch (error) {
      console.error(`[ERROR] Failed to generate report:`, error);
      return {
        totalOperations: 0,
        byType: {},
        bySymbol: {},
        winRate: 0,
        profitFactor: 0,
        totalPnL: 0,
        averageHoldingPeriod: '0d 0h',
      };
    }
  }
}

export default OperationLogger;
