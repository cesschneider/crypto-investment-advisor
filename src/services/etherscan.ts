import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

const logger = new Logger('EtherscanService');

export class EtherscanService {
  private api: AxiosInstance;
  private readonly BASE_URL = 'https://api.etherscan.io/api';
  private readonly API_KEY = process.env.ETHERSCAN_API_KEY || '';
  private requestCount = 0;
  private lastReset = Date.now();

  constructor() {
    this.api = axios.create({
      baseURL: this.BASE_URL,
      timeout: 10000,
    });
  }

  private async checkRateLimit() {
    const now = Date.now();
    if (now - this.lastReset > 1000) {
      this.requestCount = 0;
      this.lastReset = now;
    }
    if (this.requestCount >= 5) {
      await new Promise(resolve => setTimeout(resolve, 1000 - (now - this.lastReset)));
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
    this.requestCount++;
  }

  async getBalance(address: string): Promise<string> {
    await this.checkRateLimit();
    const response = await this.api.get('', {
      params: {
        module: 'account',
        action: 'balance',
        address,
        apikey: this.API_KEY,
      },
    });
    if (response.data.status === '0') throw new Error(response.data.message);
    return response.data.result;
  }

  async getTransactions(address: string): Promise<any[]> {
    await this.checkRateLimit();
    const response = await this.api.get('', {
      params: {
        module: 'account',
        action: 'txlist',
        address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: this.API_KEY,
      },
    });
    if (response.data.status === '0') return [];
    return response.data.result || [];
  }

  async getTokenTransfers(address: string): Promise<any[]> {
    await this.checkRateLimit();
    const response = await this.api.get('', {
      params: {
        module: 'account',
        action: 'tokentx',
        address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: this.API_KEY,
      },
    });
    if (response.data.status === '0') return [];
    return response.data.result || [];
  }

  async getWhaleAlerts(minValue: number = 100): Promise<any[]> {
    const txs = await this.getTransactions('0x0000000000000000000000000000000000000000');
    return txs.filter(tx => parseInt(tx.value) / 1e18 > minValue);
  }
}

export default new EtherscanService();
