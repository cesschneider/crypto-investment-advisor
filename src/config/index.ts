/**
 * Environment configuration and validation
 */

import Logger from '../utils/logger';

export interface Config {
  // API Keys
  coingeckoApiKey: string;
  binanceApiKey: string;
  binanceSecretKey: string;
  etherscanApiKey: string;

  // Service URLs
  defillamaUrl: string;

  // Thresholds
  minMarketCapUsd: number;
  minVolumeUsd: number;
  rsiOverbought: number;
  rsiOversold: number;

  // Intervals
  analysisIntervalMinutes: number;

  // Optional
  duneApiKey?: string;
  oneInchApiKey?: string;
  zexApiKey?: string;
  alertWebhookUrl?: string;
}

class ConfigValidator {
  /**
   * Validate required environment variables
   */
  private static validateRequired(keys: string[]): Map<string, string> {
    const missing: string[] = [];
    const env = new Map<string, string>();

    for (const key of keys) {
      const value = process.env[key];
      if (!value) {
        missing.push(key);
      } else {
        env.set(key, value);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return env;
  }

  /**
   * Validate API key format
   */
  private static validateApiKey(key: string, name: string): void {
    if (!key || key.length < 5) {
      throw new Error(`Invalid API key for ${name}: must be at least 5 characters`);
    }
  }

  /**
   * Validate numeric configuration
   */
  private static validateNumber(value: string, name: string, min: number = 0): number {
    const num = parseFloat(value);
    if (isNaN(num) || num < min) {
      throw new Error(`Invalid ${name}: must be a number >= ${min}`);
    }
    return num;
  }

  /**
   * Load and validate configuration from environment
   */
  static loadConfig(): Config {
    // Check for .env file loaded by dotenv
    const requiredKeys = [
      'BINANCE_API_KEY',
      'BINANCE_SECRET_KEY',
      'ETHERSCAN_API_KEY'
    ];

    const env = this.validateRequired(requiredKeys);

    // Validate API keys
    this.validateApiKey(env.get('BINANCE_API_KEY')!, 'BINANCE_API_KEY');
    this.validateApiKey(env.get('BINANCE_SECRET_KEY')!, 'BINANCE_SECRET_KEY');
    this.validateApiKey(env.get('ETHERSCAN_API_KEY')!, 'ETHERSCAN_API_KEY');

    // Optional but validated if present
    if (process.env.COINGECKO_API_KEY) {
      this.validateApiKey(process.env.COINGECKO_API_KEY, 'COINGECKO_API_KEY');
    }

    // Parse numeric config
    const minMarketCapUsd = this.validateNumber(
      process.env.MIN_MARKET_CAP_USD || '1000000',
      'MIN_MARKET_CAP_USD'
    );

    const minVolumeUsd = this.validateNumber(
      process.env.MIN_VOLUME_USD || '500000',
      'MIN_VOLUME_USD'
    );

    const rsiOverbought = this.validateNumber(
      process.env.RSI_OVERBOUGHT || '70',
      'RSI_OVERBOUGHT',
      0
    );

    const rsiOversold = this.validateNumber(
      process.env.RSI_OVERSOLD || '30',
      'RSI_OVERSOLD',
      0
    );

    const analysisIntervalMinutes = this.validateNumber(
      process.env.ANALYSIS_INTERVAL_MINUTES || '60',
      'ANALYSIS_INTERVAL_MINUTES',
      1
    );

    // Validate RSI values
    if (rsiOversold >= rsiOverbought) {
      throw new Error('RSI_OVERSOLD must be less than RSI_OVERBOUGHT');
    }

    const config: Config = {
      coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
      binanceApiKey: env.get('BINANCE_API_KEY')!,
      binanceSecretKey: env.get('BINANCE_SECRET_KEY')!,
      etherscanApiKey: env.get('ETHERSCAN_API_KEY')!,
      defillamaUrl: process.env.DEFILLAMA_API_URL || 'https://api.llama.fi',
      minMarketCapUsd,
      minVolumeUsd,
      rsiOverbought,
      rsiOversold,
      analysisIntervalMinutes,
      duneApiKey: process.env.DUNE_API_KEY,
      oneInchApiKey: process.env.ONEINCH_API_KEY,
      zexApiKey: process.env.ZEX_API_KEY,
      alertWebhookUrl: process.env.ALERT_WEBHOOK_URL
    };

    return config;
  }

  /**
   * Validate configuration object
   */
  static validate(config: Config): void {
    const errors: string[] = [];

    // Validate API keys
    if (!config.binanceApiKey) errors.push('Binance API key is required');
    if (!config.binanceSecretKey) errors.push('Binance Secret key is required');
    if (!config.etherscanApiKey) errors.push('Etherscan API key is required');

    // Validate numbers
    if (config.minMarketCapUsd < 0) errors.push('MIN_MARKET_CAP_USD must be positive');
    if (config.minVolumeUsd < 0) errors.push('MIN_VOLUME_USD must be positive');
    if (config.rsiOverbought <= config.rsiOversold) {
      errors.push('RSI_OVERBOUGHT must be greater than RSI_OVERSOLD');
    }
    if (config.analysisIntervalMinutes < 1) errors.push('ANALYSIS_INTERVAL_MINUTES must be at least 1');

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    Logger.info('Configuration validated successfully');
  }

  /**
   * Log configuration (with masked secrets)
   */
  static logConfig(config: Config): void {
    const masked = {
      ...config,
      binanceApiKey: config.binanceApiKey ? `***${config.binanceApiKey.slice(-4)}` : 'MISSING',
      binanceSecretKey: config.binanceSecretKey ? '***' : 'MISSING',
      etherscanApiKey: config.etherscanApiKey ? `***${config.etherscanApiKey.slice(-4)}` : 'MISSING',
      coingeckoApiKey: config.coingeckoApiKey ? `***${config.coingeckoApiKey.slice(-4)}` : 'OPTIONAL'
    };

    Logger.info('Configuration loaded', masked);
  }
}

// Load configuration once at module load
let globalConfig: Config | null = null;

export function getConfig(): Config {
  if (!globalConfig) {
    globalConfig = ConfigValidator.loadConfig();
    ConfigValidator.validate(globalConfig);
    ConfigValidator.logConfig(globalConfig);
  }
  return globalConfig;
}

export function resetConfig(): void {
  globalConfig = null;
}

export default ConfigValidator;
