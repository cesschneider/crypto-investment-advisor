# Crypto Investment Advisor — Project Agents

## Overview

Automated cryptocurrency investment analysis system with **aggressive long-term positioning** in both established coins (top 100) and emerging altcoins (< 30 days old).

## Core Agents

| Agent | Purpose | Trigger | Output |
|-------|---------|---------|--------|
| **Signal Analyzer** | Technical analysis (RSI, MACD, MA) on top 100 coins | Hourly | Buy/sell signals with confidence |
| **Altcoin Hunter** | Scan for new DEX listings & token launches | Every 4h | Ranked opportunity list (0-100 score) |
| **On-Chain Scout** | Monitor whale transfers, contract deployments | Real-time | Risk alerts, accumulation zones |
| **Tokenomics Auditor** | Supply, lock duration, burn rate, vesting analysis | Per token | Risk score + fundamentals report |
| **Report Generator** | Consolidate daily findings into actionable brief | Daily 7 AM | Email + webhook alert |

## Data Flow

```
APIs (CoinGecko, Binance, Etherscan, 1inch, Dune)
    ↓
Signal Analyzer (hourly) → Signals DB
    ↓
Altcoin Hunter (4h) → Opportunities DB
    ↓
On-Chain Scout (real-time) → Risk Alerts
    ↓
Report Generator (daily) → Dashboard + Email + Webhook
```

## Files & Responsibilities

- **src/analyzers/technical.ts** — RSI, MACD, moving average calculations
- **src/analyzers/onchain.ts** — Whale tracking, contract verification
- **src/analyzers/altcoin.ts** — New token discovery & scoring
- **src/services/coingecko.ts** — Market cap, price, volume
- **src/services/binance.ts** — OHLCV, orderbook, real volumes
- **src/services/etherscan.ts** — Contract interactions, holder tracking
- **scripts/monitor-signals.ts** — Main monitoring loop
- **scripts/generate-report.ts** — Daily brief generation
- **.env** — All API credentials (to be provided)

## Configuration

- **Analysis interval**: 60 minutes (top coins), 4 hours (altcoins)
- **Min. market cap**: $1M (filter noise)
- **Min. volume**: $500K 24h (liquidity requirement)
- **RSI thresholds**: < 30 oversold, > 70 overbought
- **Hold period**: Medium-term (weeks to months)

## Status

✅ **Structure complete** — awaiting API keys
⏳ **Next**: Implement analyzers, integrate APIs, deploy monitoring

---

See README.md for quick start.
