# Example Outputs — Crypto Investment Advisor

Generated: 2026-09-18T07:57:07

This document shows the **expected output format** from each analyzer when APIs are connected.

## 1. Technical Signals (Top 100 Coins)

```json
{
  "timestamp": "2026-09-18T07:57:07.602212",
  "signals": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "price": 36500.0,
      "market_cap_usd": 720000000000,
      "volume_24h_usd": 18000000000,
      "rsi_14": 28.5,
      "macd": {
        "macdLine": 450.25,
        "signalLine": 380.1,
        "histogram": 70.15
      },
      "sma_20": 35800.0,
      "sma_50": 35200.0,
      "sma_200": 34500.0,
      "trend": "UPTREND",
      "support_levels": [35500, 34800, 33500],
      "resistance_levels": [37000, 38200, 39500],
      "signal": "STRONG_BUY",
      "confidence_percent": 85,
      "reasons": [
        "Oversold (RSI < 30) with bullish MACD",
        "Price recovered above SMA-20",
        "Volume spike detected (1.5x average)"
      ],
      "target_price": 39000.0,
      "stop_loss": 35200.0,
      "take_profit": 45500.0,
      "price_change_24h_percent": 2.45,
      "price_change_7d_percent": -1.2
    }
  ]
}
```

**Fields explained:**
- `rsi_14`: Relative Strength Index (0-100, < 30 = oversold, > 70 = overbought)
- `macd`: Moving Average Convergence Divergence (trend following indicator)
- `sma_*`: Simple Moving Averages (20, 50, 200 day)
- `signal`: Recommendation (STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL)
- `confidence_percent`: How confident is this signal (0-100)

---

## 2. Altcoin Opportunities (New Tokens < 30 days)

```json
{
  "timestamp": "2026-09-18T07:57:07.602350",
  "scan_completed": true,
  "total_scanned": 1250,
  "opportunities_found": 15,
  "altcoins": [
    {
      "rank": 1,
      "symbol": "NEWGEM",
      "name": "New Gem Token",
      "token_address": "0x1234567890abcdef1234567890abcdef12345678",
      "chain": "ethereum",
      "age_days": 18,
      "price_usd": 0.0145,
      "liquidity_usd": 850000,
      "volume_24h_usd": 420000,
      "market_cap_usd": 14500000,
      "total_supply": 1000000000,
      "circulating_supply": 850000000,
      "burn_percentage": 15,
      "lock_duration_days": 365,
      "top_10_concentration_percent": 22.5,
      "overall_score": 78,
      "recommendation": "BUY",
      "risk_level": "MEDIUM",
      "confidence_percent": 75,
      "strengths": [
        "Young token with strong growth potential",
        "Reasonable holder concentration (< 25%)",
        "Locked team tokens (30%)"
      ],
      "red_flags": [],
      "price_change_7d_percent": 45.2,
      "breakout_status": "BULLISH_BREAKOUT"
    }
  ]
}
```

**Scoring breakdown (0-100):**
- Tokenomics (30%): Supply, circulation %, burn rate
- Liquidity (25%): Pool depth, lock duration
- Holder Distribution (20%): Concentration risk
- Volume (15%): 24h, 7d momentum
- Community (10%): Growth signals

**Risk levels:**
- LOW: Score > 80, verified contract, < 25% top-10
- MEDIUM: Score 65-80, reasonable concentration
- HIGH: Score 50-65, some red flags
- EXTREME: Score < 50, multiple risk factors

---

## 3. Whale Activity Monitoring

```json
{
  "timestamp": "2026-09-18T07:57:07.602444",
  "chain": "ethereum",
  "recent_movements": [
    {
      "token_symbol": "BTC",
      "amount": 2.5,
      "usd_value": 912500.0,
      "type": "EXCHANGE_TO_WHALE",
      "classification": "Accumulation",
      "impact": "BULLISH",
      "significance": "Whale accumulating 2.5 BTC from exchange (cold storage move)"
    },
    {
      "token_symbol": "ETH",
      "amount": 500.5,
      "usd_value": 1101100.0,
      "type": "WHALE_TO_EXCHANGE",
      "classification": "Distribution",
      "impact": "BEARISH",
      "significance": "Major whale distributing 500 ETH to exchange"
    }
  ]
}
```

**Movement types:**
- **Accumulation** (Bullish): Whale moving from exchange to cold storage
- **Distribution** (Bearish): Whale moving from cold storage to exchange
- **Exchange-to-Exchange**: Large movements between trading venues

---

## 4. Daily Briefing Report (7 AM)

```json
{
  "report_date": "2026-09-18",
  "report_time": "07:00 AM",
  "summary": {
    "total_signals": 47,
    "buy_signals": 12,
    "sell_signals": 5,
    "hold_signals": 30,
    "altcoins_discovered": 3,
    "whale_movements": 8
  },
  "top_5_buy_opportunities": [
    {
      "symbol": "BTC",
      "score": 85,
      "target": "$39,000",
      "entry": "$36,500"
    },
    {
      "symbol": "NEWGEM",
      "score": 78,
      "target": "$0.025",
      "entry": "$0.0145"
    }
  ],
  "alerts": [
    {
      "type": "WHALE_ACCUMULATION",
      "coin": "BTC",
      "signal": "BULLISH"
    },
    {
      "type": "ALTCOIN_LAUNCH",
      "coin": "NEWGEM",
      "score": "78/100",
      "signal": "BUY"
    }
  ]
}
```

**Report components:**
- Summary counts of all signal types
- Top 5 ranked buy opportunities with price targets
- Consolidated alerts (whale activity + new launches)
- Delivered daily at 7 AM via WhatsApp/Email

---

## How These Outputs Are Generated

1. **Technical Signals**
   - Fetches 90-day OHLCV from Binance
   - Calculates RSI, MACD, SMA indicators
   - Identifies support/resistance levels
   - Generates buy/sell signals with confidence

2. **Altcoin Opportunities**
   - Scans DEX aggregators (1inch, 0x) for new pools
   - Fetches contract data from Etherscan
   - Analyzes token holders and supply
   - Scores each token on 5 dimensions
   - Identifies red flags (honey pots, unverified, etc.)

3. **Whale Activity**
   - Monitors large transactions (> $100K)
   - Classifies movement type (accumulation vs distribution)
   - Assesses on-chain impact (bullish vs bearish)
   - Alerts when whales move significant amounts

4. **Daily Report**
   - Aggregates all above signals
   - Ranks top opportunities
   - Consolidates alerts into brief
   - Sends via WhatsApp at 7 AM

---

## When Will You See These Outputs?

✅ **After OPTION B is complete:**
1. Testes validaram estruturas de dados
2. You provide API keys (CoinGecko, Binance, Etherscan, etc.)
3. I integrate APIs (1-2 hours)
4. Deploy cron jobs (hourly signals, 4-hourly altcoins, daily briefing)
5. System generates real data from actual blockchain/market data

---

**Status**: Example outputs validated ✅  
**Next step**: Provide your API keys for live integration
