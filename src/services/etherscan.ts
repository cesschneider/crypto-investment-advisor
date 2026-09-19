import axios, { AxiosInstance } from 'axios';
import Logger from '../utils/logger';

/**
 * Rate limiter for Etherscan API (5 req/sec)
 */
class RateLimiter {
  private queue: { callback: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }[] = [];
  private processing = false;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 5;
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
 * Circuit breaker for handling API failures
 */
class CircuitBreaker {
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
        Logger.info('Circuit breaker half-open');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await callback();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        Logger.info('Circuit breaker closed');
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        Logger.error(`Circuit breaker opened after ${this.failureCount} failures`);
      }

      throw error;
    }
  }
}

/**
 * Etherscan API wrapper for Ethereum on-chain data
 * Includes rate limiting (5 req/sec), circuit breaker, and retry logic
 */
class EtherscanService {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/api';
  private httpClient: AxiosInstance;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // exponential backoff

  constructor() {
    this.apiKey = process.env.ETHERSCAN_API_KEY || '';
    this.rateLimiter = new RateLimiter();
    this.circuitBreaker = new CircuitBreaker();
    
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000
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
   * Validate API key configuration
   */
  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Get token holders for an ERC-20 contract
   */
  async getTokenHolders(contractAddress: string, limit: number = 100) {
    return this.request(`getTokenHolders(${contractAddress})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'token',
          action: 'tokenholderlist',
          contractaddress: contractAddress,
          page: 1,
          offset: limit,
          apikey: this.apiKey
        }
      });

      if (response.data.status === '1') {
        return response.data.result;
      }
      throw new Error(response.data.message || 'Failed to get token holders');
    });
  }

  /**
   * Get contract source code (verification status)
   */
  async getContractSource(contractAddress: string) {
    return this.request(`getContractSource(${contractAddress})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'contract',
          action: 'getsourcecode',
          address: contractAddress,
          apikey: this.apiKey
        }
      });

      if (response.data.status === '1' && response.data.result.length > 0) {
        return response.data.result[0];
      }
      return null;
    });
  }

  /**
   * Get token info (supply, decimals)
   */
  async getTokenInfo(contractAddress: string) {
    return this.request(`getTokenInfo(${contractAddress})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'token',
          action: 'tokeninfo',
          contractaddress: contractAddress,
          apikey: this.apiKey
        }
      });

      if (response.data.status === '1') {
        return response.data.result[0];
      }
      throw new Error('Token not found');
    });
  }

  /**
   * Get latest transactions for a token
   */
  async getTokenTransfers(contractAddress: string, limit: number = 100) {
    return this.request(`getTokenTransfers(${contractAddress})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'account',
          action: 'tokentx',
          contractaddress: contractAddress,
          page: 1,
          offset: limit,
          sort: 'desc',
          apikey: this.apiKey
        }
      });

      if (response.data.status === '1') {
        return response.data.result;
      }
      return [];
    });
  }

  /**
   * Check if wallet is a known exchange
   */
  async getAccountLabel(address: string) {
    return this.request(`getAccountLabel(${address})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'account',
          action: 'getlabel',
          address: address,
          apikey: this.apiKey
        }
      });

      return response.data;
    });
  }

  /**
   * Get multiple token contracts for an address
   */
  async getTokenContractsByAddress(address: string) {
    return this.request(`getTokenContractsByAddress(${address})`, async () => {
      const response = await this.httpClient.get(this.baseUrl, {
        params: {
          module: 'account',
          action: 'tokentx',
          address: address,
          sort: 'asc',
          apikey: this.apiKey
        }
      });

      if (response.data.status === '1') {
        // Get unique contract addresses
        const contracts = [...new Set(response.data.result.map((tx: any) => tx.contractAddress))];
        return contracts;
      }
      return [];
    });
  }
}

export default new EtherscanService();
export { EtherscanService, RateLimiter, CircuitBreaker };
