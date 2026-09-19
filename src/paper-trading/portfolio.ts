/**
 * Paper Trading Portfolio Manager
 * Simulates trades based on signals without real capital
 */

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  entryTime: string;
  entrySignalConfidence: number;
  exitPrice?: number;
  exitTime?: string;
  exitSignalConfidence?: number;
  profitLoss?: number;
  profitLossPercent?: number;
  status: 'OPEN' | 'CLOSED';
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  timestamp: string;
  signalConfidence: number;
  signalType: 'BUY' | 'SELL' | 'HOLD';
}

export interface PortfolioSnapshot {
  timestamp: string;
  totalCapital: number;
  availableBalance: number;
  positionsValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalPnL: number;
  totalReturn: number;
  openPositions: number;
  closedPositions: number;
  winRate: number;
  trades: Trade[];
}

export class PaperTradingPortfolio {
  private initialCapital: number;
  private availableBalance: number;
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private realizedPnL: number = 0;
  private tradeCounter: number = 0;

  constructor(initialCapital: number = 10000) {
    this.initialCapital = initialCapital;
    this.availableBalance = initialCapital;
  }

  /**
   * Execute a trade based on signal
   */
  executeTrade(
    symbol: string,
    signal: 'BUY' | 'SELL' | 'HOLD',
    currentPrice: number,
    confidence: number,
    timestamp: string
  ): Trade | null {
    // Ignore HOLD signals
    if (signal === 'HOLD') return null;

    // Only execute if confidence >= 70%
    if (confidence < 70) return null;

    const tradeId = `${symbol}-${++this.tradeCounter}`;
    let trade: Trade | null = null;

    if (signal === 'BUY') {
      trade = this.executeBuy(symbol, currentPrice, confidence, timestamp, tradeId);
    } else if (signal === 'SELL') {
      trade = this.executeSell(symbol, currentPrice, confidence, timestamp, tradeId);
    }

    return trade;
  }

  /**
   * Execute BUY order
   */
  private executeBuy(
    symbol: string,
    price: number,
    confidence: number,
    timestamp: string,
    tradeId: string
  ): Trade | null {
    // Allocate 2% of available balance per buy signal
    const allocationPercent = 0.02;
    const investmentAmount = this.availableBalance * allocationPercent;

    if (investmentAmount < 10) {
      // Minimum investment $10
      return null;
    }

    const quantity = investmentAmount / price;
    this.availableBalance -= investmentAmount;

    // Create position
    const position: Position = {
      symbol,
      quantity,
      entryPrice: price,
      entryTime: timestamp,
      entrySignalConfidence: confidence,
      status: 'OPEN',
    };

    this.positions.set(symbol, position);

    // Record trade
    const trade: Trade = {
      id: tradeId,
      symbol,
      type: 'BUY',
      quantity,
      price,
      timestamp,
      signalConfidence: confidence,
      signalType: 'BUY',
    };

    this.trades.push(trade);

    console.log(
      `[PAPER TRADE] BUY ${symbol}: ${quantity.toFixed(8)} @ $${price.toFixed(2)} (Conf: ${confidence.toFixed(0)}%)`
    );

    return trade;
  }

  /**
   * Execute SELL order
   */
  private executeSell(
    symbol: string,
    price: number,
    confidence: number,
    timestamp: string,
    tradeId: string
  ): Trade | null {
    const position = this.positions.get(symbol);

    if (!position || position.status === 'CLOSED') {
      // No open position to sell
      return null;
    }

    // Close position
    const saleValue = position.quantity * price;
    const pnl = saleValue - position.quantity * position.entryPrice;
    const pnlPercent = (pnl / (position.quantity * position.entryPrice)) * 100;

    position.exitPrice = price;
    position.exitTime = timestamp;
    position.exitSignalConfidence = confidence;
    position.profitLoss = pnl;
    position.profitLossPercent = pnlPercent;
    position.status = 'CLOSED';

    this.availableBalance += saleValue;
    this.realizedPnL += pnl;

    // Record trade
    const trade: Trade = {
      id: tradeId,
      symbol,
      type: 'SELL',
      quantity: position.quantity,
      price,
      timestamp,
      signalConfidence: confidence,
      signalType: 'SELL',
    };

    this.trades.push(trade);

    console.log(
      `[PAPER TRADE] SELL ${symbol}: ${position.quantity.toFixed(8)} @ $${price.toFixed(2)} | P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) (Conf: ${confidence.toFixed(0)}%)`
    );

    return trade;
  }

  /**
   * Get current portfolio snapshot
   */
  getSnapshot(currentPrices: Map<string, number>): PortfolioSnapshot {
    let positionsValue = 0;
    let unrealizedPnL = 0;
    let openCount = 0;
    let closedCount = 0;
    let winCount = 0;

    // Calculate unrealized P&L for open positions
    for (const [symbol, position] of this.positions) {
      if (position.status === 'OPEN') {
        const currentPrice = currentPrices.get(symbol) || position.entryPrice;
        const posValue = position.quantity * currentPrice;
        const uPnL = posValue - position.quantity * position.entryPrice;

        positionsValue += posValue;
        unrealizedPnL += uPnL;
        openCount++;
      } else {
        closedCount++;
        if (position.profitLoss && position.profitLoss > 0) {
          winCount++;
        }
      }
    }

    const totalPnL = this.realizedPnL + unrealizedPnL;
    const totalReturn = (totalPnL / this.initialCapital) * 100;
    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

    return {
      timestamp: new Date().toISOString(),
      totalCapital: this.initialCapital,
      availableBalance: this.availableBalance,
      positionsValue,
      unrealizedPnL,
      realizedPnL: this.realizedPnL,
      totalPnL,
      totalReturn,
      openPositions: openCount,
      closedPositions: closedCount,
      winRate,
      trades: this.trades,
    };
  }

  /**
   * Get all positions
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get trade history
   */
  getTradeHistory(): Trade[] {
    return [...this.trades];
  }
}
