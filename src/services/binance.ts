import axios from 'axios';

/**
 * Binance API wrapper for real-time trading data
 */
class BinanceService {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string = 'https://api.binance.com/api/v3';

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.secretKey = process.env.BINANCE_SECRET_KEY || '';
  }

  /**
   * Get OHLCV (candlestick) data
   */
  async getKlines(symbol: string, interval: string = '1h', limit: number = 100) {
    try {
      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: `${symbol}USDT`,
          interval: interval,
          limit: limit
        }
      });
      
      // Transform to readable format
      return response.data.map((kline: any) => ({
        time: new Date(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[7])
      }));
    } catch (error) {
      console.error(`Binance klines error (${symbol}):`, error);
      throw error;
    }
  }

  /**
   * Get current price and 24h stats
   */
  async get24hStats(symbol: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/ticker/24hr`, {
        params: {
          symbol: `${symbol}USDT`
        }
      });
      
      return {
        symbol: symbol,
        price: parseFloat(response.data.lastPrice),
        high24h: parseFloat(response.data.highPrice),
        low24h: parseFloat(response.data.lowPrice),
        volume24h: parseFloat(response.data.volume),
        quoteVolume24h: parseFloat(response.data.quoteAssetVolume),
        priceChange24h: parseFloat(response.data.priceChange),
        priceChangePercent24h: parseFloat(response.data.priceChangePercent)
      };
    } catch (error) {
      console.error(`Binance 24h stats error (${symbol}):`, error);
      throw error;
    }
  }

  /**
   * Get order book (liquidity snapshot)
   */
  async getOrderBook(symbol: string, limit: number = 20) {
    try {
      const response = await axios.get(`${this.baseUrl}/depth`, {
        params: {
          symbol: `${symbol}USDT`,
          limit: limit
        }
      });
      
      return {
        bids: response.data.bids.map((bid: any) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1])
        })),
        asks: response.data.asks.map((ask: any) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1])
        }))
      };
    } catch (error) {
      console.error(`Binance orderbook error (${symbol}):`, error);
      throw error;
    }
  }

  /**
   * Get recent trades (volume verification)
   */
  async getRecentTrades(symbol: string, limit: number = 100) {
    try {
      const response = await axios.get(`${this.baseUrl}/trades`, {
        params: {
          symbol: `${symbol}USDT`,
          limit: limit
        }
      });
      
      return response.data.map((trade: any) => ({
        time: new Date(trade.time),
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        isBuyerMaker: trade.isBuyerMaker
      }));
    } catch (error) {
      console.error(`Binance recent trades error (${symbol}):`, error);
      throw error;
    }
  }

  /**
   * Place a test order (no real transaction)
   */
  async testOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price?: number) {
    console.log(`[TEST] Order: ${side} ${quantity} ${symbol} @ ${price || 'market'}`);
    return { status: 'TEST_OK' };
  }
}

export default new BinanceService();
