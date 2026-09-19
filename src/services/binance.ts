import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime?: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface KlineData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Ticker24h {
  symbol: string;
  price: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

interface OrderBookData {
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
}

interface TradeData {
  time: Date;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
}

/**
 * Production-grade Binance API wrapper
 * Features:
 * - Rate limiting (1200 req/min by default)
 * - Circuit breaker pattern
 * - Exponential backoff retry logic
 * - Comprehensive error handling
 * - Structured logging
 */
class BinanceService {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string = 'https://api.binance.com/api/v3';
  private httpClient?: AxiosInstance;
  private rateLimitConfig: RateLimitConfig = { maxRequests: 1200, windowMs: 60000 };
  private requestTimestamps: number[] = [];
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    state: 'CLOSED'
  };
  private readonly maxRetries = 3;
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerResetMs = 30000;

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.secretKey = process.env.BINANCE_SECRET_KEY || '';
    this.initializeHttpClient();
    logger.debug('BinanceService initialized');
  }

  private initializeHttpClient() {
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'X-MBX-APIKEY': this.apiKey
      }
    });
  }

  /**
   * Get or create HTTP client (for testing)
   */
  private getHttpClient(): AxiosInstance {
    if (!this.httpClient) {
      this.initializeHttpClient();
    }
    return this.httpClient!;
  }

  /**
   * Reset service state (mainly for testing)
   */
  resetState() {
    this.circuitBreaker = {
      failures: 0,
      state: 'CLOSED'
    };
    this.requestTimestamps = [];
  }

  /**
   * Validate that API credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.secretKey);
  }

  /**
   * Check service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.getHttpClient().get('/ping');
      logger.info('Binance health check passed');
      return response.status === 200;
    } catch (error) {
      logger.error('Binance health check failed', error);
      return false;
    }
  }

  /**
   * Rate limiting enforcement
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.rateLimitConfig.windowMs
    );

    if (this.requestTimestamps.length >= this.rateLimitConfig.maxRequests) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = this.rateLimitConfig.windowMs - (now - oldestRequest);
      logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestTimestamps = [];
    }

    this.requestTimestamps.push(now);
  }

  /**
   * Circuit breaker pattern implementation
   */
  private checkCircuitBreaker(): void {
    const { state, failures, lastFailureTime } = this.circuitBreaker;

    if (state === 'OPEN') {
      const timeSinceFailure = Date.now() - (lastFailureTime || 0);
      if (timeSinceFailure > this.circuitBreakerResetMs) {
        logger.info('Circuit breaker transitioning to HALF_OPEN');
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.failures = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
  }

  /**
   * Record failure and manage circuit breaker state
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreakerThreshold) {
      logger.warn('Circuit breaker opened due to repeated failures');
      this.circuitBreaker.state = 'OPEN';
    }
  }

  /**
   * Record success and reset circuit breaker
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      logger.info('Circuit breaker closed after successful request');
      this.circuitBreaker.state = 'CLOSED';
    }
    this.circuitBreaker.failures = 0;
  }

  /**
   * Exponential backoff retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt = 0
  ): Promise<T> {
    try {
      this.checkCircuitBreaker();
      await this.enforceRateLimit();
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();

      if (attempt < this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        logger.warn(`Request failed, retrying in ${backoffMs}ms (attempt ${attempt + 1})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return this.executeWithRetry(fn, attempt + 1);
      }

      logger.error(`Request failed after ${this.maxRetries} retries`);
      throw error;
    }
  }

  /**
   * Get OHLCV (candlestick) data
   */
  async getKlines(
    symbol: string,
    interval: string = '1h',
    limit: number = 100
  ): Promise<KlineData[]> {
    if (limit > 1000) {
      throw new Error('Klines limit cannot exceed 1000');
    }

    return this.executeWithRetry(async () => {
      const response = await this.getHttpClient().get('/klines', {
        params: {
          symbol: `${symbol}USDT`,
          interval,
          limit
        }
      });

      const data = response.data.map((kline: any) => ({
        time: new Date(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[7])
      })) as KlineData[];

      // Validate OHLC ordering
      for (const kline of data) {
        if (kline.high < kline.low || kline.high < kline.open || kline.high < kline.close) {
          logger.warn(`Invalid OHLC ordering for ${symbol}`, kline);
        }
      }

      logger.debug(`Retrieved ${data.length} klines for ${symbol}/${interval}`);
      return data;
    });
  }

  /**
   * Get current price and 24h statistics
   */
  async get24hStats(symbol: string): Promise<Ticker24h> {
    return this.executeWithRetry(async () => {
      const response = await this.getHttpClient().get('/ticker/24hr', {
        params: {
          symbol: `${symbol}USDT`
        }
      });

      const data: Ticker24h = {
        symbol,
        price: parseFloat(response.data.lastPrice),
        high24h: parseFloat(response.data.highPrice),
        low24h: parseFloat(response.data.lowPrice),
        volume24h: parseFloat(response.data.volume),
        quoteVolume24h: parseFloat(response.data.quoteAssetVolume),
        priceChange24h: parseFloat(response.data.priceChange),
        priceChangePercent24h: parseFloat(response.data.priceChangePercent)
      };

      logger.debug(`Retrieved 24h stats for ${symbol}`, {
        price: data.price,
        change24h: data.priceChangePercent24h
      });

      return data;
    });
  }

  /**
   * Get order book (liquidity snapshot)
   */
  async getOrderBook(symbol: string, limit: number = 20): Promise<OrderBookData> {
    if (limit > 5000) {
      throw new Error('Order book limit cannot exceed 5000');
    }

    return this.executeWithRetry(async () => {
      const response = await this.getHttpClient().get('/depth', {
        params: {
          symbol: `${symbol}USDT`,
          limit
        }
      });

      const data: OrderBookData = {
        bids: response.data.bids.map((bid: any) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1])
        })),
        asks: response.data.asks.map((ask: any) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1])
        }))
      };

      // Validate bid-ask spread
      if (data.bids.length > 0 && data.asks.length > 0) {
        if (data.bids[0].price > data.asks[0].price) {
          logger.warn(`Invalid bid-ask spread for ${symbol}`, {
            bid: data.bids[0].price,
            ask: data.asks[0].price
          });
        }
      }

      logger.debug(`Retrieved order book for ${symbol}`, {
        bids: data.bids.length,
        asks: data.asks.length
      });

      return data;
    });
  }

  /**
   * Get recent trades (volume verification)
   */
  async getRecentTrades(symbol: string, limit: number = 100): Promise<TradeData[]> {
    if (limit > 1000) {
      throw new Error('Recent trades limit cannot exceed 1000');
    }

    return this.executeWithRetry(async () => {
      const response = await this.getHttpClient().get('/trades', {
        params: {
          symbol: `${symbol}USDT`,
          limit
        }
      });

      const data = response.data.map((trade: any) => ({
        time: new Date(trade.time),
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        isBuyerMaker: trade.isBuyerMaker
      })) as TradeData[];

      logger.debug(`Retrieved ${data.length} recent trades for ${symbol}`);
      return data;
    });
  }

  /**
   * Get exchange info (pairs and filters)
   */
  async getExchangeInfo(): Promise<any> {
    return this.executeWithRetry(async () => {
      const response = await this.getHttpClient().get('/exchangeInfo');
      logger.debug('Retrieved exchange info', { symbols: response.data.symbols.length });
      return response.data;
    });
  }

  /**
   * Test order without execution (paper trading)
   */
  async testOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price?: number
  ): Promise<{ status: string }> {
    logger.info(`[TEST] Order: ${side} ${quantity} ${symbol} @ ${price || 'market'}`);
    return { status: 'TEST_OK' };
  }

  /**
   * Get circuit breaker status (for testing)
   */
  getCircuitBreakerStatus() {
    return { ...this.circuitBreaker };
  }

  /**
   * Get rate limit status (for testing)
   */
  getRateLimitStatus() {
    return {
      requestsInWindow: this.requestTimestamps.length,
      maxRequests: this.rateLimitConfig.maxRequests,
      windowMs: this.rateLimitConfig.windowMs
    };
  }
}

export default new BinanceService();
