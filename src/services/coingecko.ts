import axios from 'axios';

/**
 * CoinGecko API wrapper for market data
 */
class CoinGeckoService {
  private apiKey: string;
  private baseUrl: string = 'https://api.coingecko.com/api/v3';

  constructor() {
    this.apiKey = process.env.COINGECKO_API_KEY || '';
  }

  /**
   * Get top 100 coins by market cap
   */
  async getTop100Coins() {
    try {
      const response = await axios.get(`${this.baseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          page: 1,
          sparkline: true,
          price_change_percentage: '24h,7d,30d'
        },
        headers: {
          'x-cg-pro-api-key': this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('CoinGecko API error (top 100):', error);
      throw error;
    }
  }

  /**
   * Get detailed market data for specific coin
   */
  async getCoinData(coinId: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: true,
          market_data: true,
          community_data: true
        },
        headers: {
          'x-cg-pro-api-key': this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error(`CoinGecko API error (${coinId}):`, error);
      throw error;
    }
  }

  /**
   * Get OHLC candlestick data
   */
  async getOHLC(coinId: string, days: number = 90) {
    try {
      const response = await axios.get(`${this.baseUrl}/coins/${coinId}/ohlc`, {
        params: {
          vs_currency: 'usd',
          days: days
        },
        headers: {
          'x-cg-pro-api-key': this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error(`CoinGecko OHLC error (${coinId}):`, error);
      throw error;
    }
  }

  /**
   * Search for new tokens
   */
  async searchNewTokens(days: number = 7) {
    try {
      // CoinGecko doesn't have a direct API for new listings
      // This requires custom filtering from market data
      const response = await axios.get(`${this.baseUrl}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 250,
          page: 1
        },
        headers: {
          'x-cg-pro-api-key': this.apiKey
        }
      });
      
      // Filter coins by listing date (requires additional processing)
      return response.data;
    } catch (error) {
      console.error('CoinGecko new tokens search error:', error);
      throw error;
    }
  }
}

export default new CoinGeckoService();
