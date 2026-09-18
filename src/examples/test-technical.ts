/**
 * Example: Test Technical Analysis on Mock Data
 * 
 * Run with: npx ts-node src/examples/test-technical.ts
 */

import TechnicalAnalyzer from '../analyzers/technical';

// Mock Bitcoin price data (last 100 days of closes)
const mockBTCPrices = [
  27000, 27150, 27300, 27200, 27450, 27600, 27500, 27700, 27900, 28100,
  28200, 28050, 28300, 28400, 28250, 28500, 28600, 28700, 28550, 28900,
  29000, 28800, 29100, 29300, 29200, 29450, 29600, 29500, 29800, 30000,
  30200, 30100, 30300, 30500, 30400, 30650, 30700, 30800, 30900, 31000,
  31200, 31100, 31300, 31400, 31250, 31500, 31600, 31700, 31600, 31800,
  31900, 32000, 32100, 32200, 32300, 32500, 32400, 32600, 32700, 32800,
  32900, 33000, 33100, 33200, 33150, 33300, 33400, 33300, 33500, 33600,
  33700, 33800, 33900, 34000, 34100, 34200, 34300, 34400, 34500, 34600,
  34700, 34800, 34900, 35000, 35100, 35200, 35300, 35400, 35500, 35600,
  35700, 35800, 35900, 36000, 36100, 36200, 36300, 36400, 36500, 36600
];

console.log('🔍 Bitcoin Technical Analysis Example\\n');
console.log('='.repeat(60));

// Calculate RSI
const rsi = TechnicalAnalyzer.calculateRSI(mockBTCPrices);
console.log(`📊 RSI(14): ${rsi}`);
if (rsi < 30) console.log('   → OVERSOLD (potential buy)');
else if (rsi > 70) console.log('   → OVERBOUGHT (potential sell)');
else console.log('   → NEUTRAL');

// Calculate MACD
const macd = TechnicalAnalyzer.calculateMACD(mockBTCPrices);
console.log(`\\n📈 MACD:`);
console.log(`   MACD Line: ${macd.macdLine}`);
console.log(`   Signal Line: ${macd.signalLine}`);
console.log(`   Histogram: ${macd.histogram}`);
if (macd.histogram > 0) console.log('   → BULLISH');
else console.log('   → BEARISH');

// Calculate Moving Averages
const sma20 = TechnicalAnalyzer.calculateSMA(mockBTCPrices, 20);
const sma50 = TechnicalAnalyzer.calculateSMA(mockBTCPrices, 50);
const sma200 = TechnicalAnalyzer.calculateSMA(mockBTCPrices, 200);

console.log(`\\n⚡ Moving Averages:`);
console.log(`   SMA-20: $${sma20}`);
console.log(`   SMA-50: $${sma50}`);
console.log(`   SMA-200: $${sma200}`);

// Analyze Trend
const trend = TechnicalAnalyzer.analyzeTrend(mockBTCPrices, sma20, sma50, sma200);
console.log(`\\n🎯 Trend: ${trend}`);

// Generate Signal
const currentPrice = mockBTCPrices[mockBTCPrices.length - 1];
const volumeAvg = 50000000; // Mock average volume
const volume24h = 55000000;  // Mock 24h volume

const signal = TechnicalAnalyzer.generateSignal({
  rsi,
  macd,
  trend,
  price: currentPrice,
  sma20,
  sma50,
  volume24h,
  volumeAvg
});

console.log(`\\n🚀 Trading Signal:`);
console.log(`   Signal: ${signal.signal}`);
console.log(`   Confidence: ${signal.confidence}%`);
console.log(`   Reasons:`);
signal.reasons.forEach(reason => console.log(`     • ${reason}`));

console.log(`\\n${'='.repeat(60)}`);
console.log(`Current Price: $${currentPrice}`);
console.log(`Price Change (from start): ${(((currentPrice - mockBTCPrices[0]) / mockBTCPrices[0]) * 100).toFixed(2)}%`);
console.log(`\\n✅ Example analysis complete!`);
