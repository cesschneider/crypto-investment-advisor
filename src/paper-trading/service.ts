/**
 * Paper Trading Service
 * Executes paper trades on signals and tracks performance
 */

import { PaperTradingPortfolio } from './portfolio';
import * as fs from 'fs';
import * as path from 'path';

export interface SignalExecutionResult {
  signal: {
    symbol: string;
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    price: number;
    timestamp: string;
    indicators: any;
  };
  tradeExecuted: boolean;
  trade?: any;
  portfolio: any;
}

export class PaperTradingService {
  private portfolio: PaperTradingPortfolio;
  private resultsDir: string;
  private currentPrices: Map<string, number> = new Map();

  constructor(initialCapital: number = 10000) {
    this.portfolio = new PaperTradingPortfolio(initialCapital);
    this.resultsDir = '/tmp/crypto-advisor-paper-trading';

    // Create results directory
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }

    console.log(`[PAPER TRADING] Initialized with capital: $${initialCapital}`);
  }

  /**
   * Process signal and execute paper trade
   */
  processSignal(
    symbol: string,
    signal: 'BUY' | 'SELL' | 'HOLD',
    price: number,
    confidence: number,
    timestamp: string,
    indicators: any
  ): SignalExecutionResult {
    // Update current price
    this.currentPrices.set(symbol, price);

    // Execute trade if applicable
    const trade = this.portfolio.executeTrade(symbol, signal, price, confidence, timestamp);
    const tradeExecuted = trade !== null;

    // Get current portfolio state
    const portfolioSnapshot = this.portfolio.getSnapshot(this.currentPrices);

    const result: SignalExecutionResult = {
      signal: {
        symbol,
        signal,
        confidence,
        price,
        timestamp,
        indicators,
      },
      tradeExecuted,
      trade: trade || undefined,
      portfolio: portfolioSnapshot,
    };

    return result;
  }

  /**
   * Process batch of signals (from hourly run)
   */
  async processBatchSignals(signals: any[]): Promise<SignalExecutionResult[]> {
    const results: SignalExecutionResult[] = [];

    for (const signal of signals) {
      const result = this.processSignal(
        signal.symbol,
        signal.signal,
        signal.price,
        signal.confidence,
        signal.timestamp,
        signal.indicators
      );
      results.push(result);
    }

    // Save results
    await this.saveResults(results);

    return results;
  }

  /**
   * Save paper trading results
   */
  private async saveResults(results: SignalExecutionResult[]): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const resultsFile = path.join(this.resultsDir, `paper-trading-${timestamp}.json`);

    // Read existing results if available
    let existingResults: SignalExecutionResult[] = [];
    if (fs.existsSync(resultsFile)) {
      existingResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
    }

    // Append new results
    const allResults = [...existingResults, ...results];
    fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));

    console.log(`[PAPER TRADING] Results saved to ${resultsFile}`);
  }

  /**
   * Generate performance report
   */
  generateReport(): any {
    const positions = this.portfolio.getPositions();
    const trades = this.portfolio.getTradeHistory();
    const currentPrices = new Map(this.currentPrices);
    const snapshot = this.portfolio.getSnapshot(currentPrices);

    const report = {
      timestamp: new Date().toISOString(),
      portfolio: snapshot,
      positions: positions,
      trades: trades,
      summary: {
        totalCapital: snapshot.totalCapital,
        currentValue: snapshot.availableBalance + snapshot.positionsValue,
        totalReturn: `${snapshot.totalReturn.toFixed(2)}%`,
        totalPnL: `$${snapshot.totalPnL.toFixed(2)}`,
        realizedPnL: `$${snapshot.realizedPnL.toFixed(2)}`,
        unrealizedPnL: `$${snapshot.unrealizedPnL.toFixed(2)}`,
        winRate: `${snapshot.winRate.toFixed(2)}%`,
        totalTrades: trades.length,
        openPositions: snapshot.openPositions,
        closedPositions: snapshot.closedPositions,
      },
    };

    return report;
  }

  /**
   * Save performance report
   */
  async saveReport(): Promise<void> {
    const report = this.generateReport();
    const reportFile = path.join(this.resultsDir, 'performance-report.json');

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`[PAPER TRADING] Report saved to ${reportFile}`);
  }
}
