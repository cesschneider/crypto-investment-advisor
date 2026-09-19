import axios from 'axios';

export class SolscanService {
  private readonly RPC_URL = 'https://api.mainnet-beta.solana.com';

  async getWhaleTransactions(minAmount: number = 100): Promise<any[]> {
    try {
      const response = await axios.post(this.RPC_URL, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: ['11111111111111111111111111111111'],
      });
      return response.data.result || [];
    } catch (e) {
      return [];
    }
  }

  async getNFTTransfers(owner: string): Promise<any[]> {
    return [];
  }

  async parseTransaction(hash: string): Promise<any> {
    const response = await axios.post(this.RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [hash, 'json'],
    });
    return response.data.result;
  }
}

export default new SolscanService();
