import axios from 'axios';

/**
 * Etherscan API wrapper for Ethereum on-chain data
 */
class EtherscanService {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/api';

  constructor() {
    this.apiKey = process.env.ETHERSCAN_API_KEY || '';
  }

  /**
   * Get token holders for an ERC-20 contract
   */
  async getTokenHolders(contractAddress: string, limit: number = 100) {
    try {
      const response = await axios.get(this.baseUrl, {
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
      throw new Error(response.data.message);
    } catch (error) {
      console.error(`Etherscan token holders error (${contractAddress}):`, error);
      throw error;
    }
  }

  /**
   * Get contract source code (verification status)
   */
  async getContractSource(contractAddress: string) {
    try {
      const response = await axios.get(this.baseUrl, {
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
    } catch (error) {
      console.error(`Etherscan contract source error (${contractAddress}):`, error);
      throw error;
    }
  }

  /**
   * Get token info (supply, decimals)
   */
  async getTokenInfo(contractAddress: string) {
    try {
      const response = await axios.get(this.baseUrl, {
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
    } catch (error) {
      console.error(`Etherscan token info error (${contractAddress}):`, error);
      throw error;
    }
  }

  /**
   * Get latest transactions for a token
   */
  async getTokenTransfers(contractAddress: string, limit: number = 100) {
    try {
      const response = await axios.get(this.baseUrl, {
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
    } catch (error) {
      console.error(`Etherscan token transfers error (${contractAddress}):`, error);
      throw error;
    }
  }

  /**
   * Check if wallet is a known exchange
   */
  async getAccountLabel(address: string) {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          module: 'account',
          action: 'getlabel',
          address: address,
          apikey: this.apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Etherscan account label error (${address}):`, error);
      return null;
    }
  }
}

export default new EtherscanService();
