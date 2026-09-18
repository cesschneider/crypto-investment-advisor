class TechnicalAnalyzer {
  /**
   * Calculate RSI (Relative Strength Index)
   */
  static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 0;

    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return parseFloat(rsi.toFixed(2));
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  static calculateMACD(prices: number[]) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;

    // Signal line (9-period EMA of MACD)
    const macdHistory = [];
    for (let i = 0; i < prices.length; i++) {
      const e12 = this.calculateEMA(prices.slice(0, i + 1), 12);
      const e26 = this.calculateEMA(prices.slice(0, i + 1), 26);
      macdHistory.push(e12 - e26);
    }

    const signalLine = this.calculateEMA(macdHistory, 9);
    const histogram = macdLine - signalLine;

    return {
      macdLine: parseFloat(macdLine.toFixed(6)),
      signalLine: parseFloat(signalLine.toFixed(6)),
      histogram: parseFloat(histogram.toFixed(6))
    };
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  static calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length === 1) return prices[0];

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * multiplier + ema * (1 - multiplier);
    }

    return ema;
  }

  /**
   * Calculate Simple Moving Average
   */
  static calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const subset = prices.slice(-period);
    const sum = subset.reduce((a, b) => a + b, 0);
    return parseFloat((sum / period).toFixed(2));
  }

  /**
   * Identify support and resistance levels
   */
  static findSupportResistance(candles: Candle[], lookback: number = 50) {
    if (candles.length < lookback) return { supports: [], resistances: [] };

    const recentCandles = candles.slice(-lookback);
    const lows = recentCandles.map(c => c.low);
    const highs = recentCandles.map(c => c.high);

    // Find local minima (supports)
    const supports = this.findLocalExtrema(lows, 'min', 5);
    
    // Find local maxima (resistances)
    const resistances = this.findLocalExtrema(highs, 'max', 5);

    return {
      supports: supports.sort((a, b) => a - b),
      resistances: resistances.sort((a, b) => a - b)
    };
  }

  /**
   * Find local extrema in price series
   */
  private static findLocalExtrema(
    prices: number[],
    type: 'min' | 'max',
    window: number = 3
  ): number[] {
    const extrema: number[] = [];

    for (let i = window; i < prices.length - window; i++) {
      const isMin = type === 'min';
      const compare = isMin ? Math.min : Math.max;

      let isExtrema = true;
      for (let j = i - window; j <= i + window; j++) {
        if (j !== i && compare(prices[j], prices[i]) === prices[j]) {
          isExtrema = false;
          break;
        }
      }

      if (isExtrema) {
        extrema.push(prices[i]);
      }
    }

    return [...new Set(extrema)]; // Remove duplicates
  }

  /**
   * Determine trend direction
   */
  static analyzeTrend(prices: number[], sma20: number, sma50: number, sma200: number) {
    const currentPrice = prices[prices.length - 1];

    let trend = 'SIDEWAYS';

    if (currentPrice > sma20 && sma20 > sma50 && sma50 > sma200) {
      trend = 'UPTREND';
    } else if (currentPrice < sma20 && sma20 < sma50 && sma50 < sma200) {
      trend = 'DOWNTREND';
    }

    return trend;
  }

  /**
   * Generate trading signal
   */
  static generateSignal(params: {
    rsi: number;
    macd: any;
    trend: string;
    price: number;
    sma20: number;
    sma50: number;
    volume24h: number;
    volumeAvg: number;
  }) {
    const { rsi, macd, trend, price, sma20, sma50, volume24h, volumeAvg } = params;
    
    let signal = 'HOLD';
    let confidence = 0;
    const reasons: string[] = [];

    // Buy signals
    if (rsi < 30 && macd.histogram > 0) {
      signal = 'STRONG_BUY';
      confidence = 85;
      reasons.push('Oversold (RSI < 30) with bullish MACD');
    } else if (rsi < 40 && macd.macdLine > macd.signalLine && trend === 'UPTREND') {
      signal = 'BUY';
      confidence = 70;
      reasons.push('MACD crossover in uptrend');
    } else if (price > sma20 && volume24h > volumeAvg * 1.5) {
      signal = 'BUY';
      confidence = 60;
      reasons.push('Price above SMA-20 with volume spike');
    }

    // Sell signals
    if (rsi > 70 && macd.histogram < 0) {
      signal = 'STRONG_SELL';
      confidence = 85;
      reasons.push('Overbought (RSI > 70) with bearish MACD');
    } else if (rsi > 60 && macd.macdLine < macd.signalLine && trend === 'DOWNTREND') {
      signal = 'SELL';
      confidence = 70;
      reasons.push('MACD death cross in downtrend');
    }

    return { signal, confidence, reasons };
  }
}

export default TechnicalAnalyzer;
