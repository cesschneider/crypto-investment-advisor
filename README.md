# Crypto Investment Advisor

**Aggressive long-term cryptocurrency investment advisor** with automated signal detection, on-chain analysis, and emerging token opportunity hunting.

## 🎯 Core Features

1. **Established Coin Analysis** (Top 100)
   - Real-time technical signals (RSI, MACD, Moving Averages)
   - Volume anomaly detection
   - Support/Resistance identification
   - Buy/Sell recommendations with confidence scores

2. **Altcoin Discovery** (< 30 days old)
   - New DEX listings detection
   - Liquidity pool analysis
   - Holder concentration & whale activity
   - Burn rate & tokenomics scoring

3. **On-Chain Intelligence**
   - Large transaction monitoring (whales)
   - Smart contract verification status
   - Initial liquidity & lock duration
   - Token creator reputation scoring

4. **Automated Reporting**
   - Daily opportunity alerts
   - Real-time signal notifications
   - Historical trade performance tracking
   - Risk-adjusted position sizing

## 📊 Architecture

```
src/
├── analyzers/          # Core analysis engines
│   ├── technical.ts    # RSI, MACD, moving averages
│   ├── onchain.ts      # Blockchain data, whale tracking
│   ├── altcoin.ts      # New token analysis
│   └── tokenomics.ts   # Supply, lock, burn analysis
├── strategies/         # Trading signal strategies
│   ├── swing.ts        # Medium-term swing trades
│   ├── momentum.ts     # Momentum-based entries
│   └── contrarian.ts   # Counter-trend opportunities
├── alerts/            # Notification & reporting
│   ├── webhook.ts     # Discord/Telegram webhooks
│   ├── email.ts       # Email alerts
│   └── dashboard.ts   # Web dashboard updates
└── services/
    ├── coingecko.ts   # CoinGecko API wrapper
    ├── binance.ts     # Binance data & trading
    ├── etherscan.ts   # Ethereum on-chain data
    └── dex.ts        # DEX aggregator queries
```

## 🚀 Quick Start

```bash
# 1. Clone & install
cd /root/projects/crypto-investment-advisor
npm install

# 2. Configure APIs
cp .env.example .env
# Edit .env with your API keys

# 3. Run analysis
npm run analyze        # Single analysis run
npm run monitor        # Continuous monitoring
npm run scan-launches  # Find new token launches
npm run report         # Generate daily report
```

## 📈 Analysis Signals

### Buy Signals
- **RSI < 30** (oversold) + volume increase
- **MACD crossover** bullish + confirmed
- **Support break recovery** with volume
- **Whale accumulation** on-chain
- **New token** < 7 days with strong tokenomics

### Sell Signals
- **RSI > 70** (overbought)
- **MACD death cross**
- **Resistance rejection** 2x
- **Whale distribution** detected
- **Contract risk** identified

### Altcoin Scoring (0-100)
- **Tokenomics** (30%): lock duration, burn rate, vesting
- **Liquidity** (25%): pool depth, swap impact
- **Holders** (20%): concentration, team locks
- **Volume** (15%): 24h, 7d trends
- **Community** (10%): Twitter growth, engagement

## 🔌 API Requirements

| Service | Purpose | Cost |
|---------|---------|------|
| CoinGecko Pro | Market data, top coins | $10-50/mo |
| Binance API | OHLCV, volume, orderbook | Free |
| Etherscan | Ethereum on-chain data | Free-$15/mo |
| Solscan | Solana chain data | Free |
| DefiLlama | DeFi TVL, protocols | Free |
| 1inch | DEX aggregation | Free |

## 📡 Monitoring Schedule

```
Every 1 hour:
  - Refresh top 100 coin signals
  - Scan for new DEX listings
  - Check whale movements

Every 4 hours:
  - Deep altcoin analysis (< 30 days)
  - Update opportunity scores
  - Generate alerts

Every 24 hours:
  - Full historical analysis
  - Performance review
  - Generate daily report
```

## 💾 Data Storage

```
data/
├── signals/         # Current technical signals
├── opportunities/   # Ranked altcoins
├── history/        # Historical trades & analysis
└── alerts.log      # All triggered alerts
```

## 🎛 Configuration

Edit `config/analysis.json`:
```json
{
  "strategies": {
    "swing": { "enabled": true, "min_gain": "15%" },
    "momentum": { "enabled": true, "min_rsi_move": 20 },
    "contrarian": { "enabled": true, "max_mc": "$5M" }
  },
  "risk": {
    "max_position_size": "5%",
    "stop_loss": "8%",
    "take_profit": "25%"
  },
  "alerts": {
    "email": true,
    "webhook": true,
    "dashboard": true
  }
}
```

## 📋 Next Steps

1. ✅ Structure created
2. ⏳ Add API integrations (provide your keys)
3. ⏳ Implement analyzers
4. ⏳ Build cron job for monitoring
5. ⏳ Create Hermes skill

---

**Ready for API keys.** Paste them in .env and run `npm install`.
