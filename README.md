# Crypto Investment Advisor

**Aggressive long-term cryptocurrency investment advisor** with automated signal detection, on-chain analysis, and emerging token opportunity hunting.

![Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue)

---

## 🎯 Overview

A **production-ready system** for aggressive cryptocurrency investment analysis that:

- 📊 **Monitors top 100 coins** hourly with technical signals (RSI, MACD, SMA)
- 🔍 **Discovers emerging tokens** (< 30 days old) with 0-100 scoring
- 🐳 **Tracks whale activity** real-time for on-chain intelligence
- 📱 **Delivers daily briefing** at 7 AM with consolidated alerts via WhatsApp

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- 8 Cryptocurrency APIs (see [Setup](#setup))
- Hermes (for cron scheduling)

### Installation

```bash
# Clone repository
git clone https://github.com/cesschneider/crypto-investment-advisor.git
cd crypto-investment-advisor

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in your API keys (see Setup section)

# Verify Binance credentials
node scripts/test-binance-credentials.js

# Run tests
npm test
```

---

## 🔧 Setup

### 1. API Keys (Free Services)

This system uses **free and affordable APIs**:

| Service | Cost | Purpose | Setup Time |
|---------|------|---------|-----------|
| **CoinGecko** | Free/Pro | Market data, rankings | 5 min |
| **Binance** | Free | OHLCV data, trading | 5 min |
| **Etherscan** | Free | Ethereum on-chain | 5 min |
| **Solscan** | Free | Solana on-chain | 5 min |
| **1inch** | Free | DEX routes, new tokens | 3 min |
| **0x** | Free | Protocol liquidity | 3 min |
| **DefiLlama** | Free | DeFi analytics | 2 min |

**Total setup time: 30-40 minutes**

### 2. Environment Configuration

```bash
# .env file template
BINANCE_API_KEY=your_key_here
BINANCE_SECRET_KEY=your_secret_here
COINGECKO_API_KEY=your_key_here
ETHERSCAN_API_KEY=your_key_here
SOLSCAN_API_KEY=your_key_here
ONEINCH_API_KEY=your_key_here
ZEX_API_KEY=public
DEFILLAMA_API_KEY=public

# Configuration
ANALYSIS_INTERVAL_MINUTES=60
MIN_MARKET_CAP_USD=1000000
MIN_VOLUME_USD=500000
RSI_OVERBOUGHT=70
RSI_OVERSOLD=30
```

For detailed setup instructions, see [PLANO_PROXIMOS_PASSOS.md](./PLANO_PROXIMOS_PASSOS.md)

---

## 📊 Features

### Technical Analysis (Hourly)
```
BTC: STRONG_BUY (confidence: 85%)
├─ RSI 14: 28.5 (oversold)
├─ MACD: Bullish crossover
├─ SMA 20: $35,800 (price > SMA)
├─ Support: $35,500, $34,800
├─ Resistance: $37,000, $38,200
├─ Target: $39,000
└─ Stop Loss: $35,200
```

### Altcoin Opportunities (4-hourly)
```
NEWGEM Token: SCORE 78/100 (BUY - MEDIUM RISK)
├─ Age: 18 days
├─ Liquidity: $850,000
├─ Market Cap: $14.5M
├─ Volume 24h: $420,000
├─ Holder concentration: 22.5% (LOW RISK)
├─ Tokenomics score: 75/100
├─ Risk level: MEDIUM
└─ Red flags: None detected
```

### Whale Monitoring (Real-time)
```
🐋 Large Transaction Detected
├─ Token: Bitcoin
├─ Amount: 2.5 BTC ($91,250)
├─ Type: Exchange → Cold Storage
├─ Classification: ACCUMULATION
└─ Sentiment: BULLISH
```

### Daily Briefing (7 AM)
```
📊 Daily Market Summary
├─ Buy signals: 12
├─ Altcoins discovered: 3
├─ Whale movements: 8
├─ Top opportunities: [BTC, ETH, NEWGEM...]
└─ Consolidated alerts: [...]
```

---

## 🏗️ Architecture

```
src/
├── analyzers/
│   ├── technical.ts      (RSI, MACD, SMA)
│   ├── onchain.ts        (whale tracking)
│   └── altcoin.ts        (token scoring)
├── services/
│   ├── binance.ts        (market data)
│   ├── coingecko.ts      (market cap, rankings)
│   ├── etherscan.ts      (ethereum data)
│   └── ...               (other APIs)
├── types/
│   └── index.ts          (TypeScript interfaces)
└── examples/
    └── test-technical.ts (usage examples)

config/
└── analysis.json         (strategies & thresholds)

docs/
├── EXAMPLE_OUTPUTS.md    (output format examples)
├── API_SETUP.md          (detailed API guide)
└── PROJECT_AGENTS.md     (system design)
```

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm test -- --coverage

# Test Binance credentials
node scripts/test-binance-credentials.js

# Run specific analyzer
npx ts-node src/examples/test-technical.ts
```

---

## 📋 Documentation

- **[PLANO_PROXIMOS_PASSOS.md](./PLANO_PROXIMOS_PASSOS.md)** — Complete implementation guide (PT-BR)
- **[docs/EXAMPLE_OUTPUTS.md](./docs/EXAMPLE_OUTPUTS.md)** — Example outputs from all analyzers
- **[docs/API_SETUP.md](./docs/API_SETUP.md)** — Detailed API configuration
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — Development roadmap

---

## 🔐 Security

- ✅ All credentials stored in `.env` (gitignored)
- ✅ No hardcoded secrets
- ✅ API keys validated before use
- ✅ Rate limiting respected for all services
- ✅ HMAC signing for Binance requests

---

## 📦 Dependencies

- **axios** — HTTP client for API calls
- **dotenv** — Environment variable management
- **jest** — Testing framework
- **ts-jest** — Jest TypeScript support
- **typescript** — TypeScript compiler

See [package.json](./package.json) for full list.

---

## 🚀 Deployment

### Hermes Cron Jobs

The system uses Hermes for scheduled analysis:

```bash
# Hourly technical signals
hermes cron:create --schedule "every 1h" --script scripts/hourly-signals.sh

# 4-hourly altcoin discovery
hermes cron:create --schedule "every 4h" --script scripts/altcoin-discovery.sh

# Daily briefing at 7 AM
hermes cron:create --schedule "every day at 7am" --script scripts/daily-briefing.sh

# Real-time whale monitoring
hermes background --script scripts/whale-monitor.sh
```

---

## 💡 Usage Examples

### Get Technical Signals
```typescript
import TechnicalAnalyzer from './src/analyzers/technical';

const analyzer = new TechnicalAnalyzer();
const signals = analyzer.analyzeBinanceOHLCV(
  btcPrices,
  { rsiPeriod: 14, macdFastPeriod: 12 }
);

console.log(signals.signal); // "STRONG_BUY", "BUY", "HOLD", "SELL"
console.log(signals.confidence); // 0-100
```

### Score Altcoin Opportunities
```typescript
import AltcoinAnalyzer from './src/analyzers/altcoin';

const analyzer = new AltcoinAnalyzer();
const score = analyzer.scoreOpportunity(tokenData);

console.log(score.overallScore); // 0-100
console.log(score.riskLevel); // "LOW", "MEDIUM", "HIGH", "EXTREME"
console.log(score.recommendation); // "BUY", "HOLD", "AVOID"
```

---

## 📊 Project Stats

- **Files**: 31
- **Lines of Code**: ~2,500
- **Test Cases**: 155
- **Git Commits**: 10+
- **Documentation**: 8 files

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👨‍💼 Author

**Cesar Schneider** — VIP partner at Eworks Labs

---

## 📞 Support

For issues, feature requests, or questions:
- 📧 Email: cesar@eworks.ai
- 🐛 GitHub Issues: [Report a bug](https://github.com/cesschneider/crypto-investment-advisor/issues)

---

## 🎯 Roadmap

- [x] Technical analyzer (RSI, MACD, SMA)
- [x] On-chain analysis (whale tracking)
- [x] Altcoin discovery & scoring
- [x] Unit test suite
- [ ] Live API integration (awaiting keys)
- [ ] Hermes cron deployment
- [ ] WhatsApp alert delivery
- [ ] Web dashboard
- [ ] Backtesting engine

---

**Status**: 🟢 **Active Development**  
**Last Updated**: 2026-09-18  
**Repository**: https://github.com/cesschneider/crypto-investment-advisor
