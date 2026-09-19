import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/**
 * Rate limiter for Solscan API (public endpoint - no strict limits)
 */
class SolscanRateLimiter {
  private queue: { callback: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }[] = [];
  private processing = false;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 10;
  private readonly windowDuration = 1000; // 1 second

  async execute<T>(callback: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ callback, resolve, reject });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      
      // Reset window if time has passed
      if (now - this.windowStart >= this.windowDuration) {
        this.windowStart = now;
        this.requestCount = 0;
      }

      // Wait if at limit
      if (this.requestCount >= this.maxRequests) {
        const waitTime = this.windowDuration - (now - this.windowStart);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const { callback, resolve, reject } = this.queue.shift()!;
      this.requestCount++;

      try {
        const result = await callback();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}

/**
 * Circuit breaker for Solscan
 */
class SolscanCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 1 minute

  async execute<T>(callback: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        Logger.info('Solscan circuit breaker half-open');
      } else {
        throw new Error('Solscan circuit breaker is OPEN');
      }
    }

    try {
      const result = await callback();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        Logger.info('Solscan circuit breaker closed');
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        Logger.error(`Solscan circuit breaker opened after ${this.failureCount} failures`);
      }

      throw error;
    }
  }
}

/**
 * Solscan API wrapper for Solana on-chain data
 * Public endpoint - no API key required
 * Includes rate limiting, circuit breaker, and retry logic
 */
class SolscanService {
  private baseUrl: string = 'https://api.solscan.io';
  private httpClient: AxiosInstance;
  private rateLimiter: SolscanRateLimiter;
  private circuitBreaker: SolscanCircuitBreaker;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // exponential backoff

  constructor() {
    this.rateLimiter = new SolscanRateLimiter();
    this.circuitBreaker = new SolscanCircuitBreaker();
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'Crypto-Investment-Advisor/1.0'
      }
    });
  }

  /**
   * Wrap request with rate limiting, circuit breaker, and retries
   */
  private async request<T>(
    operation: string,
    callback: () => Promise<T>
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.circuitBreaker.execute(() =>
          this.rateLimiter.execute(callback)
        );
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          const delay = this.retryDelays[attempt - 1];
          Logger.warn(`Retrying operation | {"operation":"${operation}","attempt":${attempt},"delayMs":${delay},"error":"${(error as any).message}"}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    Logger.error(`Failed after ${this.maxRetries} retries | {"operation":"${operation}","error":"${(lastError as any).message}"}`);
    throw lastError;
  }

  /**
   * Get account information
   */
  async getAccountInfo(address: string) {
    return this.request(`getAccountInfo(${address})`, async () => {
      const response = await this.httpClient.get(`/account/${address}`);
      return response.data;
    });
  }

  /**
   * Get token holders by SPL token mint address
   */
  async getTokenHolders(tokenMint: string, limit: number = 100) {
    return this.request(`getTokenHolders(${tokenMint})`, async () => {
      const response = await this.httpClient.get(`/token/holders`, {
        params: {
          token: tokenMint,
          pageSize: Math.min(limit, 100)
        }
      });
      return response.data.result || [];
    });
  }

  /**
   * Get token metadata and info
   */
  async getTokenInfo(tokenMint: string) {
    return this.request(`getTokenInfo(${tokenMint})`, async () => {
      const response = await this.httpClient.get(`/token/meta`, {
        params: {
          token: tokenMint
        }
      });
      return response.data;
    });
  }

  /**
   * Get token transfer history
   */
  async getTokenTransfers(tokenMint: string, limit: number = 100) {
    return this.request(`getTokenTransfers(${tokenMint})`, async () => {
      const response = await this.httpClient.get(`/token/transfer`, {
        params: {
          token: tokenMint,
          pageSize: Math.min(limit, 100)
        }
      });
      return response.data.result || [];
    });
  }

  /**
   * Get recent transactions for an address
   */
  async getTransactions(address: string, limit: number = 50) {
    return this.request(`getTransactions(${address})`, async () => {
      const response = await this.httpClient.get(`/account/transactions`, {
        params: {
          account: address,
          pageSize: Math.min(limit, 100)
        }
      });
      return response.data.result || [];
    });
  }

  /**
   * Get SPL token supply information
   */
  async getTokenSupply(tokenMint: string) {
    return this.request(`getTokenSupply(${tokenMint})`, async () => {
      const response = await this.httpClient.get(`/token/supply`, {
        params: {
          token: tokenMint
        }
      });
      return response.data;
    });
  }

  /**
   * Get market data for a token
   */
  async getTokenPrice(tokenMint: string) {
    return this.request(`getTokenPrice(${tokenMint})`, async () => {
      const response = await this.httpClient.get(`/token/priceV2`, {
        params: {
          token: tokenMint
        }
      });
      return response.data;
    });
  }

  /**
   * Get wallet information (holdings)
   */
  async getWalletTokens(address: string) {
    return this.request(`getWalletTokens(${address})`, async () => {
      const response = await this.httpClient.get(`/account/tokens`, {
        params: {
          account: address
        }
      });
      return response.data.result || [];
    });
  }

  /**
   * Get owner program accounts
   */
  async getProgramAccounts(programId: string, limit: number = 100) {
    return this.request(`getProgramAccounts(${programId})`, async () => {
      const response = await this.httpClient.get(`/account/programAccounts`, {
        params: {
          program: programId,
          pageSize: Math.min(limit, 100)
        }
      });
      return response.data.result || [];
    });
  }
}

export default new SolscanService();
export { SolscanService, SolscanRateLimiter, SolscanCircuitBreaker };
