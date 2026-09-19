/**
 * Paper Trading Performance Dashboard
 * Generates comprehensive reports on paper trading performance
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalReturn: number;
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  avgWinSize: number;
  avgLossSize: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpeRatio: number;
  openPositions: number;
  closedPositions: number;
}

export class PerformanceDashboard {
  private resultsDir: string = '/tmp/crypto-advisor-paper-trading';

  /**
   * Load all paper trading results
   */
  loadResults(): any[] {
    const files = fs.readdirSync(this.resultsDir).filter(f => f.startsWith('paper-trading-'));
    const allResults: any[] = [];

    for (const file of files) {
      const filePath = path.join(this.resultsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      allResults.push(...data);
    }

    return allResults;
  }

  /**
   * Calculate performance metrics
   */
  calculateMetrics(results: any[]): PerformanceMetrics {
    const trades = results.filter(r => r.tradeExecuted && r.trade);
    const positions = results.flatMap(r => r.portfolio?.positions || []);

    let winTrades = 0;
    let lossTrades = 0;
    let totalPnL = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let realizedPnL = 0;
    let unrealizedPnL = 0;

    // Calculate from results
    for (const result of results) {
      if (result.portfolio) {
        realizedPnL = result.portfolio.realizedPnL;
        unrealizedPnL = result.portfolio.unrealizedPnL;
      }
    }

    // Calculate from closed positions
    for (const position of positions) {
      if (position.status === 'CLOSED' && position.profitLoss !== undefined) {
        totalPnL += position.profitLoss;
        if (position.profitLoss > 0) {
          winTrades++;
          totalWins += position.profitLoss;
        } else {
          lossTrades++;
          totalLosses += Math.abs(position.profitLoss);
        }
      }
    }

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
    const avgWinSize = winTrades > 0 ? totalWins / winTrades : 0;
    const avgLossSize = lossTrades > 0 ? totalLosses / lossTrades : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;

    // Get latest portfolio snapshot
    let latestPortfolio = null;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].portfolio) {
        latestPortfolio = results[i].portfolio;
        break;
      }
    }

    const totalReturn = latestPortfolio ? latestPortfolio.totalReturn : 0;
    const openPositions = latestPortfolio ? latestPortfolio.openPositions : 0;
    const closedPositions = latestPortfolio ? latestPortfolio.closedPositions : 0;

    return {
      totalTrades,
      winTrades,
      lossTrades,
      winRate,
      totalReturn,
      totalPnL: realizedPnL + unrealizedPnL,
      realizedPnL,
      unrealizedPnL,
      avgWinSize,
      avgLossSize,
      maxDrawdown: this.calculateMaxDrawdown(results),
      profitFactor,
      sharpeRatio: this.calculateSharpeRatio(results),
      openPositions,
      closedPositions,
    };
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(results: any[]): number {
    let maxValue = 10000; // Starting capital
    let maxDrawdown = 0;

    for (const result of results) {
      if (result.portfolio) {
        const currentValue = result.portfolio.availableBalance + result.portfolio.positionsValue;
        if (currentValue > maxValue) {
          maxValue = currentValue;
        }
        const drawdown = ((maxValue - currentValue) / maxValue) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate Sharpe Ratio (simplified)
   */
  private calculateSharpeRatio(results: any[]): number {
    const returns: number[] = [];
    let lastValue = 10000;

    for (const result of results) {
      if (result.portfolio) {
        const currentValue = result.portfolio.availableBalance + result.portfolio.positionsValue;
        const dailyReturn = (currentValue - lastValue) / lastValue;
        returns.push(dailyReturn);
        lastValue = currentValue;
      }
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Assume 5% risk-free rate
    const riskFreeRate = 0.05 / 252; // Daily risk-free rate
    return stdDev > 0 ? (mean - riskFreeRate) / stdDev : 0;
  }

  /**
   * Generate HTML dashboard
   */
  generateDashboard(): string {
    const results = this.loadResults();
    const metrics = this.calculateMetrics(results);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Paper Trading Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1e1e1e; color: #fff; margin: 0; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #00ff00; border-bottom: 2px solid #00ff00; padding-bottom: 10px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .metric-card { background: #2d2d2d; padding: 20px; border-radius: 8px; border-left: 4px solid #00ff00; }
    .metric-card.negative { border-left-color: #ff0000; }
    .metric-value { font-size: 28px; font-weight: bold; margin: 10px 0; }
    .metric-label { font-size: 14px; color: #888; }
    .positive { color: #00ff00; }
    .negative { color: #ff0000; }
    .neutral { color: #ffff00; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #2d2d2d; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #444; }
    th { background: #1a1a1a; color: #00ff00; }
    tr:hover { background: #3d3d3d; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .status.open { background: #004d00; }
    .status.closed { background: #4d0000; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Paper Trading Performance Dashboard</h1>
    <p>Generated: ${new Date().toISOString()}</p>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Return</div>
        <div class="metric-value ${metrics.totalReturn >= 0 ? 'positive' : 'negative'}">
          ${metrics.totalReturn.toFixed(2)}%
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total P&L</div>
        <div class="metric-value ${metrics.totalPnL >= 0 ? 'positive' : 'negative'}">
          $${metrics.totalPnL.toFixed(2)}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Win Rate</div>
        <div class="metric-value neutral">${metrics.winRate.toFixed(2)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Profit Factor</div>
        <div class="metric-value neutral">${metrics.profitFactor.toFixed(2)}</div>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Trades</div>
        <div class="metric-value">${metrics.totalTrades}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Win / Loss</div>
        <div class="metric-value">${metrics.winTrades} / ${metrics.lossTrades}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Max Drawdown</div>
        <div class="metric-value negative">${metrics.maxDrawdown.toFixed(2)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Sharpe Ratio</div>
        <div class="metric-value neutral">${metrics.sharpeRatio.toFixed(2)}</div>
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Realized P&L</div>
        <div class="metric-value ${metrics.realizedPnL >= 0 ? 'positive' : 'negative'}">
          $${metrics.realizedPnL.toFixed(2)}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Unrealized P&L</div>
        <div class="metric-value ${metrics.unrealizedPnL >= 0 ? 'positive' : 'negative'}">
          $${metrics.unrealizedPnL.toFixed(2)}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Win</div>
        <div class="metric-value positive">$${metrics.avgWinSize.toFixed(2)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Loss</div>
        <div class="metric-value negative">$${metrics.avgLossSize.toFixed(2)}</div>
      </div>
    </div>

    <h2>Position Summary</h2>
    <p>Open: ${metrics.openPositions} | Closed: ${metrics.closedPositions}</p>

    <h2>Recent Trades</h2>
    <table>
      <tr>
        <th>Time</th>
        <th>Symbol</th>
        <th>Type</th>
        <th>Quantity</th>
        <th>Price</th>
        <th>Confidence</th>
      </tr>
      ${results
        .filter(r => r.trade)
        .slice(-20)
        .map(r => `
        <tr>
          <td>${r.signal.timestamp}</td>
          <td>${r.signal.symbol}</td>
          <td>${r.trade.type}</td>
          <td>${r.trade.quantity.toFixed(8)}</td>
          <td>$${r.trade.price.toFixed(2)}</td>
          <td>${r.trade.signalConfidence.toFixed(0)}%</td>
        </tr>
      `).join('')}
    </table>
  </div>
</body>
</html>
    `;

    return html;
  }

  /**
   * Save dashboard HTML
   */
  saveDashboard(): void {
    const html = this.generateDashboard();
    const dashboardFile = path.join(this.resultsDir, 'dashboard.html');
    fs.writeFileSync(dashboardFile, html);
    console.log(`Dashboard saved to: ${dashboardFile}`);
  }

  /**
   * Print text report
   */
  printReport(): void {
    const results = this.loadResults();
    const metrics = this.calculateMetrics(results);

    console.log('\n' + '='.repeat(80));
    console.log('📊 PAPER TRADING PERFORMANCE REPORT');
    console.log('='.repeat(80));
    console.log(`\nGenerated: ${new Date().toISOString()}`);
    console.log(`Total Signals Processed: ${results.length}`);

    console.log('\n💰 FINANCIAL METRICS');
    console.log(`  Total Return: ${metrics.totalReturn.toFixed(2)}%`);
    console.log(`  Total P&L: $${metrics.totalPnL.toFixed(2)}`);
    console.log(`  Realized P&L: $${metrics.realizedPnL.toFixed(2)}`);
    console.log(`  Unrealized P&L: $${metrics.unrealizedPnL.toFixed(2)}`);

    console.log('\n📈 TRADING STATISTICS');
    console.log(`  Total Trades: ${metrics.totalTrades}`);
    console.log(`  Winning Trades: ${metrics.winTrades} (${metrics.winRate.toFixed(2)}%)`);
    console.log(`  Losing Trades: ${metrics.lossTrades}`);
    console.log(`  Avg Win Size: $${metrics.avgWinSize.toFixed(2)}`);
    console.log(`  Avg Loss Size: $${metrics.avgLossSize.toFixed(2)}`);
    console.log(`  Profit Factor: ${metrics.profitFactor.toFixed(2)}`);

    console.log('\n⚠️  RISK METRICS');
    console.log(`  Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);

    console.log('\n📊 POSITION SUMMARY');
    console.log(`  Open Positions: ${metrics.openPositions}`);
    console.log(`  Closed Positions: ${metrics.closedPositions}`);

    console.log('\n' + '='.repeat(80) + '\n');
  }
}
