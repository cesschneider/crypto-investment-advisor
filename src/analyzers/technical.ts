export class TechnicalAnalyzer {
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i < period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    const signal = this.calculateEMA([macd], 9);
    return { macd, signal, histogram: macd - signal };
  }

  calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
    const sma = prices.slice(-period).reduce((a, b) => a + b) / period;
    const variance = prices.slice(-period).reduce((a, b) => a + Math.pow(b - sma, 2)) / period;
    const std = Math.sqrt(variance);
    return { upper: sma + std * stdDev, middle: sma, lower: sma - std * stdDev };
  }

  private calculateEMA(prices: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  generateSignal(symbol: string, prices: number[]): { signal: string; confidence: number } {
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    const bb = this.calculateBollingerBands(prices);
    
    let confidence = 50;
    if (rsi < 30) { confidence += 30; return { signal: 'BUY', confidence }; }
    if (rsi > 70) { confidence += 30; return { signal: 'SELL', confidence }; }
    if (macd.histogram > 0) confidence += 15;
    if (prices[prices.length - 1] < bb.lower) confidence += 20;
    
    return { signal: 'HOLD', confidence };
  }
}
