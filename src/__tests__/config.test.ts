/**
 * Configuration Validator Tests
 * Validates environment setup and configuration loading
 */

import ConfigValidator, { Config, getConfig, resetConfig } from '../config/index';

describe('ConfigValidator', () => {
  beforeEach(() => {
    resetConfig();
    // Clear all environment variables
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_SECRET_KEY;
    delete process.env.ETHERSCAN_API_KEY;
    delete process.env.COINGECKO_API_KEY;
    delete process.env.DUNE_API_KEY;
    delete process.env.MIN_MARKET_CAP_USD;
    delete process.env.MIN_VOLUME_USD;
    delete process.env.RSI_OVERBOUGHT;
    delete process.env.RSI_OVERSOLD;
    delete process.env.ANALYSIS_INTERVAL_MINUTES;
  });

  describe('loadConfig', () => {
    test('should throw error if required env vars missing', () => {
      expect(() => {
        ConfigValidator.loadConfig();
      }).toThrow(/Missing required environment variables/);
    });

    test('should load config when all required vars present', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';

      const config = ConfigValidator.loadConfig();

      expect(config.binanceApiKey).toBe('test_binance_key_12345');
      expect(config.binanceSecretKey).toBe('test_binance_secret_12345');
      expect(config.etherscanApiKey).toBe('test_etherscan_key_12345');
    });

    test('should use default values for optional config', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';

      const config = ConfigValidator.loadConfig();

      expect(config.minMarketCapUsd).toBe(1000000);
      expect(config.minVolumeUsd).toBe(500000);
      expect(config.rsiOverbought).toBe(70);
      expect(config.rsiOversold).toBe(30);
      expect(config.analysisIntervalMinutes).toBe(60);
      expect(config.defillamaUrl).toBe('https://api.llama.fi');
    });

    test('should validate API key format', () => {
      process.env.BINANCE_API_KEY = 'x'; // Too short (1 char)
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';

      expect(() => {
        ConfigValidator.loadConfig();
      }).toThrow(/Invalid API key/);
    });

    test('should parse numeric environment variables', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';
      process.env.MIN_MARKET_CAP_USD = '5000000';
      process.env.MIN_VOLUME_USD = '2000000';
      process.env.RSI_OVERBOUGHT = '75';
      process.env.RSI_OVERSOLD = '25';

      const config = ConfigValidator.loadConfig();

      expect(config.minMarketCapUsd).toBe(5000000);
      expect(config.minVolumeUsd).toBe(2000000);
      expect(config.rsiOverbought).toBe(75);
      expect(config.rsiOversold).toBe(25);
    });

    test('should validate numeric ranges', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';
      process.env.MIN_MARKET_CAP_USD = '-1000'; // Invalid negative

      expect(() => {
        ConfigValidator.loadConfig();
      }).toThrow(/Invalid MIN_MARKET_CAP_USD/);
    });

    test('should validate RSI oversold < overbought', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';
      process.env.RSI_OVERBOUGHT = '30';
      process.env.RSI_OVERSOLD = '70'; // Invalid: oversold > overbought

      expect(() => {
        ConfigValidator.loadConfig();
      }).toThrow(/RSI_OVERSOLD must be less than RSI_OVERBOUGHT/);
    });

    test('should load optional API keys when present', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';
      process.env.COINGECKO_API_KEY = 'test_coingecko_key_12345';
      process.env.DUNE_API_KEY = 'test_dune_key_12345';

      const config = ConfigValidator.loadConfig();

      expect(config.coingeckoApiKey).toBe('test_coingecko_key_12345');
      expect(config.duneApiKey).toBe('test_dune_key_12345');
    });
  });

  describe('validate', () => {
    test('should validate complete config object', () => {
      const config: Config = {
        binanceApiKey: 'test_binance_key_12345',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: 'test_coingecko_key_12345',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: 1000000,
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 30,
        analysisIntervalMinutes: 60
      };

      // Should not throw
      expect(() => ConfigValidator.validate(config)).not.toThrow();
    });

    test('should reject missing Binance API key', () => {
      const config: Config = {
        binanceApiKey: '',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: '',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: 1000000,
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 30,
        analysisIntervalMinutes: 60
      };

      expect(() => ConfigValidator.validate(config)).toThrow(/Binance API key is required/);
    });

    test('should reject invalid numeric values', () => {
      const config: Config = {
        binanceApiKey: 'test_binance_key_12345',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: '',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: -1000, // Invalid
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 30,
        analysisIntervalMinutes: 60
      };

      expect(() => ConfigValidator.validate(config)).toThrow(/MIN_MARKET_CAP_USD must be positive/);
    });

    test('should reject RSI configuration with oversold >= overbought', () => {
      const config: Config = {
        binanceApiKey: 'test_binance_key_12345',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: '',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: 1000000,
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 70, // Invalid: equal
        analysisIntervalMinutes: 60
      };

      expect(() => ConfigValidator.validate(config)).toThrow(/RSI_OVERBOUGHT must be greater than RSI_OVERSOLD/);
    });

    test('should reject analysis interval < 1', () => {
      const config: Config = {
        binanceApiKey: 'test_binance_key_12345',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: '',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: 1000000,
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 30,
        analysisIntervalMinutes: 0 // Invalid
      };

      expect(() => ConfigValidator.validate(config)).toThrow(/ANALYSIS_INTERVAL_MINUTES must be at least 1/);
    });
  });

  describe('getConfig (singleton)', () => {
    test('should return same instance on multiple calls', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';

      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    test('should load fresh config after reset', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';

      const config1 = getConfig();
      resetConfig();

      process.env.MIN_MARKET_CAP_USD = '9999999';
      const config2 = getConfig();

      expect(config1.minMarketCapUsd).toBe(1000000);
      expect(config2.minMarketCapUsd).toBe(9999999);
    });
  });

  describe('logConfig', () => {
    test('should mask sensitive data in logs', () => {
      const config: Config = {
        binanceApiKey: 'test_binance_key_12345',
        binanceSecretKey: 'test_binance_secret_12345',
        etherscanApiKey: 'test_etherscan_key_12345',
        coingeckoApiKey: '',
        defillamaUrl: 'https://api.llama.fi',
        minMarketCapUsd: 1000000,
        minVolumeUsd: 500000,
        rsiOverbought: 70,
        rsiOversold: 30,
        analysisIntervalMinutes: 60
      };

      // Should not throw
      expect(() => ConfigValidator.logConfig(config)).not.toThrow();
    });
  });

  describe('Integration', () => {
    test('complete flow: load, validate, and use config', () => {
      process.env.BINANCE_API_KEY = 'test_binance_key_12345';
      process.env.BINANCE_SECRET_KEY = 'test_binance_secret_12345';
      process.env.ETHERSCAN_API_KEY = 'test_etherscan_key_12345';
      process.env.MIN_MARKET_CAP_USD = '2000000';
      process.env.ANALYSIS_INTERVAL_MINUTES = '30';

      const config = getConfig();

      expect(config.minMarketCapUsd).toBe(2000000);
      expect(config.analysisIntervalMinutes).toBe(30);
      expect(config.binanceApiKey).toBe('test_binance_key_12345');
    });
  });
});
